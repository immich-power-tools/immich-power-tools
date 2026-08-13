import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { isFlipped } from "@/helpers/asset.helper";
import { parseDate } from "@/helpers/date.helper";
import { assets, exif } from "@/schema";
import { albumsAssetsAssets } from "@/schema/albumAssetsAssets.schema";
import { addDays } from "date-fns";
import { and, asc, count, desc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

// Page size lives in a client-safe constants module so the GPS Manager page
// can share it without importing this server route. Re-exported here so
// existing `import { LOCATION_MANAGER_PAGE_SIZE } from "./location-manager-assets"`
// callers keep working.
export { LOCATION_MANAGER_PAGE_SIZE } from "@/config/constants/location-manager";
import { LOCATION_MANAGER_PAGE_SIZE } from "@/config/constants/location-manager";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const {
    albumId,
    gpsStatus = "all",
    page = "1",
    sortOrder = "desc",
    dateFrom,
    dateTo,
  } = req.query as {
    albumId?: string;
    gpsStatus?: "all" | "set" | "notSet";
    page?: string;
    sortOrder?: "asc" | "desc";
    dateFrom?: string;
    dateTo?: string;
  };
  const pageNum = Math.max(1, parseInt(page, 10) || 1);

  // "Location Not Set" must match Missing Locations' definition exactly
  // (exif.latitude IS NULL through a left join, so assets with no exif row
  // count as missing) so the two tools always agree on what needs fixing.
  const gpsCondition =
    gpsStatus === "notSet"
      ? isNull(exif.latitude)
      : gpsStatus === "set"
        ? isNotNull(exif.latitude)
        : undefined;

  const takenAt = sql`COALESCE(${exif.dateTimeOriginal}, ${assets.localDateTime})`;

  const conditions = and(
    eq(assets.ownerId, currentUser.id),
    eq(assets.visibility, "timeline"),
    eq(assets.status, "active"),
    isNull(assets.deletedAt),
    isNotNull(assets.createdAt),
    gpsCondition,
    albumId ? eq(albumsAssetsAssets.albumId, albumId) : undefined,
    dateFrom ? gte(takenAt, parseDate(dateFrom, "yyyy-MM-dd")) : undefined,
    dateTo ? lt(takenAt, addDays(parseDate(dateTo, "yyyy-MM-dd"), 1)) : undefined
  );

  try {
    let query = db
      .select({
        id: assets.id,
        type: assets.type,
        originalPath: assets.originalPath,
        isFavorite: assets.isFavorite,
        duration: assets.duration,
        originalFileName: assets.originalFileName,
        localDateTime: assets.localDateTime,
        exifImageWidth: exif.exifImageWidth,
        exifImageHeight: exif.exifImageHeight,
        ownerId: assets.ownerId,
        dateTimeOriginal: exif.dateTimeOriginal,
        orientation: exif.orientation,
        latitude: exif.latitude,
        longitude: exif.longitude,
      })
      .from(assets)
      .leftJoin(exif, eq(exif.assetId, assets.id))
      .$dynamic();

    if (albumId) {
      query = query.innerJoin(
        albumsAssetsAssets,
        eq(assets.id, albumsAssetsAssets.assetId)
      );
    }

    const rows = await query
      .where(conditions)
      .orderBy(
        sortOrder === "asc" ? asc(takenAt) : desc(takenAt),
        asc(assets.id)
      )
      .limit(LOCATION_MANAGER_PAGE_SIZE + 1)
      .offset((pageNum - 1) * LOCATION_MANAGER_PAGE_SIZE);

    // Total is only needed once per filter change — page 1 — not on load-more.
    let total: number | undefined;
    if (pageNum === 1) {
      let countQuery = db
        .select({ value: count() })
        .from(assets)
        .leftJoin(exif, eq(exif.assetId, assets.id))
        .$dynamic();
      if (albumId) {
        countQuery = countQuery.innerJoin(
          albumsAssetsAssets,
          eq(assets.id, albumsAssetsAssets.assetId)
        );
      }
      const [countRow] = await countQuery.where(conditions);
      total = countRow?.value ?? 0;
    }

    const hasMore = rows.length > LOCATION_MANAGER_PAGE_SIZE;
    const pageRows = hasMore ? rows.slice(0, LOCATION_MANAGER_PAGE_SIZE) : rows;
    const cleanedRows = pageRows.map((row) => ({
      ...row,
      exifImageWidth: isFlipped(row.orientation)
        ? row.exifImageHeight
        : row.exifImageWidth,
      exifImageHeight: isFlipped(row.orientation)
        ? row.exifImageWidth
        : row.exifImageHeight,
    }));

    return res.status(200).json({ assets: cleanedRows, hasMore, total });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message });
  }
}
