import { NextApiRequest, NextApiResponse } from "next";
import { and, asc, desc, eq, gt, gte, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { isFlipped } from "@/helpers/asset.helper";
import { assets, exif, tags } from "@/schema";
import { CULL_TAG_NAMESPACE, PICK_TAG_NAME, REJECT_TAG_NAME, REVIEWED_TAG_NAME } from "@/config/constants/cull";

/**
 * Paginated asset feed for the Cull tool.
 *
 * Sources (mutually combinable): whole library (no params), album
 * (albumId), or capture-date range (startDate/endDate, on the camera-local
 * localDateTime like the album/potential-albums routes).
 *
 * Filters: star rating (exif.rating — Immich's native field; 0 is treated as
 * unrated, it's invalid as a rating since v3) via a value + comparator
 * (</>/=; no value + "=" means Unrated), pick status (Picked/Rejected tags —
 * see cull.handler.ts for why flags are tags and not the rating's -1 value,
 * multi-select), and reviewed state (a third, independent tag — not tied to
 * pick/reject, also multi-select).
 *
 * Server-side pagination is the point: the previous client fetched EVERY
 * page of an album before showing photo #1, which is exactly the slow-large-
 * album problem. Each row also carries rating + picked/rejected/reviewed/
 * favorite so the UI can render true persisted state in overlays/badges
 * without extra calls.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

  const {
    albumId,
    startDate,
    endDate,
    ratingValue,
    ratingComparator = "gt", // "lt" | "gt" | "eq" — how ratingValue is applied; "eq" with no value means Unrated
    flag = "", // comma-separated ICullPickStatus[]; empty = any
    reviewed = "", // comma-separated ICullReviewStatus[]; empty or both = any
    sortOrder = "desc",
    page = "1",
    limit = "200",
  } = req.query as Record<string, string>;

  const limitNum = Math.min(parseInt(limit, 10) || 200, 500);
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);

  // Resolve the user's Pick/Reject/Reviewed tag ids once (they may not exist
  // yet if nothing has ever been flagged — that's fine, EXISTS just goes
  // false). These are nested under CULL_TAG_NAMESPACE, so match on full value.
  const pickPath = `${CULL_TAG_NAMESPACE}/${PICK_TAG_NAME}`;
  const rejectPath = `${CULL_TAG_NAMESPACE}/${REJECT_TAG_NAME}`;
  const reviewedPath = `${CULL_TAG_NAMESPACE}/${REVIEWED_TAG_NAME}`;
  const tagRows = await db
    .select({ id: tags.id, value: tags.value })
    .from(tags)
    .where(and(eq(tags.userId, currentUser.id), sql`${tags.value} IN (${pickPath}, ${rejectPath}, ${reviewedPath})`));
  const pickTagId = tagRows.find((t) => t.value === pickPath)?.id ?? null;
  const rejectTagId = tagRows.find((t) => t.value === rejectPath)?.id ?? null;
  const reviewedTagId = tagRows.find((t) => t.value === reviewedPath)?.id ?? null;

  const taggedWith = (tagId: string) =>
    sql`EXISTS (SELECT 1 FROM "tag_asset" ta WHERE ta."assetId" = ${assets.id} AND ta."tagId" = ${tagId})`;
  const pickedExpr = pickTagId ? taggedWith(pickTagId) : sql`false`;
  const rejectedExpr = rejectTagId ? taggedWith(rejectTagId) : sql`false`;
  const reviewedExpr = reviewedTagId ? taggedWith(reviewedTagId) : sql`false`;

  const conditions: any[] = [
    eq(assets.ownerId, currentUser.id),
    eq(assets.visibility, "timeline"),
    eq(assets.status, "active"),
    isNull(assets.deletedAt),
  ];

  if (albumId) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM "album_asset" aa WHERE aa."assetId" = ${assets.id} AND aa."albumId" = ${albumId})`
    );
  }
  if (startDate) conditions.push(gte(assets.localDateTime, new Date(`${startDate}T00:00:00`)));
  if (endDate) {
    const endExclusive = new Date(`${endDate}T00:00:00`);
    endExclusive.setDate(endExclusive.getDate() + 1);
    conditions.push(lt(assets.localDateTime, endExclusive));
  }

  const ratingValueNum = ratingValue ? parseInt(ratingValue, 10) : null;
  if (ratingValueNum === null) {
    // No star selected: "=" reads as Unrated, "<"/">" mean no constraint (any).
    if (ratingComparator === "eq") conditions.push(sql`(${exif.rating} IS NULL OR ${exif.rating} <= 0)`);
  } else if (ratingValueNum >= 1 && ratingValueNum <= 5) {
    if (ratingComparator === "eq") conditions.push(eq(exif.rating, ratingValueNum));
    else if (ratingComparator === "lt") conditions.push(lt(exif.rating, ratingValueNum));
    else conditions.push(gt(exif.rating, ratingValueNum));
  }

  const flagValues = flag.split(",").filter(Boolean);
  if (flagValues.length && flagValues.length < 3) {
    conditions.push(
      or(
        ...flagValues.map((f) =>
          f === "picked" ? pickedExpr : f === "rejected" ? rejectedExpr : sql`(NOT ${pickedExpr} AND NOT ${rejectedExpr})`
        )
      )!
    );
  }

  const reviewedValues = reviewed.split(",").filter(Boolean);
  if (reviewedValues.length === 1) {
    conditions.push(reviewedValues[0] === "reviewed" ? reviewedExpr : sql`NOT ${reviewedExpr}`);
  }

  const rows = await db
    .select({
      id: assets.id,
      type: assets.type,
      ownerId: assets.ownerId,
      isFavorite: assets.isFavorite,
      duration: assets.duration,
      originalFileName: assets.originalFileName,
      localDateTime: assets.localDateTime,
      exifImageWidth: exif.exifImageWidth,
      exifImageHeight: exif.exifImageHeight,
      orientation: exif.orientation,
      rating: exif.rating,
      picked: sql<boolean>`${pickedExpr}`,
      rejected: sql<boolean>`${rejectedExpr}`,
      reviewed: sql<boolean>`${reviewedExpr}`,
      total: sql<number>`COUNT(*) OVER()::int`,
    })
    .from(assets)
    .leftJoin(exif, eq(exif.assetId, assets.id))
    .where(and(...conditions))
    .orderBy(
      sortOrder === "asc" ? asc(assets.localDateTime) : desc(assets.localDateTime),
      asc(assets.id)
    )
    .limit(limitNum)
    .offset((pageNum - 1) * limitNum);

  const total = rows.length ? Number(rows[0].total) : 0;
  const cleaned = rows.map(({ total: _t, ...a }) => ({
    ...a,
    exifImageWidth: isFlipped(a.orientation) ? a.exifImageHeight : a.exifImageWidth,
    exifImageHeight: isFlipped(a.orientation) ? a.exifImageWidth : a.exifImageHeight,
    // Normalize legacy 0 ratings to null so the UI has one "unrated" state.
    rating: a.rating && a.rating > 0 ? a.rating : null,
  }));

  return res.status(200).json({ assets: cleaned, total, hasNext: pageNum * limitNum < total });
}
