import { db } from "@/config/db";
import { ENV } from "@/config/environment";
import { ADD_ASSETS_TO_ALBUM_PATH, DELETE_ALBUMS_PATH } from "@/config/routes";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import API from "@/lib/api";
import { albumsAssetsAssets } from "@/schema/albumAssetsAssets.schema";
import { albums } from "@/schema/albums.schema";
import { albumUsers } from "@/schema/albumUsers.schema";
import { and, eq, inArray } from "drizzle-orm";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { primaryAlbumId, secondaryAlbumIds } = req.body as {
    primaryAlbumId: string;
    secondaryAlbumIds: string[];
  };

  if (!primaryAlbumId || !secondaryAlbumIds) {
    return res
      .status(400)
      .json({ error: "primaryAlbumId and secondaryAlbumIds are required" });
  }

  if (secondaryAlbumIds.length === 0) {
    return res
      .status(400)
      .json({
        error: "secondaryAlbumIds must be an array of at least one album id",
      });
  }

  const ownedAlbumIds = db
    .select({ albumId: albumUsers.albumId })
    .from(albumUsers)
    .where(and(eq(albumUsers.userId, currentUser.id), eq(albumUsers.role, "owner")));

  const primaryAlbum = await db
    .select()
    .from(albums)
    .where(
      and(eq(albums.id, primaryAlbumId), inArray(albums.id, ownedAlbumIds))
    )
    .limit(1);

  if (!primaryAlbum) {
    return res.status(404).json({ error: "Primary album not found" });
  }


  const secondaryAlbums = await db
    .select()
    .from(albums)
    .where(and(inArray(albums.id, secondaryAlbumIds), inArray(albums.id, ownedAlbumIds)));

  
  if (secondaryAlbums.length === 0) {
    return res.status(404).json({ error: "Secondary albums not found" });
  }

  const secondaryAlbumAssets = await db
    .select()
    .from(albumsAssetsAssets)
    .where(inArray(albumsAssetsAssets.albumId, secondaryAlbumIds));

  if (secondaryAlbumAssets.length === 0) {
    return res.status(404).json({ error: "Secondary album assets not found" });
  }

  const secondaryAlbumAssetsIds = secondaryAlbumAssets.map((albumAsset) => albumAsset.assetId);

  const addAssetsToPrimaryAlbumURL = `${ENV.IMMICH_URL}/api/albums/${primaryAlbumId}/assets`;
  const addAssetsToPrimaryAlbum = await fetch(addAssetsToPrimaryAlbumURL, {
    method: 'PUT',
    body: JSON.stringify({ ids: secondaryAlbumAssetsIds }),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentUser.accessToken}`
    }
  });
  
  if (!addAssetsToPrimaryAlbum.ok) {
    return res.status(500).json({ error: "Failed to add assets to primary album" });
  }

  // Delete secondary albums
  const deleteSecondaryAlbums = secondaryAlbums.map(async (album) => {
    const deleteAlbumURL = `${ENV.IMMICH_URL}/api/albums/${album.id}`;
    return fetch(deleteAlbumURL, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${currentUser.accessToken}`
      }
    });
  });  

  await Promise.all(deleteSecondaryAlbums);

  return res.status(200).json({
    success: true,
    message: "Albums merged successfully",
  });
}
