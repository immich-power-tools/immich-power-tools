import { NextApiRequest } from "next";

import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { NextApiResponse } from "next";
import { albums } from "@/schema/albums.schema";
import { count, desc, eq, min, max, sql, and, sum, isNotNull } from "drizzle-orm";
import { assets } from "@/schema/assets.schema";
import { albumsAssetsAssets } from "@/schema/albumAssetsAssets.schema";
import { albumUsers } from "@/schema/albumUsers.schema";
import { assetFaces, exif, person } from "@/schema";
import { IAlbum } from "@/types/album";

const getTime = (date: Date) => {
  return date ? date.getTime() : 0;
}

const sortAlbums = (albums: IAlbum[], sortBy: string, sortOrder: string) => {
  if (sortBy === 'createdAt') {
    return albums.sort((a, b) => sortOrder === 'asc' ? getTime(a?.createdAt) - getTime(b?.createdAt) : getTime(b?.createdAt) - getTime(a?.createdAt));
  }
  if (sortBy === 'updatedAt') {
    return albums.sort((a, b) => sortOrder === 'asc' ? getTime(a?.updatedAt) - getTime(b?.updatedAt) : getTime(b?.updatedAt) - getTime(a?.updatedAt));
  }
  if (sortBy === 'firstPhotoDate') {
    return albums.sort((a, b) => sortOrder === 'asc' ? getTime(a?.firstPhotoDate) - getTime(b?.firstPhotoDate) : getTime(b?.firstPhotoDate) - getTime(a?.firstPhotoDate));
  }
  if (sortBy === 'lastPhotoDate') {
    return albums.sort((a, b) => sortOrder === 'asc' ? getTime(a?.lastPhotoDate) - getTime(b?.lastPhotoDate) : getTime(b?.lastPhotoDate) - getTime(a?.lastPhotoDate));
  }
  if (sortBy === 'assetCount') {
    return albums.sort((a, b) => sortOrder === 'asc' ? a?.assetCount - b?.assetCount : b?.assetCount - a?.assetCount);
  }
  if (sortBy === 'albumName') {
    return albums.sort((a, b) => sortOrder === 'asc' ? a?.albumName?.localeCompare(b?.albumName) : b?.albumName?.localeCompare(a?.albumName));
  }
  if (sortBy === 'albumSize') {
    return albums.sort((a, b) => sortOrder === 'asc' ? parseInt(a?.size) - parseInt(b?.size) : parseInt(b?.size) - parseInt(a?.size));
  }
  if (sortBy === 'faceCount') {
    return albums.sort((a, b) => sortOrder === 'asc' ? a?.faceCount - b?.faceCount : b?.faceCount - a?.faceCount);
  }
  return albums;
}
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { sortBy = 'lastPhotoDate', sortOrder = 'desc' } = req.query as { sortBy: string, sortOrder: string };

  const dbAlbums = await db.select({
    id: albums.id,
    albumName: albums.albumName,
    createdAt: albums.createdAt,
    updatedAt: albums.updatedAt,
    albumThumbnailAssetId: albums.albumThumbnailAssetId,
    assetCount: count(sql<string>`DISTINCT ${assets.id}`),
    firstPhotoDate: min(exif.dateTimeOriginal),
    lastPhotoDate: max(exif.dateTimeOriginal),
    size: sum(exif.fileSizeInByte),
    order: albums.order,
    isActivityEnabled: albums.isActivityEnabled,
    ownerId: albumUsers.userId,
    description: albums.description,
    lastModifiedAssetTimestamp: max(exif.dateTimeOriginal),
    faceCount: count(sql<string>`DISTINCT ${assetFaces.personId}`), // Ensure unique personId
  })
    .from(albums)
    .innerJoin(albumUsers, and(eq(albums.id, albumUsers.albumId), eq(albumUsers.role, "owner")))
    .leftJoin(albumsAssetsAssets, eq(albums.id, albumsAssetsAssets.albumId))
    .leftJoin(assets, and(
      eq(albumsAssetsAssets.assetId, assets.id),
      eq(assets.visibility, "timeline"),
      eq(assets.status, "active"),
    ))
    .leftJoin(exif, eq(assets.id, exif.assetId))
    .leftJoin(assetFaces, eq(assets.id, assetFaces.assetId))
    .leftJoin(person, and(eq(assetFaces.personId, person.id), eq(person.isHidden, false)))
    .where(eq(albumUsers.userId, currentUser.id))
    .groupBy(albums.id, albumUsers.userId)
    .orderBy(desc(albums.createdAt));
  
  const sortedAlbums = sortAlbums(dbAlbums as IAlbum[], sortBy, sortOrder);
  res.status(200).json(sortedAlbums);
}