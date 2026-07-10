// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { assets } from "@/schema";
import { and, between, eq, gte, sql } from "drizzle-orm";
import { count } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

/**
 * Fill gaps in a date-indexed series so the heatmap always has 365ish cells
 * drawn, even for dates with zero photos.
 *
 * - No `year` → 12-month rolling window ending today (legacy behaviour).
 * - `year` given → fill every day of that calendar year.
 */
function fillMissingDates(data: Array<{ date: string; count: number }>, year?: number) {
  const existing = new Map(data.map((d) => [d.date, d]));

  let start: Date;
  let end: Date;
  if (year) {
    start = new Date(Date.UTC(year, 0, 1));
    end = new Date(Date.UTC(year, 11, 31));
  } else {
    end = new Date();
    start = new Date(end.getFullYear() - 1, end.getMonth() + 1, 1);
  }

  const filled: Array<{ date: string; count: number }> = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    // Legacy quirk preserved: skip days that land in the repeating "current
    // month" of the previous year in the rolling 12-month window, so the
    // heatmap isn't double-counted on the seam.
    if (!year && d.getFullYear() === end.getFullYear() - 1 && d.getMonth() === end.getMonth()) {
      continue;
    }
    const key = formatDate(d);
    filled.push(existing.get(key) ?? { date: key, count: 0 });
  }
  filled.sort((a, b) => a.date.localeCompare(b.date));
  return filled;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

    const rawYear = (req.query.year as string | undefined)?.trim();
    const year =
      rawYear && /^\d{4}$/.test(rawYear) ? Number.parseInt(rawYear, 10) : undefined;

    // Range clause: either a whole calendar year, or the legacy 12-month rolling window.
    const rangeClause = year
      ? between(
          assets.fileCreatedAt,
          sql`${`${year}-01-01`}::timestamptz`,
          sql`${`${year}-12-31 23:59:59`}::timestamptz`
        )
      : gte(assets.fileCreatedAt, sql`CURRENT_DATE - INTERVAL '1 YEAR'`);

    const [dataFromDB, yearsRaw] = await Promise.all([
      db
        .select({
          date: sql<string>`TO_CHAR(DATE(${assets.fileCreatedAt}), 'YYYY-MM-DD')`.as("date"),
          count: count(),
        })
        .from(assets)
        .where(and(eq(assets.ownerId, currentUser.id), rangeClause))
        .groupBy(sql`DATE(${assets.fileCreatedAt})`)
        .orderBy(sql`DATE(${assets.fileCreatedAt}) DESC`),
      // Distinct years the user has assets for, for the UI year selector.
      db
        .select({
          year: sql<number>`EXTRACT(YEAR FROM ${assets.fileCreatedAt})::int`.as("year"),
        })
        .from(assets)
        .where(eq(assets.ownerId, currentUser.id))
        .groupBy(sql`EXTRACT(YEAR FROM ${assets.fileCreatedAt})`)
        .orderBy(sql`EXTRACT(YEAR FROM ${assets.fileCreatedAt}) DESC`),
    ]);

    const filled = fillMissingDates(
      (dataFromDB as Array<{ date: string; count: number }>),
      year
    );

    return res.status(200).json({
      data: filled,
      year: year ?? null,
      availableYears: (yearsRaw as Array<{ year: number }>).map((r) => r.year).filter(Boolean),
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error?.message });
  }
}
