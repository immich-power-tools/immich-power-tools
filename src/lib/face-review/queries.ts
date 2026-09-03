/**
 * Face Review read queries. Ported from the standalone immich-face-review
 * tool's db.py, whose non-obvious behaviors were verified against a live
 * multi-user Immich v3 instance. Two rules carried over verbatim:
 *
 * 1. OWNER SCOPING IS MANDATORY. The person/asset tables are instance-wide;
 *    every query keyed by an id from the URL either takes ownerId or sits
 *    behind personOwnedBy(). Destructive ops fail closed without an owner.
 * 2. Trashed assets leave orphaned asset_face rows behind (Immich soft
 *    delete), which break API reassignment and skew centroid math — every
 *    query filters a."deletedAt" IS NULL.
 *
 * "Confidence" here = cosine distance from the person's centroid embedding
 * (Immich does not persist detection confidence; embeddings in face_search
 * are the only signal). Higher distance = less typical = review first.
 */
import { sql } from "drizzle-orm";

import { db } from "@/config/db";
import {
  clusterEmbeddings,
  DEFAULT_MAX_FACES,
  DEFAULT_MIN_CLUSTER_SIZE,
  DEFAULT_THRESHOLD,
} from "@/lib/face-review/cluster";
import { IFaceCluster, IFaceReviewFace, IFaceReviewScope } from "@/types/faceReview";

export const STRANGER_PREFIXES = ["Stranger ", "Rando "] as const;

/**
 * Only faces on assets the owner can actually SEE belong in review. Immich
 * v3 visibility states, verified against a live instance (thumbnail + asset
 * endpoints, owner's own credentials):
 *   timeline -> 200, archive -> 200, locked -> 400, hidden -> 404.
 * `locked` is the PIN-protected Locked Folder — deliberately concealed, so
 * surfacing even its face metadata here would be a privacy leak (and its
 * crops render as "load failed" since the thumbnail proxy 400s). `hidden`
 * is internal (e.g. motion-photo video parts). Archived photos stay fully
 * reviewable. This predicate must accompany EVERY join against asset.
 */
const VIEWABLE = sql`a.visibility IN ('timeline', 'archive')`;

const toDateStr = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const rowToFace = (r: any): IFaceReviewFace => ({
  faceId: r.face_id,
  assetId: r.asset_id,
  distance: r.distance === null || r.distance === undefined ? null : Math.round(+r.distance * 10000) / 10000,
  takenAt: toDateStr(r.taken_at),
  boundingBoxX1: r.x1, boundingBoxY1: r.y1, boundingBoxX2: r.x2, boundingBoxY2: r.y2,
  imageWidth: r.image_w, imageHeight: r.image_h,
  ...(r.cur_person_id !== undefined
    ? { curPersonId: r.cur_person_id, curName: (r.cur_name || "").trim() || null }
    : {}),
});

/** Gate for every person-scoped route: does this person belong to this owner? */
export async function personOwnedBy(personId: string, ownerId: string): Promise<boolean> {
  const { rows } = await db.execute(sql`
    SELECT 1 FROM person WHERE id = ${personId} AND "ownerId" = ${ownerId} LIMIT 1
  `);
  return rows.length > 0;
}

export async function getPersonMeta(personId: string, ownerId: string) {
  const { rows } = await db.execute(sql`
    SELECT p.name, p."birthDate" AS birth_date, p."isHidden" AS is_hidden,
           COUNT(a.id)::int AS face_count
      FROM person p
      LEFT JOIN asset_face af
        ON af."personId" = p.id AND af."isVisible" = true AND af."deletedAt" IS NULL
      LEFT JOIN asset a ON a.id = af."assetId" AND a."deletedAt" IS NULL AND ${VIEWABLE}
     WHERE p.id = ${personId} AND p."ownerId" = ${ownerId}
     GROUP BY p.id
  `);
  const r: any = rows[0];
  if (!r) return null;
  return {
    name: (r.name || "").trim(),
    birthDate: toDateStr(r.birth_date),
    isHidden: !!r.is_hidden,
    faceCount: +r.face_count,
  };
}

const CENTROID_CTE = (personId: string) => sql`
  WITH centroid AS (
    SELECT AVG(fs.embedding) AS c
      FROM asset_face af
      JOIN face_search fs ON fs."faceId" = af.id
      JOIN asset a ON a.id = af."assetId" AND a."deletedAt" IS NULL AND ${VIEWABLE}
     WHERE af."personId" = ${personId}
       AND af."isVisible" = true AND af."deletedAt" IS NULL
  )
`;

export type IRankedSort = "confidence" | "recent" | "oldest";

/**
 * A person's own faces for the Tagged Faces grid. sort=confidence ranks
 * least-typical first (centroid distance DESC); date sorts come straight
 * from the DB (the Flask tool needed an N+1 Immich-API fallback for these —
 * with drizzle in-process there's no reason to leave the DB).
 * prebirthOnly limits to faces on photos captured before person.birthDate
 * (camera-local date; UTC fileCreatedAt only as fallback).
 */
export async function getRankedFaces(
  personId: string,
  ownerId: string,
  opts: { page: number; perPage: number; sort: IRankedSort; prebirthOnly?: boolean }
): Promise<{ faces: IFaceReviewFace[]; total: number }> {
  const { page, perPage, sort, prebirthOnly } = opts;
  const orderBy =
    sort === "recent" ? sql`taken_at DESC NULLS LAST`
    : sort === "oldest" ? sql`taken_at ASC NULLS LAST`
    : sql`distance DESC NULLS LAST`;
  const prebirth = prebirthOnly
    ? sql`AND p."birthDate" IS NOT NULL
          AND COALESCE(a."localDateTime", a."fileCreatedAt")::date < p."birthDate"`
    : sql``;
  const { rows } = await db.execute(sql`
    ${CENTROID_CTE(personId)}
    SELECT af.id::text AS face_id, af."assetId"::text AS asset_id,
           (fs.embedding <=> centroid.c) AS distance,
           af."boundingBoxX1" AS x1, af."boundingBoxY1" AS y1,
           af."boundingBoxX2" AS x2, af."boundingBoxY2" AS y2,
           af."imageWidth" AS image_w, af."imageHeight" AS image_h,
           COALESCE(a."localDateTime", a."fileCreatedAt") AS taken_at,
           COUNT(*) OVER()::int AS total
      FROM asset_face af
      LEFT JOIN face_search fs ON fs."faceId" = af.id
      JOIN asset a ON a.id = af."assetId" AND a."deletedAt" IS NULL AND ${VIEWABLE} AND a."ownerId" = ${ownerId}
      JOIN person p ON p.id = af."personId"
      CROSS JOIN centroid
     WHERE af."personId" = ${personId}
       AND af."isVisible" = true AND af."deletedAt" IS NULL
       ${prebirth}
     ORDER BY ${orderBy}
     LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `);
  const total = rows.length ? +(rows[0] as any).total : 0;
  return { faces: rows.map(rowToFace), total };
}

interface EmbeddedFaceRow { face: IFaceReviewFace; emb: string }

async function fetchOwnFaceEmbeddings(personId: string, ownerId: string): Promise<EmbeddedFaceRow[]> {
  const { rows } = await db.execute(sql`
    ${CENTROID_CTE(personId)}
    SELECT af.id::text AS face_id, af."assetId"::text AS asset_id,
           (fs.embedding <=> centroid.c) AS distance,
           af."boundingBoxX1" AS x1, af."boundingBoxY1" AS y1,
           af."boundingBoxX2" AS x2, af."boundingBoxY2" AS y2,
           af."imageWidth" AS image_w, af."imageHeight" AS image_h,
           COALESCE(a."localDateTime", a."fileCreatedAt") AS taken_at,
           fs.embedding::text AS emb
      FROM asset_face af
      JOIN face_search fs ON fs."faceId" = af.id
      JOIN asset a ON a.id = af."assetId" AND a."deletedAt" IS NULL AND ${VIEWABLE} AND a."ownerId" = ${ownerId}
      CROSS JOIN centroid
     WHERE af."personId" = ${personId}
       AND af."isVisible" = true AND af."deletedAt" IS NULL
  `);
  return rows.map((r: any) => ({ face: rowToFace(r), emb: r.emb }));
}

function parseEmbeddings(rows: EmbeddedFaceRow[]): { M: Float32Array; d: number } {
  const first: number[] = JSON.parse(rows[0].emb);
  const d = first.length;
  const M = new Float32Array(rows.length * d);
  M.set(first, 0);
  for (let i = 1; i < rows.length; i++) {
    const v: number[] = JSON.parse(rows[i].emb);
    M.set(v, i * d);
  }
  return { M, d };
}

function toClusterList(
  groups: number[][],
  rows: EmbeddedFaceRow[],
  sortByMeanDistance: boolean
): IFaceCluster[] {
  const clusters = groups.map((group) => {
    const faces = group.map((i) => rows[i].face);
    const dists = faces.map((f) => f.distance).filter((x): x is number => x !== null);
    const meanDistance = dists.length
      ? Math.round((dists.reduce((a, b) => a + b, 0) / dists.length) * 10000) / 10000
      : null;
    return { size: faces.length, meanDistance, faces };
  });
  if (sortByMeanDistance) {
    clusters.sort((a, b) => (a.meanDistance ?? Infinity) - (b.meanDistance ?? Infinity));
  }
  return clusters.map((c, idx) => ({ index: idx + 1, ...c }));
}

/**
 * Cluster a person's OWN faces by mutual similarity — catches a wrongly-
 * merged different person as a tight sub-group, the one failure mode
 * centroid-distance ranking structurally can't see (a wrong sub-group big
 * enough shifts the centroid toward itself).
 */
export async function getPersonClusters(
  personId: string,
  ownerId: string,
  opts?: { threshold?: number; minClusterSize?: number; maxFaces?: number }
): Promise<{ clusters: IFaceCluster[]; singletonCount: number; totalFaces: number; threshold: number }> {
  const threshold = opts?.threshold ?? DEFAULT_THRESHOLD;
  const rows = await fetchOwnFaceEmbeddings(personId, ownerId);
  if (rows.length < 2) {
    return { clusters: [], singletonCount: rows.length, totalFaces: rows.length, threshold };
  }
  const { M, d } = parseEmbeddings(rows);
  const { clusters, singletonCount } = await clusterEmbeddings(M, rows.length, d, {
    threshold,
    minClusterSize: opts?.minClusterSize ?? DEFAULT_MIN_CLUSTER_SIZE,
    maxFaces: opts?.maxFaces ?? DEFAULT_MAX_FACES,
  });
  // Own-face clusters: biggest first (engine default order).
  return { clusters: toClusterList(clusters, rows, false), singletonCount, totalFaces: rows.length, threshold };
}

const scopeCondition = (scope: IFaceReviewScope) =>
  scope === "named"
    ? // ONLY faces already assigned to another real-named person (not
      // empty-name, not a Stranger/Rando split-off): candidates whose "yes"
      // explicitly moves them away from someone else.
      sql`AND af."personId" IS NOT NULL AND p.name <> ''
          AND p.name NOT LIKE ${STRANGER_PREFIXES[0] + "%"}
          AND p.name NOT LIKE ${STRANGER_PREFIXES[1] + "%"}`
    : // Unknown faces only: unassigned, empty-name person, or a stranger.
      sql`AND (af."personId" IS NULL OR p.name = ''
           OR p.name LIKE ${STRANGER_PREFIXES[0] + "%"}
           OR p.name LIKE ${STRANGER_PREFIXES[1] + "%"})`;

const candidateSelect = (personId: string, ownerId: string, scope: IFaceReviewScope, excludeIds: string[]) => sql`
  ${CENTROID_CTE(personId)}
  SELECT af.id::text AS face_id, af."assetId"::text AS asset_id,
         (fs.embedding <=> centroid.c) AS distance,
         af."boundingBoxX1" AS x1, af."boundingBoxY1" AS y1,
         af."boundingBoxX2" AS x2, af."boundingBoxY2" AS y2,
         af."imageWidth" AS image_w, af."imageHeight" AS image_h,
         af."personId"::text AS cur_person_id, p.name AS cur_name,
         COALESCE(a."localDateTime", a."fileCreatedAt") AS taken_at,
         fs.embedding::text AS emb
    FROM asset_face af
    JOIN face_search fs ON fs."faceId" = af.id
    JOIN asset a ON a.id = af."assetId" AND a."deletedAt" IS NULL AND ${VIEWABLE} AND a."ownerId" = ${ownerId}
    LEFT JOIN person p ON p.id = af."personId"
    CROSS JOIN centroid
   WHERE af."isVisible" = true AND af."deletedAt" IS NULL
     AND af."personId" IS DISTINCT FROM ${personId}::uuid
     AND centroid.c IS NOT NULL
     ${excludeIds.length
       // Bound as one JSON string: drizzle/node-postgres array binding
       // doesn't produce a valid uuid[] literal here, so unpack server-side.
       ? sql`AND af.id <> ALL(ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(excludeIds)}::jsonb)::uuid))`
       : sql``}
     ${scopeCondition(scope)}
   ORDER BY distance ASC
`;

/**
 * "Find more of this person": faces NOT currently this person, ranked by
 * distance to the person's centroid, closest (most likely) first. An exact
 * scan on purpose — the ANN index returns too few rows once the person's own
 * faces (the true nearest neighbours) are excluded. ~0.6s over ~45k faces.
 * excludeIds carries the reviewer's browser-local reject list.
 */
export async function getCandidateFaces(
  personId: string,
  ownerId: string,
  opts: { scope: IFaceReviewScope; excludeIds: string[]; limit: number; offset: number }
): Promise<{ candidates: IFaceReviewFace[]; hasNext: boolean }> {
  const { rows } = await db.execute(sql`
    SELECT * FROM (${candidateSelect(personId, ownerId, opts.scope, opts.excludeIds)}) q
    LIMIT ${opts.limit + 1} OFFSET ${opts.offset}
  `);
  const hasNext = rows.length > opts.limit;
  return { candidates: rows.slice(0, opts.limit).map(rowToFace), hasNext };
}

export const CANDIDATE_POOL_SIZE = 2000;

/**
 * Cluster the closest CANDIDATE faces by similarity to EACH OTHER — surfaces
 * a missed relative sitting in the pool as many separate photos as one group
 * instead of many Yes/No decisions. Deliberately partial: only the closest
 * poolSize candidates (full pool would be O(45k^2)); clusters sorted by mean
 * distance ascending (most-likely first, unlike own-face clusters).
 */
export async function getCandidateClusters(
  personId: string,
  ownerId: string,
  opts: { scope: IFaceReviewScope; excludeIds: string[]; threshold?: number; minClusterSize?: number; poolSize?: number }
): Promise<{ clusters: IFaceCluster[]; singletonCount: number; poolSize: number; threshold: number }> {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const poolSize = opts.poolSize ?? CANDIDATE_POOL_SIZE;
  const { rows } = await db.execute(sql`
    SELECT * FROM (${candidateSelect(personId, ownerId, opts.scope, opts.excludeIds)}) q
    LIMIT ${poolSize}
  `);
  const embedded: EmbeddedFaceRow[] = rows.map((r: any) => ({ face: rowToFace(r), emb: r.emb }));
  if (embedded.length < 2) {
    return { clusters: [], singletonCount: embedded.length, poolSize: embedded.length, threshold };
  }
  const { M, d } = parseEmbeddings(embedded);
  const { clusters, singletonCount } = await clusterEmbeddings(M, embedded.length, d, {
    threshold,
    minClusterSize: opts.minClusterSize ?? DEFAULT_MIN_CLUSTER_SIZE,
    // poolSize bounds n already; no separate maxFaces ceiling here.
    maxFaces: poolSize,
  });
  return {
    clusters: toClusterList(clusters, embedded, true),
    singletonCount,
    poolSize: embedded.length,
    threshold,
  };
}

export type IFaceReviewPeopleFilter = "all" | "named" | "unnamed" | "strangers" | "hidden" | "prebirth";

/** Landing-grid list: this owner's people with visible face counts. */
export async function getPeopleWithCounts(
  ownerId: string,
  filter: IFaceReviewPeopleFilter
): Promise<{ id: string; name: string; birthDate: string | null; isHidden: boolean; faceCount: number; prebirthCount?: number }[]> {
  const nameFilter =
    filter === "named"
      ? sql`AND p.name <> '' AND p.name NOT LIKE ${STRANGER_PREFIXES[0] + "%"} AND p.name NOT LIKE ${STRANGER_PREFIXES[1] + "%"}`
      : filter === "unnamed" ? sql`AND p.name = ''`
      : filter === "strangers"
      ? sql`AND (p.name LIKE ${STRANGER_PREFIXES[0] + "%"} OR p.name LIKE ${STRANGER_PREFIXES[1] + "%"})`
      : sql``;
  // Hidden people are excluded everywhere except the explicit hidden view.
  const hiddenFilter = filter === "hidden" ? sql`AND p."isHidden" = true` : sql`AND p."isHidden" = false`;
  const prebirthJoin =
    filter === "prebirth"
      ? sql`AND p."birthDate" IS NOT NULL AND COALESCE(a."localDateTime", a."fileCreatedAt")::date < p."birthDate"`
      : sql``;
  // face_count = COUNT(a.id): visible faces on live (non-trashed) assets.
  // Under the prebirth filter the asset join narrows to pre-birth-date
  // photos, so the count becomes "prebirth faces" and empty people drop out;
  // other views keep zero-face people visible (that's what "Delete empty
  // people" acts on).
  const { rows } = await db.execute(sql`
    SELECT p.id::text AS id, p.name, p."birthDate" AS birth_date, p."isHidden" AS is_hidden,
           COUNT(a.id)::int AS face_count
      FROM person p
      LEFT JOIN asset_face af
        ON af."personId" = p.id AND af."isVisible" = true AND af."deletedAt" IS NULL
      LEFT JOIN asset a ON a.id = af."assetId" AND a."deletedAt" IS NULL AND ${VIEWABLE} ${prebirthJoin}
     WHERE p."ownerId" = ${ownerId} ${nameFilter} ${hiddenFilter}
     GROUP BY p.id
    ${filter === "prebirth" ? sql`HAVING COUNT(a.id) > 0` : sql``}
     ORDER BY face_count DESC, p.name ASC
  `);
  return rows.map((r: any) => ({
    id: r.id,
    name: (r.name || "").trim(),
    birthDate: toDateStr(r.birth_date),
    isHidden: !!r.is_hidden,
    faceCount: +r.face_count,
  }));
}

/** Autocomplete source + name resolution: the owner's REAL-named people. */
export async function getNamedPeople(ownerId: string): Promise<{ id: string; name: string }[]> {
  const { rows } = await db.execute(sql`
    SELECT p.id::text AS id, p.name
      FROM person p
     WHERE p."ownerId" = ${ownerId} AND p.name <> ''
       AND p.name NOT LIKE ${STRANGER_PREFIXES[0] + "%"}
       AND p.name NOT LIKE ${STRANGER_PREFIXES[1] + "%"}
     ORDER BY LOWER(p.name) ASC
  `);
  return rows.map((r: any) => ({ id: r.id, name: (r.name || "").trim() }));
}

/**
 * Hide a detection that isn't a real face (statue, pet, blur): what Immich
 * does internally for hidden faces (isVisible=false + detach) — reversible,
 * unlike the REST DELETE /faces/{id}, which the source tool never got
 * live-confirmed. Owner-scoped through the face's asset; PER-FACE only by
 * design (the removed bulk variant was the accident risk).
 * Returns false for an unknown/foreign face (no write).
 */
export async function hideFace(faceId: string, ownerId: string): Promise<boolean> {
  if (!ownerId) throw new Error("ownerId required (multi-user DB, refusing unscoped update)");
  const result = await db.execute(sql`
    UPDATE asset_face af
       SET "isVisible" = false, "personId" = NULL
      FROM asset a
     WHERE af.id = ${faceId}
       AND a.id = af."assetId"
       AND a."ownerId" = ${ownerId}
       AND a."deletedAt" IS NULL
  `);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Delete the owner's person records with zero visible, non-deleted faces —
 * the debris failed/retried reassigns leave behind. ownerId REQUIRED (an
 * unscoped delete on the shared table would hit other users' records).
 */
export async function deleteEmptyPeople(ownerId: string): Promise<number> {
  if (!ownerId) throw new Error("ownerId required (multi-user DB, refusing unscoped delete)");
  const result = await db.execute(sql`
    DELETE FROM person
     WHERE id IN (
       SELECT p.id FROM person p
        WHERE p."ownerId" = ${ownerId}
          AND NOT EXISTS (
            SELECT 1 FROM asset_face af
             WHERE af."personId" = p.id
               AND af."isVisible" = true
               AND af."deletedAt" IS NULL
          )
     )
  `);
  return result.rowCount ?? 0;
}

/**
 * Whether a person already has Immich's feature-face pointer set, plus one
 * of their own visible faces' assetId to use as a fallback if not. See
 * ensurePersonThumbnail() in actions.ts for why this is needed.
 */
export async function getFeatureFaceStatus(
  personId: string,
  ownerId: string
): Promise<{ hasFeatureFace: boolean; sampleAssetId: string | null }> {
  const { rows } = await db.execute(sql`
    SELECT p."faceAssetId" IS NOT NULL AS has_feature_face,
           (SELECT af."assetId"::text
              FROM asset_face af
              JOIN asset a ON a.id = af."assetId" AND a."deletedAt" IS NULL AND ${VIEWABLE} AND a."ownerId" = ${ownerId}
             WHERE af."personId" = p.id AND af."isVisible" = true AND af."deletedAt" IS NULL
             LIMIT 1) AS sample_asset_id
      FROM person p
     WHERE p.id = ${personId} AND p."ownerId" = ${ownerId}
  `);
  const r: any = rows[0];
  return { hasFeatureFace: !!r?.has_feature_face, sampleAssetId: r?.sample_asset_id ?? null };
}

/** Exact-name match among the owner's people (case-insensitive). */
export async function findPersonByName(ownerId: string, name: string): Promise<string | null> {
  const { rows } = await db.execute(sql`
    SELECT p.id::text AS id FROM person p
     WHERE p."ownerId" = ${ownerId} AND LOWER(TRIM(p.name)) = LOWER(TRIM(${name}))
     LIMIT 1
  `);
  return rows.length ? (rows[0] as any).id : null;
}
