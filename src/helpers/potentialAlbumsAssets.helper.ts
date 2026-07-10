// Asset-detail fetchers for the Potential Albums right-panel grid: either
// a single day, or a date range (trip). Both share one endpoint
// (potential-albums-assets.ts) via a `groupBy` param — this file holds the
// two DB-querying implementations.
import { db } from "@/config/db";
import { isFlipped } from "@/helpers/asset.helper";
import { sql } from "drizzle-orm";

const cleanRows = (rows: any[]) =>
  rows.map((row: any) => ({
    ...row,
    exifImageWidth: isFlipped(row.orientation || 0) ? row.exifImageHeight : row.exifImageWidth,
    exifImageHeight: isFlipped(row.orientation || 0) ? row.exifImageWidth : row.exifImageHeight,
  }));

const SELECT_ORPHAN_DAY = (date: string, ownerId: string) =>
  sql.raw(`
  SELECT
      a."id",
      a."ownerId",
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

export const fetchDayAssets = async (ownerId: string, date: string) => {
  const { rows } = await db.execute(SELECT_ORPHAN_DAY(date, ownerId));
  return cleanRows(rows);
};

// Optional `city` narrows the result to assets whose EXIF city matches the
// trip's dominant city. Assets with NULL city are included alongside the
// match: they may be photos taken during the trip but without GPS metadata
// (screenshots, edited copies, older devices, etc.) and excluding them would
// lose real trip content. If `city` is not provided the date range alone
// determines membership.
const SELECT_ORPHAN_RANGE = (startDate: string, endDate: string, ownerId: string, city: string | null) => {
  const cityClause = city
    ? `AND (e."city" = '${city.replace(/'/g, "''")}' OR e."city" IS NULL)`
    : "";
  return sql.raw(`
  SELECT
      a."id",
      a."ownerId",
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
      e."orientation",
      e."city",
      e."country"
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
      AND e."dateTimeOriginal"::date BETWEEN '${startDate}' AND '${endDate}'
      AND a."visibility" = 'timeline'
      ${cityClause}
  ORDER BY
      e."dateTimeOriginal" ASC
`);
};

export const fetchTripAssets = async (ownerId: string, startDate: string, endDate: string, city: string | null) => {
  const { rows } = await db.execute(SELECT_ORPHAN_RANGE(startDate, endDate, ownerId, city));
  return cleanRows(rows);
};
