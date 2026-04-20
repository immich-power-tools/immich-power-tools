// Potential trips — multi-day stretches of photos away from home.
// Companion to /api/albums/potential-albums-dates (which groups by single day).
import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import {
  DaySignal,
  DEFAULT_CLUSTER_OPTIONS,
  clusterTrips,
  computeHome,
} from "@/helpers/trips.helper";
import { albumsAssetsAssets } from "@/schema/albumAssetsAssets.schema";
import { assets } from "@/schema/assets.schema";
import { exif } from "@/schema/exif.schema";
import { and, avg, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const {
      homeRadiusKm = DEFAULT_CLUSTER_OPTIONS.homeRadiusKm,
      minTripDays = DEFAULT_CLUSTER_OPTIONS.minTripDays,
      gapTolerance = DEFAULT_CLUSTER_OPTIONS.gapTolerance,
    } = req.query as Record<string, string | undefined>;

    const currentUser = await getCurrentUser(req);
    if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

    // Per-day aggregation: count, centroid, dominant city/country via PG MODE().
    const rows = (await db
      .select({
        date: sql<string>`TO_CHAR(DATE(${exif.dateTimeOriginal}), 'YYYY-MM-DD')`,
        assetCount: count(assets.id),
        centroidLat: avg(exif.latitude),
        centroidLon: avg(exif.longitude),
        cityMode: sql<string | null>`MODE() WITHIN GROUP (ORDER BY ${exif.city})`,
        countryMode: sql<string | null>`MODE() WITHIN GROUP (ORDER BY ${exif.country})`,
      })
      .from(assets)
      .leftJoin(albumsAssetsAssets, eq(assets.id, albumsAssetsAssets.assetId))
      .leftJoin(exif, eq(assets.id, exif.assetId))
      .where(
        and(
          eq(assets.ownerId, currentUser.id),
          eq(assets.visibility, "timeline"),
          isNull(albumsAssetsAssets.albumId),
          isNotNull(exif.dateTimeOriginal)
        )
      )
      .groupBy(sql`DATE(${exif.dateTimeOriginal})`)) as Array<{
      date: string;
      assetCount: number | string;
      centroidLat: string | null;
      centroidLon: string | null;
      cityMode: string | null;
      countryMode: string | null;
    }>;

    const days: DaySignal[] = rows.map((r) => ({
      date: r.date,
      assetCount: Number(r.assetCount),
      cityMode: r.cityMode,
      countryMode: r.countryMode,
      centroidLat: r.centroidLat == null ? null : Number(r.centroidLat),
      centroidLon: r.centroidLon == null ? null : Number(r.centroidLon),
    }));

    const home = computeHome(days);
    const trips = clusterTrips(days, {
      home,
      homeRadiusKm: Number(homeRadiusKm),
      minTripDays: Number(minTripDays),
      gapTolerance: Number(gapTolerance),
    });

    return res.status(200).json({ home, trips });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error?.message });
  }
}
