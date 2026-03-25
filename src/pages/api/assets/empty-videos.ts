import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { NextApiRequest, NextApiResponse } from "next";
import { and, eq, isNotNull, sql, desc, asc } from "drizzle-orm";
import { assets } from "@/schema/assets.schema";
import { exif } from "@/schema";
import { isFlipped } from "@/helpers/asset.helper";
import { ASSET_VIDEO_PATH } from "@/config/routes";



export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const currentUser = await getCurrentUser(req);
  const {
    limit = 10,
    page = 1,
    maxDuration = 2,
    sortBy = 'localDateTime',
    sortOrder = 'desc',
  } = req.query as unknown as {
    limit: string | number;
    page: string | number;
    maxDuration: string | number;
    sortBy: string;
    sortOrder: string;
  };
  
  // Convert to numbers
  const limitNum = typeof limit === 'string' ? parseInt(limit, 10) : limit;
  const pageNum = typeof page === 'string' ? parseInt(page, 10) : page;
  const maxDurationNum = typeof maxDuration === 'string' ? parseFloat(maxDuration) : maxDuration;
  
  
  if (!currentUser) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  
  const durationExpr = sql<number>`
  (
    CAST(SUBSTRING(${assets.duration}, 1, 2) AS DECIMAL) * 3600 +
    CAST(SUBSTRING(${assets.duration}, 4, 2) AS DECIMAL) * 60 +
    CAST(SUBSTRING(${assets.duration}, 7, 2) AS DECIMAL) +
    CAST(SUBSTRING(${assets.duration}, 10, 3) AS DECIMAL) / 1000
  )
`;

const dbAssets = await db
  .selectDistinctOn([assets.id], {
    id: assets.id,
    deviceId: assets.deviceId,
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
    durationSeconds: durationExpr.as('duration_seconds'),
  })
  .from(assets)
  .leftJoin(exif, eq(assets.id, exif.assetId))
  .where(
    and(
      eq(assets.ownerId, currentUser.id),
      eq(assets.type, "VIDEO"),
      eq(assets.visibility, "timeline"),
      eq(assets.status, "active"),
      isNotNull(assets.duration),
      maxDurationNum > 0 ? sql`${durationExpr} < ${maxDurationNum}` : undefined
    )
  )
  .orderBy(
    assets.id,
    sortBy === "duration"
      ? (sortOrder === "desc" ? desc(durationExpr) : asc(durationExpr))
      : (sortOrder === "desc"
          ? desc(assets.localDateTime)
          : asc(assets.localDateTime))
  )
  .limit(limitNum)
  .offset((pageNum - 1) * limitNum);

  const cleanedAssets = dbAssets.map((asset) => {
    return {
      ...asset,
      exifImageHeight: isFlipped(asset?.orientation)
        ? asset?.exifImageWidth
        : asset?.exifImageHeight,
      exifImageWidth: isFlipped(asset?.orientation)
        ? asset?.exifImageHeight
        : asset?.exifImageWidth,
      orientation: asset?.orientation,
      downloadUrl: asset?.id ? ASSET_VIDEO_PATH(asset.id) : null,
    };
  });

  return res.status(200).json(cleanedAssets);
}
