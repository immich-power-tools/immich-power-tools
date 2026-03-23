import { appDb } from "@/db";
import { apiKeys } from "@/db/schema";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { eq } from "drizzle-orm";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const rows = await appDb
    .select({
      id: apiKeys.id,
      purpose: apiKeys.purpose,
      keyName: apiKeys.keyName,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, currentUser.id));

  return res.status(200).json(rows);
}
