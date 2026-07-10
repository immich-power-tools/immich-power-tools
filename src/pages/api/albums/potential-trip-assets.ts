// Fetch orphan assets that fall within a date range (for the Potential Trips view).
import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { isFlipped } from "@/helpers/asset.helper";
import { sql } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

// Optional `city` narrows the result to assets whose EXIF city matches the
// trip's dominant city. Assets with NULL city are included alongside the
// match: they may be photos taken during the trip but without GPS metadata
// (screenshots, edited copies, older devices, etc.) and excluding them would
// lose real trip content. If `city` is not provided the date range alone
// determines membership.
const SELECT_ORPHAN_RANGE = (
  startDate: string,
  endDate: string,
  ownerId: string,
  city: string | null
) => {
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

    const { startDate, endDate, city } = req.query as {
      startDate?: string;
      endDate?: string;
      city?: string;
    };
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "startDate and endDate are required (YYYY-MM-DD)" });
    }
    // Basic format sanity (the strings are interpolated into the SQL literal, so
    // reject anything that isn't YYYY-MM-DD to keep this endpoint from becoming
    // an injection vector — same shape check the single-date endpoint should have.)
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
      return res.status(400).json({ error: "Invalid date format, expected YYYY-MM-DD" });
    }

    const { rows } = await db.execute(
      SELECT_ORPHAN_RANGE(startDate, endDate, currentUser.id, city ?? null)
    );

    const cleaned = rows.map((row: any) => ({
      ...row,
      exifImageWidth: isFlipped(row.orientation || 0) ? row.exifImageHeight : row.exifImageWidth,
      exifImageHeight: isFlipped(row.orientation || 0) ? row.exifImageWidth : row.exifImageHeight,
    }));
    return res.status(200).json(cleaned);
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error?.message });
  }
}
