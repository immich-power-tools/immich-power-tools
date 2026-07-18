import { SQL, and, or, eq, ne, gte, lte, isNull, sql } from "drizzle-orm";
import { assets } from "@/schema/assets.schema";
import { exif } from "@/schema";
import { ICondition, IConditionMatch } from "@/types/workflow";
import { subDays } from "date-fns";

export function buildConditions(
  conditions: ICondition[],
  ownerId: string,
  match: IConditionMatch = "all",
): SQL[] {
  // These four are NON-NEGOTIABLE and always ANDed. They must never be folded
  // into the OR group below — under "match any" that would make a single
  // matching user condition pull in other owners' / trashed / archived assets.
  const base: SQL[] = [
    eq(assets.ownerId, ownerId),
    eq(assets.visibility, "timeline"),
    eq(assets.status, "active"),
    isNull(assets.deletedAt),
  ];

  const userClauses: SQL[] = [];
  for (const c of conditions) {
    const clause = buildSingleCondition(c);
    if (clause) userClauses.push(clause);
  }

  if (userClauses.length === 0) return base;
  // "any" => OR the user's conditions together as ONE clause, still ANDed
  // against the base scoping. "all" (default) keeps the historical behavior.
  return match === "any" ? [...base, or(...userClauses)!] : [...base, ...userClauses];
}

function buildSingleCondition(c: ICondition): SQL | undefined {
  switch (c.type) {
    case "city":
      return c.match === "not_equals"
        ? ne(exif.city, c.city)
        : eq(exif.city, c.city);

    case "state":
      return c.match === "not_equals"
        ? ne(exif.state, c.state)
        : eq(exif.state, c.state);

    case "country":
      return c.match === "not_equals"
        ? ne(exif.country, c.country)
        : eq(exif.country, c.country);

    case "camera_make":
      return eq(exif.make, c.make);

    case "camera_model":
      return eq(exif.model, c.model);

    case "lens":
      return eq(exif.lensModel, c.lensModel);

    case "asset_type":
      return eq(assets.type, c.assetType || "IMAGE");

    case "is_favorited":
      return eq(assets.isFavorite, c.value !== false);

    case "date_range": {
      const parts: SQL[] = [];
      if (c.after) parts.push(gte(exif.dateTimeOriginal, new Date(c.after)));
      if (c.before) parts.push(lte(exif.dateTimeOriginal, new Date(c.before)));
      return parts.length > 0 ? and(...parts)! : undefined;
    }

    case "date_relative":
      if (c.lastDays) {
        return gte(exif.dateTimeOriginal, subDays(new Date(), c.lastDays));
      }
      return undefined;

    case "day_of_week":
      if (c.days && c.days.length > 0) {
        return sql`EXTRACT(DOW FROM ${exif.dateTimeOriginal}) IN (${sql.raw(c.days.join(","))})`;
      }
      return undefined;

    case "iso_range": {
      const parts: SQL[] = [];
      if (c.min !== undefined) parts.push(gte(exif.iso, c.min));
      if (c.max !== undefined) parts.push(lte(exif.iso, c.max));
      return parts.length > 0 ? and(...parts)! : undefined;
    }

    case "focal_length": {
      const parts: SQL[] = [];
      if (c.min !== undefined) parts.push(gte(exif.focalLength, c.min));
      if (c.max !== undefined) parts.push(lte(exif.focalLength, c.max));
      return parts.length > 0 ? and(...parts)! : undefined;
    }

    case "rating": {
      const parts: SQL[] = [];
      if (c.min !== undefined) parts.push(gte(exif.rating, c.min));
      if (c.max !== undefined) parts.push(lte(exif.rating, c.max));
      return parts.length > 0 ? and(...parts)! : undefined;
    }

    case "resolution": {
      // Short/long edge are orientation-agnostic; megapixels = width × height / 1e6.
      const metric = c.metric || "megapixels";
      const value =
        metric === "short_edge"
          ? sql`LEAST(${exif.exifImageWidth}, ${exif.exifImageHeight})`
          : metric === "long_edge"
            ? sql`GREATEST(${exif.exifImageWidth}, ${exif.exifImageHeight})`
            : sql`(${exif.exifImageWidth}::bigint * ${exif.exifImageHeight}) / 1000000.0`;
      const parts: SQL[] = [];
      if (c.min !== undefined && c.min !== null) parts.push(sql`${value} >= ${c.min}`);
      if (c.max !== undefined && c.max !== null) parts.push(sql`${value} <= ${c.max}`);
      return parts.length > 0 ? and(...parts)! : undefined;
    }

    case "file_size": {
      // min/max in megabytes (fractional allowed)
      const parts: SQL[] = [];
      if (c.min !== undefined && c.min !== null) parts.push(sql`${exif.fileSizeInByte} >= ${Math.round(c.min * 1048576)}`);
      if (c.max !== undefined && c.max !== null) parts.push(sql`${exif.fileSizeInByte} <= ${Math.round(c.max * 1048576)}`);
      return parts.length > 0 ? and(...parts)! : undefined;
    }

    case "filename": {
      if (!c.text) return undefined;
      const column = c.field === "path" ? assets.originalPath : assets.originalFileName;
      // Escape LIKE wildcards so user text is matched literally
      const escaped = c.text.replace(/([\\%_])/g, "\\$1");
      const match = c.match || "contains";
      const pattern =
        match === "starts_with" ? `${escaped}%`
        : match === "ends_with" ? `%${escaped}`
        : `%${escaped}%`;
      return match === "not_contains"
        ? sql`${column} NOT ILIKE ${pattern}`
        : sql`${column} ILIKE ${pattern}`;
    }

    case "file_extension": {
      const raw: string = c.extensions || "";
      const exts = raw
        .split(",")
        .map((e: string) => e.trim().replace(/^\./, "").toLowerCase())
        .filter(Boolean);
      if (exts.length === 0) return undefined;
      // Extension = text after the last dot; files without one never match either mode
      const extExpr = sql`lower(substring(${assets.originalFileName} from '\\.([^.]+)$'))`;
      const list = exts.map((e: string) => `'${e.replace(/'/g, "''")}'`).join(",");
      return c.match === "not_in"
        ? sql`${extExpr} NOT IN (${sql.raw(list)})`
        : sql`${extExpr} IN (${sql.raw(list)})`;
    }

    case "face_count": {
      const faceCount = sql`(SELECT count(*) FROM "asset_face" af WHERE af."assetId" = ${assets.id} AND af."deletedAt" IS NULL AND af."isVisible" = true)`;
      const parts: SQL[] = [];
      if (c.min !== undefined && c.min !== null) parts.push(sql`${faceCount} >= ${c.min}`);
      if (c.max !== undefined && c.max !== null) parts.push(sql`${faceCount} <= ${c.max}`);
      return parts.length > 0 ? and(...parts)! : undefined;
    }

    case "time_of_day": {
      if (c.fromHour == null || c.toHour == null) return undefined;
      // localDateTime holds the capture wall-clock time, so no timezone math needed
      const hour = sql`EXTRACT(HOUR FROM ${assets.localDateTime})`;
      if (c.fromHour <= c.toHour) {
        return sql`${hour} BETWEEN ${c.fromHour} AND ${c.toHour}`;
      }
      // From > To wraps past midnight, e.g. 22–5 = evening through early morning
      return sql`(${hour} >= ${c.fromHour} OR ${hour} <= ${c.toHour})`;
    }

    case "person": {
      const ids: string[] = c.personIds || (c.personId ? [c.personId] : []);
      if (ids.length === 0) return undefined;

      if (c.match === "not_contains") {
        // Asset must not contain ANY of these people
        const checks = ids.map((pid: string) =>
          sql`NOT EXISTS (SELECT 1 FROM "asset_face" af WHERE af."assetId" = ${assets.id} AND af."personId" = ${pid})`
        );
        return and(...checks)!;
      }

      if (c.match === "contains_all") {
        // Asset must contain ALL of these people
        const checks = ids.map((pid: string) =>
          sql`EXISTS (SELECT 1 FROM "asset_face" af WHERE af."assetId" = ${assets.id} AND af."personId" = ${pid})`
        );
        return and(...checks)!;
      }

      // contains_any (default) — asset contains at least one of these people
      const idList = ids.map((id: string) => `'${id}'`).join(",");
      return sql`EXISTS (SELECT 1 FROM "asset_face" af WHERE af."assetId" = ${assets.id} AND af."personId" IN (${sql.raw(idList)}))`;
    }

    case "tag": {
      const ids: string[] = c.tagIds || [];
      if (ids.length === 0) return undefined;

      // A selected tag also matches assets tagged with any of its child tags
      // (tag_closure holds the hierarchy, including self-references).
      const descendants = (tagId: string) =>
        sql`(SELECT tc."id_descendant" FROM "tag_closure" tc WHERE tc."id_ancestor" = ${tagId})`;

      if (c.match === "not_contains") {
        // Asset must not carry ANY of these tags (or their children)
        const checks = ids.map((tid: string) =>
          sql`NOT EXISTS (SELECT 1 FROM "tag_asset" ta WHERE ta."assetId" = ${assets.id} AND (ta."tagId" = ${tid} OR ta."tagId" IN ${descendants(tid)}))`
        );
        return and(...checks)!;
      }

      if (c.match === "contains_all") {
        // Asset must carry ALL of these tags (or their children)
        const checks = ids.map((tid: string) =>
          sql`EXISTS (SELECT 1 FROM "tag_asset" ta WHERE ta."assetId" = ${assets.id} AND (ta."tagId" = ${tid} OR ta."tagId" IN ${descendants(tid)}))`
        );
        return and(...checks)!;
      }

      // contains_any (default) — asset carries at least one of these tags (or their children)
      const idParams = sql.join(ids.map((id: string) => sql`${id}`), sql`, `);
      return sql`EXISTS (SELECT 1 FROM "tag_asset" ta WHERE ta."assetId" = ${assets.id} AND (ta."tagId" IN (${idParams}) OR ta."tagId" IN (SELECT tc."id_descendant" FROM "tag_closure" tc WHERE tc."id_ancestor" IN (${idParams}))))`;
    }

    case "person_unnamed":
      if (c.match === "no_unnamed") {
        return sql`NOT EXISTS (SELECT 1 FROM "asset_face" af JOIN "person" p ON af."personId" = p.id WHERE af."assetId" = ${assets.id} AND (p.name = '' OR p.name IS NULL))`;
      }
      return sql`EXISTS (SELECT 1 FROM "asset_face" af JOIN "person" p ON af."personId" = p.id WHERE af."assetId" = ${assets.id} AND (p.name = '' OR p.name IS NULL))`;

    case "not_in_album":
      return sql`NOT EXISTS (SELECT 1 FROM "album_asset" aa WHERE aa."assetId" = ${assets.id})`;

    // Kept for workflows saved before the "album" condition existed; the new
    // "album" type below covers both directions with an album picker.
    case "not_in_specific_album":
      return sql`NOT EXISTS (SELECT 1 FROM "album_asset" aa WHERE aa."assetId" = ${assets.id} AND aa."albumId" = ${c.albumId})`;

    case "album": {
      if (!c.albumId) return undefined;
      return c.match === "not_in"
        ? sql`NOT EXISTS (SELECT 1 FROM "album_asset" aa WHERE aa."assetId" = ${assets.id} AND aa."albumId" = ${c.albumId})`
        : sql`EXISTS (SELECT 1 FROM "album_asset" aa WHERE aa."assetId" = ${assets.id} AND aa."albumId" = ${c.albumId})`;
    }

    case "geo_radius": {
      const lat = Number(c.lat);
      const lng = Number(c.lng);
      const r = Number(c.radiusKm);
      if (![lat, lng, r].every(Number.isFinite) || r <= 0) return undefined;

      // A photo with no coordinates is neither inside nor outside, so both
      // directions require GPS rather than sweeping every un-located photo
      // into "outside".
      const hasGps = and(
        sql`${exif.latitude} IS NOT NULL`,
        sql`${exif.longitude} IS NOT NULL`,
      )!;

      // Exact great-circle (haversine) distance in km. The previous version
      // used only the bounding box below, which is a square — its corners sit
      // up to ~1.41x the requested radius away.
      const distanceKm = sql`(2 * 6371 * asin(sqrt(
        power(sin(radians(${exif.latitude} - ${lat}) / 2), 2) +
        cos(radians(${lat})) * cos(radians(${exif.latitude})) *
        power(sin(radians(${exif.longitude} - ${lng}) / 2), 2)
      )))`;

      if (c.match === "outside") {
        // No bounding box here: it would wrongly exclude far-away photos.
        return and(hasGps, sql`${distanceKm} > ${r}`)!;
      }

      // Inside: cheap, index-friendly bounding box narrows the set first, then
      // the exact distance trims the corners. Skipped near the poles or the
      // antimeridian, where a naive box wraps and would drop real matches.
      const latDelta = r / 111.045;
      const cosLat = Math.cos((lat * Math.PI) / 180);
      const lngDelta = Math.abs(cosLat) < 1e-6 ? 180 : r / (111.045 * Math.abs(cosLat));
      const boxSafe =
        lngDelta < 180 &&
        lng - lngDelta >= -180 && lng + lngDelta <= 180 &&
        lat - latDelta >= -90 && lat + latDelta <= 90;

      const parts: SQL[] = [hasGps];
      if (boxSafe) {
        parts.push(
          gte(exif.latitude, lat - latDelta),
          lte(exif.latitude, lat + latDelta),
          gte(exif.longitude, lng - lngDelta),
          lte(exif.longitude, lng + lngDelta),
        );
      }
      parts.push(sql`${distanceKm} <= ${r}`);
      return and(...parts)!;
    }

    default:
      return undefined;
  }
}
