import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { isFlipped } from "@/helpers/asset.helper";
import { sql } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

const SELECT_ORPHAN_PHOTOS = (date: string, ownerId:  string) =>
  sql.raw(`
  SELECT 
      a."id",
      a."ownerId",
      a."deviceId",
      a."type",
      a."originalPath",
      a."isFavorite",
      a."duration",
      a."originalFileName",
      
      a."thumbhash",
      a."deletedAt",
      e."exifImageWidth",
      e."exifImageHeight",
      e."dateTimeOriginal",
      e."orientation"
  FROM 
      asset a
  LEFT JOIN 
      album_asset aaa 
      ON a.id = aaa."assetId"
  LEFT JOIN 
      asset_exif e 
      ON a.id = e."assetId"
  WHERE 
      aaa."albumId" IS NULL 
      AND a."ownerId" = '${ownerId}'
      AND e."dateTimeOriginal"::date = '${date}'
      AND a."visibility" = 'timeline'
  ORDER BY
      e."dateTimeOriginal" DESC
`);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const currentUser = await getCurrentUser(req)
    const { startDate } = req.query as { startDate: string };
    const { rows } = await db.execute(SELECT_ORPHAN_PHOTOS(startDate, currentUser.id));

    const cleanedRows = rows.map((row: any) => {
      return {
        ...row,
        exifImageWidth: isFlipped(row.orientation || 0) ? row.exifImageHeight : row.exifImageWidth,
        exifImageHeight: isFlipped(row.orientation || 0) ? row.exifImageWidth : row.exifImageHeight,
      };
    });
    return res.status(200).json(cleanedRows);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({
      error: error?.message,
    });
  }
}
