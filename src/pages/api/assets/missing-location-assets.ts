// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { isFlipped } from "@/helpers/asset.helper";
import { parseDate } from "@/helpers/date.helper";
import { assets, exif } from "@/schema";
import { albumsAssetsAssets } from "@/schema/albumAssetsAssets.schema";
import { albums } from "@/schema/albums.schema";
import { IUser } from "@/types/user";
import { addDays } from "date-fns";
import { and, eq, gte, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

const getRowsByDates = async (startDateDate: Date, endDateDate: Date, currentUser: IUser) => {
  return db
    .select({
      id: assets.id,
      deviceId: assets.deviceId,
      type: assets.type,
      originalPath: assets.originalPath,
      isFavorite: assets.isFavorite,
      duration: assets.duration,
      encodedVideoPath: assets.encodedVideoPath,
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
    .leftJoin(exif, eq(exif.assetId, assets.id))
    .where(and(
      isNull(exif.latitude),
      isNotNull(assets.createdAt),
      gte(exif.dateTimeOriginal, startDateDate),
      lte(exif.dateTimeOriginal, endDateDate),
      eq(assets.ownerId, currentUser.id),
      eq(assets.visibility, "timeline"),
      eq(assets.status, "active"),
      isNull(assets.deletedAt),
    ));
}

const getRowsByAlbums = async (currentUser: IUser, albumId: string) => {
  return db.select({
    id: assets.id,
    deviceId: assets.deviceId,
    type: assets.type,
    originalPath: assets.originalPath,
    isFavorite: assets.isFavorite,
    duration: assets.duration,
    encodedVideoPath: assets.encodedVideoPath,
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
    .leftJoin(exif, eq(exif.assetId, assets.id))
    .leftJoin(albumsAssetsAssets, eq(albumsAssetsAssets.assetId, assets.id))
    .leftJoin(albums, eq(albums.id, albumsAssetsAssets.albumId))
    .where(and(
      isNull(exif.latitude),
      isNotNull(assets.createdAt),
      eq(assets.ownerId, currentUser.id),
      eq(albums.id, albumId),
      eq(assets.visibility, "timeline"),
      eq(assets.status, "active"),
      isNull(assets.deletedAt),
    ));
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { startDate, groupBy, albumId } = req.query as {
    startDate: string;
    groupBy: "date" | "album";
    albumId?: string;
  };

  const currentUser = await getCurrentUser(req);

  if (!currentUser) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  if (!startDate && !albumId) {
    return res.status(400).json({
      error: "startDate or albumId is required",
    });
  }

  if (startDate) {
    const startDateDate = parseDate(startDate, "yyyy-MM-dd");
    const endDateDate = addDays(parseDate(startDate, "yyyy-MM-dd"), 1);

    try {
      const rows = await getRowsByDates(startDateDate, endDateDate, currentUser);
      const cleanedRows = rows.map((row) => ({
        ...row,
        exifImageWidth: isFlipped(row.orientation) ? row.exifImageHeight : row.exifImageWidth,
        exifImageHeight: isFlipped(row.orientation) ? row.exifImageWidth : row.exifImageHeight,
        orientation: row.orientation,
      }));
      return res.status(200).json(cleanedRows);
    } catch (error: any) {
      return res.status(500).json({
        error: error?.message,
      });
    }
  } else if (albumId) {
    if (!albumId) {
      return res.status(400).json({
        error: "albumId is required",
      });
    }
    const rows = await getRowsByAlbums(currentUser, albumId);
    const cleanedRows = rows.map((row) => ({
      ...row,
      exifImageWidth: isFlipped(row.orientation) ? row.exifImageHeight : row.exifImageWidth,
      exifImageHeight: isFlipped(row.orientation) ? row.exifImageWidth : row.exifImageHeight,
      orientation: row.orientation,
    }));
    return res.status(200).json(cleanedRows);
  }
}