// Grouping strategies for the Potential Albums list panel: group orphan
// assets either by single day, or by multi-day "trip" (consecutive away
// days). Both share one endpoint (potential-albums-dates.ts) via a
// `groupBy` param — this file holds the two DB-querying implementations.
import { db } from "@/config/db";
import { albumsAssetsAssets } from "@/schema/albumAssetsAssets.schema";
import { assets } from "@/schema/assets.schema";
import { exif } from "@/schema/exif.schema";
import { and, avg, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import {
  ClusterOptions,
  DaySignal,
  DEFAULT_CLUSTER_OPTIONS,
  clusterTrips,
  computeHome,
} from "./trips.helper";

export interface DayGroupRow {
  date: string;
  asset_count: number;
}

export const fetchDayGroups = async (ownerId: string): Promise<DayGroupRow[]> => {
  const rows = await db.select({
    date: sql`DATE(${exif.dateTimeOriginal})`,
    asset_count: count(assets.id),
  }).from(assets)
    .leftJoin(albumsAssetsAssets, eq(assets.id, albumsAssetsAssets.assetId))
    .leftJoin(exif, eq(assets.id, exif.assetId))
    .where(and(
      eq(assets.ownerId, ownerId),
      eq(assets.visibility, "timeline"),
      isNull(albumsAssetsAssets.albumId),
      isNotNull(exif.dateTimeOriginal),
    ))
    .groupBy(sql`DATE(${exif.dateTimeOriginal})`) as DayGroupRow[];

  return rows;
};

export interface TripGroupOptions extends Partial<ClusterOptions> {}

export const fetchTripGroups = async (ownerId: string, opts: TripGroupOptions = {}) => {
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
        eq(assets.ownerId, ownerId),
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
    homeRadiusKm: opts.homeRadiusKm ?? DEFAULT_CLUSTER_OPTIONS.homeRadiusKm,
    minTripDays: opts.minTripDays ?? DEFAULT_CLUSTER_OPTIONS.minTripDays,
    gapTolerance: opts.gapTolerance ?? DEFAULT_CLUSTER_OPTIONS.gapTolerance,
  });

  return { home, trips };
};
