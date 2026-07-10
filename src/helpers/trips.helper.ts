/**
 * Trip clustering for the Potential Albums "Trips" view.
 *
 * Given per-day signals (asset count, mode city/country, GPS centroid),
 * identify multi-day stretches where the user was "away" from home,
 * tolerating small gaps (transit days, days with no photos).
 *
 * Pure functions — no DB, no network. Easy to unit-test.
 */

import { differenceInCalendarDays, parseISO } from "date-fns";

export interface DaySignal {
  /** YYYY-MM-DD */
  date: string;
  assetCount: number;
  /** most common city for that day's assets, null if unknown */
  cityMode: string | null;
  /** most common country for that day's assets, null if unknown */
  countryMode: string | null;
  /** mean lat/lon of that day's assets, null if no asset had GPS */
  centroidLat: number | null;
  centroidLon: number | null;
}

export interface Trip {
  /** YYYY-MM-DD of the first away day */
  startDate: string;
  /** YYYY-MM-DD of the last away day */
  endDate: string;
  /** dominant city across the trip's away days (null if none known) */
  cityName: string | null;
  countryName: string | null;
  assetCount: number;
  dayCount: number;
  /** days classified as away (rest are tolerated gaps) */
  awayDays: number;
  /** suggested album name: "YYYYMMDD - City" or "YYYYMMDD - Trip" */
  suggestedName: string;
}

export interface Home {
  city: string | null;
  lat: number | null;
  lon: number | null;
}

export interface ClusterOptions {
  home: Home;
  /** radius in km from `home` to treat a day as "at home" (default 50) */
  homeRadiusKm: number;
  /** minimum count of away days for a stretch to qualify as a trip (default 2) */
  minTripDays: number;
  /** maximum consecutive non-away days tolerated inside a trip (default 2) */
  gapTolerance: number;
}

export const DEFAULT_CLUSTER_OPTIONS: Omit<ClusterOptions, "home"> = {
  homeRadiusKm: 50,
  minTripDays: 2,
  gapTolerance: 2,
};

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius (km)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Pick the library's home as the most asset-rich city, and compute a centroid
 * from the GPS of that city's days.
 */
export function computeHome(days: DaySignal[]): Home {
  if (days.length === 0) return { city: null, lat: null, lon: null };

  const cityCounts = new Map<string, number>();
  for (const d of days) {
    if (d.cityMode) cityCounts.set(d.cityMode, (cityCounts.get(d.cityMode) ?? 0) + d.assetCount);
  }
  const homeCity = [...cityCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const homeDays = days.filter(
    (d) => d.cityMode === homeCity && d.centroidLat != null && d.centroidLon != null
  );
  const totalWeight = homeDays.reduce((s, d) => s + d.assetCount, 0);
  if (totalWeight === 0) return { city: homeCity, lat: null, lon: null };

  const lat =
    homeDays.reduce((s, d) => s + (d.centroidLat as number) * d.assetCount, 0) / totalWeight;
  const lon =
    homeDays.reduce((s, d) => s + (d.centroidLon as number) * d.assetCount, 0) / totalWeight;

  return { city: homeCity, lat, lon };
}

export function isAwayDay(day: DaySignal, opts: ClusterOptions): boolean {
  const { home, homeRadiusKm } = opts;
  // Prefer geo distance when both sides have it
  if (
    day.centroidLat != null &&
    day.centroidLon != null &&
    home.lat != null &&
    home.lon != null
  ) {
    return haversineKm(day.centroidLat, day.centroidLon, home.lat, home.lon) > homeRadiusKm;
  }
  // Fall back to string city comparison
  if (day.cityMode && home.city) {
    return day.cityMode !== home.city;
  }
  // No signal — treat as home to avoid false trips
  return false;
}

function suggestName(startDate: string, cityName: string | null): string {
  const compact = startDate.replace(/-/g, "");
  return `${compact} - ${cityName ?? "Trip"}`;
}

function modeBy<T, K>(items: T[], weight: (t: T) => number, key: (t: T) => K | null): K | null {
  const counts = new Map<K, number>();
  for (const it of items) {
    const k = key(it);
    if (k == null) continue;
    counts.set(k, (counts.get(k) ?? 0) + weight(it));
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * Cluster consecutive "away" days into trips.
 *
 * Algorithm:
 *   Linear scan. When we hit an away day, keep extending the window:
 *   - another away day → extend `endIdx`
 *   - a run of non-away days ≤ gapTolerance → tolerated, keep scanning
 *   - a run > gapTolerance → close the trip at `endIdx`
 *   Emit the trip only if it has ≥ minTripDays away days.
 */
export function clusterTrips(days: DaySignal[], opts: ClusterOptions): Trip[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const away = sorted.map((d) => isAwayDay(d, opts));
  const trips: Trip[] = [];

  let i = 0;
  while (i < sorted.length) {
    if (!away[i]) {
      i += 1;
      continue;
    }
    let endIdx = i;
    let k = i + 1;
    while (k < sorted.length) {
      if (away[k]) {
        endIdx = k;
        k += 1;
        continue;
      }
      // Skip consecutive non-away days, then compare actual elapsed calendar
      // days (not array-index distance) against the next away day — `days`
      // only contains dates with ≥1 photo, so a months-long photo-less gap
      // must not look "adjacent" just because no entries sit between them.
      while (k < sorted.length && !away[k]) k += 1;
      if (k < sorted.length) {
        const gapDays = differenceInCalendarDays(parseISO(sorted[k].date), parseISO(sorted[endIdx].date));
        if (gapDays > opts.gapTolerance) break; // close trip at endIdx
      }
      // else tolerated (or no more away days left); `k` now points at next away day (or end)
    }

    const slice = sorted.slice(i, endIdx + 1);
    const awayCount = slice.filter((_, idx) => away[i + idx]).length;
    if (awayCount >= opts.minTripDays) {
      const awayOnly = slice.filter((_, idx) => away[i + idx]);
      const cityName = modeBy(
        awayOnly,
        (d) => d.assetCount,
        (d) => d.cityMode
      );
      const countryName = modeBy(
        awayOnly,
        (d) => d.assetCount,
        (d) => d.countryMode
      );
      trips.push({
        startDate: sorted[i].date,
        endDate: sorted[endIdx].date,
        cityName,
        countryName,
        assetCount: slice.reduce((s, d) => s + d.assetCount, 0),
        dayCount: endIdx - i + 1,
        awayDays: awayCount,
        suggestedName: suggestName(sorted[i].date, cityName),
      });
    }
    i = endIdx + 1;
  }
  return trips;
}
