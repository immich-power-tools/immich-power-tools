import { appDb } from "@/db";
import { locationFavorites } from "@/db/schema/locationFavorites.schema";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { asc, eq, max } from "drizzle-orm";
import { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";

const isValidCoords = (latitude: unknown, longitude: unknown) =>
  typeof latitude === "number" &&
  typeof longitude === "number" &&
  Math.abs(latitude) <= 90 &&
  Math.abs(longitude) <= 180;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

  if (req.method === "GET") {
    const rows = await appDb
      .select()
      .from(locationFavorites)
      .where(eq(locationFavorites.ownerId, currentUser.id))
      .orderBy(asc(locationFavorites.sortOrder), asc(locationFavorites.name));
    return res.status(200).json(rows);
  }

  if (req.method === "POST") {
    const { name, latitude, longitude } = req.body ?? {};
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return res.status(400).json({ message: "Name is required" });
    }
    if (!isValidCoords(latitude, longitude)) {
      return res.status(400).json({ message: "Valid latitude and longitude are required" });
    }
    const id = randomUUID();
    const [{ maxOrder }] = await appDb
      .select({ maxOrder: max(locationFavorites.sortOrder) })
      .from(locationFavorites)
      .where(eq(locationFavorites.ownerId, currentUser.id));
    await appDb.insert(locationFavorites).values({
      id,
      ownerId: currentUser.id,
      name: trimmedName,
      latitude,
      longitude,
      sortOrder: (maxOrder ?? -1) + 1,
    });
    const [row] = await appDb
      .select()
      .from(locationFavorites)
      .where(eq(locationFavorites.id, id));
    return res.status(201).json(row);
  }

  return res.status(405).json({ message: "Method not allowed" });
}
