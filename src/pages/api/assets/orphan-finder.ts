import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { NextApiRequest, NextApiResponse } from "next";
import { and, eq, isNull, sql, desc } from "drizzle-orm";
import { assets } from "@/schema/assets.schema";
import { exif } from "@/schema";
import { isFlipped } from "@/helpers/asset.helper";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const {
    notInAlbum,
    noPeople,
    noLocation,
    notFavorited,
    type,
    limit = "100",
    page = "1",
  } = req.query as Record<string, string>;

  const limitNum = parseInt(limit, 10);
  const pageNum = parseInt(page, 10);

  const conditions: any[] = [
    eq(assets.ownerId, currentUser.id),
    eq(assets.visibility, "timeline"),
    eq(assets.status, "active"),
    isNull(assets.deletedAt),
  ];

  if (type && type !== "ALL") {
    conditions.push(eq(assets.type, type));
  }

  if (notFavorited === "true") {
    conditions.push(eq(assets.isFavorite, false));
  }

  if (noLocation === "true") {
    conditions.push(isNull(exif.latitude));
  }

  if (notInAlbum === "true") {
    conditions.push(
      sql`NOT EXISTS (SELECT 1 FROM "album_asset" aa WHERE aa."assetId" = ${assets.id})`
    );
  }

  if (noPeople === "true") {
    conditions.push(
      sql`NOT EXISTS (SELECT 1 FROM "asset_face" af WHERE af."assetId" = ${assets.id} AND af."personId" IS NOT NULL)`
    );
  }

  const hasOrphanFilter = notInAlbum === "true" || noPeople === "true" || noLocation === "true" || notFavorited === "true";
  if (!hasOrphanFilter) {
    return res.status(400).json({ message: "At least one orphan filter is required" });
  }

  const dbAssets = await db
    .selectDistinctOn([assets.id], {
      id: assets.id,
      type: assets.type,
      originalPath: assets.originalPath,
      isFavorite: assets.isFavorite,
      duration: assets.duration,
      originalFileName: assets.originalFileName,
      deletedAt: assets.deletedAt,
      localDateTime: assets.localDateTime,
      exifImageWidth: exif.exifImageWidth,
      exifImageHeight: exif.exifImageHeight,
      ownerId: assets.ownerId,
      dateTimeOriginal: exif.dateTimeOriginal,
      orientation: exif.orientation,
    })
    .from(assets)
    .leftJoin(exif, eq(assets.id, exif.assetId))
    .where(and(...conditions))
    .orderBy(assets.id, desc(assets.localDateTime))
    .limit(limitNum)
    .offset((pageNum - 1) * limitNum);

  const cleanedAssets = dbAssets.map((asset) => ({
    ...asset,
    exifImageHeight: isFlipped(asset?.orientation) ? asset?.exifImageWidth : asset?.exifImageHeight,
    exifImageWidth: isFlipped(asset?.orientation) ? asset?.exifImageHeight : asset?.exifImageWidth,
    orientation: asset?.orientation,
  }));

  return res.status(200).json(cleanedAssets);
}
