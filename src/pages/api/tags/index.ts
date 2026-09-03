import { sql } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

    // LEFT JOIN so tags with zero (visible) photos still come back with
    // assetCount 0 — Tag Manager wants to surface empty tags, not hide them.
    // Trashed/soft-deleted assets leave orphaned tag_asset rows (same Immich
    // behavior noted in face-review's queries), so they're excluded here too.
    const { rows } = await db.execute(sql`
      SELECT t.id::text AS id, t.value, t.color, t."parentId"::text AS "parentId",
             COUNT(a.id) AS "assetCount"
        FROM "tag" t
        LEFT JOIN "tag_asset" ta ON ta."tagId" = t.id
        LEFT JOIN "asset" a ON a.id = ta."assetId"
                           AND a."deletedAt" IS NULL
                           AND a.visibility IN ('timeline', 'archive')
       WHERE t."userId" = ${currentUser.id}
       GROUP BY t.id
       ORDER BY t.value
    `);

    const tagsOut = rows.map((r: any) => ({
      id: r.id,
      value: r.value,
      color: r.color,
      parentId: r.parentId,
      assetCount: +r.assetCount,
    }));

    return res.status(200).json({ tags: tagsOut });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
}
