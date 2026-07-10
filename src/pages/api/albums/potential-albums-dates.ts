// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
// Groups orphan assets for the Potential Albums list panel, either by single
// day (default) or by trip (`?groupBy=trip`, consecutive away days) — see
// src/helpers/potentialAlbumsGrouping.helper.ts for the two implementations.
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { parseDate } from "@/helpers/date.helper";
import { fetchDayGroups, fetchTripGroups } from "@/helpers/potentialAlbumsGrouping.helper";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

    const { groupBy = "day" } = req.query as { groupBy?: string };

    if (groupBy === "trip") {
      const { homeRadiusKm, minTripDays, gapTolerance } = req.query as Record<string, string | undefined>;
      const result = await fetchTripGroups(currentUser.id, {
        homeRadiusKm: homeRadiusKm !== undefined ? Number(homeRadiusKm) : undefined,
        minTripDays: minTripDays !== undefined ? Number(minTripDays) : undefined,
        gapTolerance: gapTolerance !== undefined ? Number(gapTolerance) : undefined,
      });
      return res.status(200).json(result);
    }

    const { sortBy = "date", sortOrder = "desc", minAssets = 1 } = req.query as any;
    const rows = await fetchDayGroups(currentUser.id);

    const filteredRows = rows.filter((row) => Number(row.asset_count) >= Number(minAssets));
    if (sortBy === "date") {
      filteredRows.sort((a, b) => {
        const aDate = parseDate(a.date as string, "yyyy-MM-dd");
        const bDate = parseDate(b.date as string, "yyyy-MM-dd");
        return sortOrder === "asc" ? aDate.getTime() - bDate.getTime() : bDate.getTime() - aDate.getTime();
      });
    } else if (sortBy === "asset_count") {
      filteredRows.sort((a, b) => sortOrder === "asc" ? a.asset_count - b.asset_count : b.asset_count - a.asset_count);
    }
    return res.status(200).json(filteredRows);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({
      error: error?.message,
    });
  }
}
