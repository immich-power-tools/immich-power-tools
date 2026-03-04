import { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { albums } from "@/schema/albums.schema";
import { albumsAssetsAssets } from "@/schema/albumAssetsAssets.schema";
import { eq, inArray, and } from "drizzle-orm";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { assetIds } = req.body as { assetIds: string[] };
  if (!assetIds || assetIds.length === 0) {
    return res.status(200).json({});
  }

  const rows = await db
    .select({
      assetId: albumsAssetsAssets.assetId,
      albumId: albums.id,
      albumName: albums.albumName,
    })
    .from(albumsAssetsAssets)
    .innerJoin(albums, eq(albumsAssetsAssets.albumId, albums.id))
    .where(
      and(
        inArray(albumsAssetsAssets.assetId, assetIds),
        eq(albums.ownerId, currentUser.id)
      )
    );

  const result: Record<string, Array<{ albumId: string; albumName: string }>> = {};
  for (const row of rows) {
    if (!result[row.assetId]) {
      result[row.assetId] = [];
    }
    result[row.assetId].push({ albumId: row.albumId, albumName: row.albumName });
  }

  return res.status(200).json(result);
}
