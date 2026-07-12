import { appDb } from "@/db";
import { locationFavorites } from "@/db/schema/locationFavorites.schema";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { and, eq } from "drizzle-orm";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

  const { id } = req.query as { id: string };
  const owned = and(
    eq(locationFavorites.id, id),
    eq(locationFavorites.ownerId, currentUser.id)
  );

  const [existing] = await appDb.select().from(locationFavorites).where(owned);
  if (!existing) return res.status(404).json({ message: "Favourite not found" });

  if (req.method === "PATCH") {
    const { name, latitude, longitude } = req.body ?? {};
    const updates: Partial<typeof locationFavorites.$inferInsert> = {};
    if (name !== undefined) {
      const trimmedName = typeof name === "string" ? name.trim() : "";
      if (!trimmedName) return res.status(400).json({ message: "Name cannot be empty" });
      updates.name = trimmedName;
    }
    if (latitude !== undefined || longitude !== undefined) {
      if (
        typeof latitude !== "number" ||
        typeof longitude !== "number" ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      ) {
        return res.status(400).json({ message: "Valid latitude and longitude are required" });
      }
      updates.latitude = latitude;
      updates.longitude = longitude;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "Nothing to update" });
    }
    await appDb.update(locationFavorites).set(updates).where(owned);
    const [row] = await appDb.select().from(locationFavorites).where(owned);
    return res.status(200).json(row);
  }

  if (req.method === "DELETE") {
    await appDb.delete(locationFavorites).where(owned);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ message: "Method not allowed" });
}
