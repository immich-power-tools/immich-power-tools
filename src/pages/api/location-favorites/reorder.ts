import { appDb } from "@/db";
import { locationFavorites } from "@/db/schema/locationFavorites.schema";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { and, eq } from "drizzle-orm";
import { NextApiRequest, NextApiResponse } from "next";

// PUT { ids: string[] } — the user's favourites in their new display order.
// sortOrder becomes the array index; ids not owned by the caller are ignored.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

  if (req.method !== "PUT") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    return res.status(400).json({ message: "ids must be an array of strings" });
  }

  for (let i = 0; i < ids.length; i++) {
    await appDb
      .update(locationFavorites)
      .set({ sortOrder: i })
      .where(
        and(
          eq(locationFavorites.id, ids[i]),
          eq(locationFavorites.ownerId, currentUser.id)
        )
      );
  }

  return res.status(200).json({ success: true });
}
