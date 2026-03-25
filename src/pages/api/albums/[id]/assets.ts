import { NextApiRequest } from "next";

import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { NextApiResponse } from "next";
import { and, desc, eq } from "drizzle-orm";
import { assets } from "@/schema/assets.schema";
import { albumsAssetsAssets } from "@/schema/albumAssetsAssets.schema";
import { assetFaces, exif, person } from "@/schema";
import { isFlipped } from "@/helpers/asset.helper";
import { ASSET_VIDEO_PATH } from "@/config/routes";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { id, faceId, page = 1 } = req.query as { 
    id?: string, 
    faceId?: string, 
    page?: number 
  };

  if (!id) {
    return res.status(400).json({ error: "Album id is required" });
  }
  const dbAssets = await db.selectDistinctOn([assets.id], {
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
  })
    .from(albumsAssetsAssets)
    .leftJoin(assets, eq(albumsAssetsAssets.assetId, assets.id))
    .leftJoin(exif, eq(assets.id, exif.assetId))
    .leftJoin(assetFaces, eq(assets.id, assetFaces.assetId))
    .leftJoin(person, eq(assetFaces.personId, person.id))
    .where(and(
      eq(albumsAssetsAssets.albumId, id), 
      eq(assets.visibility, "timeline"),
      eq(assets.status, "active"),
      faceId ? eq(assetFaces.personId, faceId) : undefined,
    ))
    .orderBy(desc(assets.id), desc(assets.localDateTime))
    .limit(100)
    .offset(100 * (page - 1));

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
  }).sort((b, a) => {
    return new Date(b.localDateTime || 0).getTime() - new Date(a.localDateTime || 0).getTime();
  });
  res.status(200).json(cleanedAssets);
}