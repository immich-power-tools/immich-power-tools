// Fetches orphan assets for the Potential Albums right-panel grid, either
// for a single day (default) or a date range (`?groupBy=trip`) — see
// src/helpers/potentialAlbumsAssets.helper.ts for the two implementations.
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { fetchDayAssets, fetchTripAssets } from "@/helpers/potentialAlbumsAssets.helper";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

    const { groupBy = "day", startDate, endDate, city } = req.query as {
      groupBy?: string;
      startDate?: string;
      endDate?: string;
      city?: string;
    };

    if (groupBy === "trip") {
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required (YYYY-MM-DD)" });
      }
      // Interpolated into raw SQL below, so reject anything that isn't a
      // plain date to keep this endpoint from becoming an injection vector.
      const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
      if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
        return res.status(400).json({ error: "Invalid date format, expected YYYY-MM-DD" });
      }
      const cleaned = await fetchTripAssets(currentUser.id, startDate, endDate, city ?? null);
      return res.status(200).json(cleaned);
    }

    if (!startDate) {
      return res.status(400).json({ error: "startDate is required (YYYY-MM-DD)" });
    }
    const cleaned = await fetchDayAssets(currentUser.id, startDate);
    return res.status(200).json(cleaned);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({
      error: error?.message,
    });
  }
}
