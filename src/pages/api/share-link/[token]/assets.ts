import { db } from "@/config/db";
import { ENV } from "@/config/environment";
import { desc, gte, lte, sql } from "drizzle-orm";
import { eq, inArray, or, isNull, count } from "drizzle-orm";
import { assetFaces, assets, exif } from "@/schema";
import { and } from "drizzle-orm";
import { JsonWebTokenError, sign, verify } from "jsonwebtoken";
import { NextApiResponse } from "next";

import { NextApiRequest } from "next";
import { albums } from "@/schema/albums.schema";
import { albumsAssetsAssets } from "@/schema/albumAssetsAssets.schema";
import { cleanUpShareAsset, isFlipped } from "@/helpers/asset.helper";
import { ShareLinkFilters } from "@/types/shareLink";

interface IQuery extends ShareLinkFilters {
  token: string
  ['personIds[]']?: string[]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { token, ...rest } = req.query as any as IQuery

    const filters = {
      personIds: rest['personIds[]'] ?? rest.personIds ?? [],
    }

    if (!token) {
      return res.status(404).json({ message: "Token not found" });
    }

    const decoded = verify(token as string, ENV.JWT_SECRET);

    if (!decoded) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const newPreviewToken = sign({ token: token }, ENV.JWT_SECRET, {
      expiresIn: "2m"
    });

    const { personIds = [], albumIds = [], startDate, endDate } = decoded as ShareLinkFilters;
    let filteredPersonIds: string[] = personIds ?? [];
    const queryPersonIds = filters.personIds ? (Array.isArray(filters.personIds) ? filters.personIds : [filters.personIds]) : [];


    if (queryPersonIds.length > 0) {

      if (personIds.length === 0) {
        filteredPersonIds = queryPersonIds;
      } else {
        filteredPersonIds = queryPersonIds.filter((id) => personIds.includes(id));
      }
    }

    const dbAssets = await db.select({
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
      url: assets.id,
      previewUrl: assets.id,
      videoURL: assets.id,
      orientation: exif.orientation,
    }).from(assets)
      .innerJoin(assetFaces, eq(assets.id, assetFaces.assetId))
      .leftJoin(albumsAssetsAssets, eq(assets.id, albumsAssetsAssets.assetId))
      .leftJoin(albums, eq(albumsAssetsAssets.albumId, albums.id))
      .innerJoin(exif, eq(exif.assetId, assets.id))
      .where(and(
        filteredPersonIds?.length > 0 ? inArray(assetFaces.personId, filteredPersonIds) : undefined,
        albumIds?.length > 0 ? inArray(albums.id, albumIds) : undefined,
        startDate ? gte(assets.createdAt, new Date(startDate)) : undefined,
        endDate ? lte(assets.createdAt, new Date(endDate)) : undefined,
        eq(assets.status, "active"),
        eq(assets.visibility, "timeline"),
        eq(assets.isOffline, false),
      ))
      .orderBy(desc(assets.localDateTime));

    const cleanedAssets = dbAssets.map((asset) => {
      return {
        ...asset,
        localDateTime: new Date(asset.localDateTime),
        duration: asset.duration ? parseInt(asset.duration) : 0,
        exifImageWidth: (isFlipped(asset.orientation) ? asset.exifImageHeight : asset.exifImageWidth) ?? 0,
        exifImageHeight: (isFlipped(asset.orientation) ? asset.exifImageWidth : asset.exifImageHeight) ?? 0,
        dateTimeOriginal: new Date(asset.dateTimeOriginal || new Date()).toISOString(),
      }
    }).map((asset) => cleanUpShareAsset(asset, newPreviewToken as string));

    return res.status(200).json({
      assets: cleanedAssets,
      filters: decoded as ShareLinkFilters
    });
  } catch (error) {
    if (error instanceof JsonWebTokenError) {
      return res.status(401).json({ message: "Please check your link and try again. Looks like it's expired." });
    }
    return res.status(500).json({ message: (error as Error).message });
  }
}