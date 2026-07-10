import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { tags } from "@/schema";
import { asc, eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

    const rows = await db
      .select({
        id: tags.id,
        value: tags.value,
        color: tags.color,
        parentId: tags.parentId,
      })
      .from(tags)
      .where(eq(tags.userId, currentUser.id))
      .orderBy(asc(tags.value));

    return res.status(200).json({ tags: rows });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
}
