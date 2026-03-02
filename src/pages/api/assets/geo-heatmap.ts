import { NextApiResponse } from "next";

import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { NextApiRequest } from "next";
import { assetFaces, assets, exif, person } from "@/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { albumsAssetsAssets } from "@/schema/albumAssetsAssets.schema";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const currentUser = await getCurrentUser(req);
  const { albumIds, peopleIds } = req.query as { albumIds: string, peopleIds: string };
  if (!currentUser) {
    return res.status(401).json({ message: 'Unauthorized' });
  }


const dbAssets = await db.select({
    assetId: assets.id,
    latitude: exif.latitude,
    longitude: exif.longitude,
  }).from(assets)
  .innerJoin(exif, eq(assets.id, exif.assetId))
  .innerJoin(albumsAssetsAssets, eq(assets.id, albumsAssetsAssets.assetId))
  .innerJoin(assetFaces, eq(albumsAssetsAssets.assetId, assetFaces.assetId))
  .innerJoin(person, eq(assetFaces.personId, person.id))
  .where(
    and(
      eq(assets.ownerId, currentUser.id),
      isNotNull(exif.latitude),
      isNotNull(exif.longitude),
      albumIds?.length > 0 ? inArray(albumsAssetsAssets.albumId, [albumIds]) : undefined,
      peopleIds?.length > 0 ? inArray(person.id, [peopleIds]) : undefined
    )
  );
  const heatmapData = dbAssets.map((asset) => [
    asset.longitude,
    asset.latitude,
  ]);
  res.status(200).json(heatmapData); 
}
