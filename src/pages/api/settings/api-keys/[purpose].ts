import { ENV } from "@/config/environment";
import { appDb } from "@/db";
import { apiKeys } from "@/db/schema";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { getUserHeaders } from "@/helpers/user.helper";
import { and, eq } from "drizzle-orm";
import { NextApiRequest, NextApiResponse } from "next";

const PURPOSE_CONFIG: Record<string, { keyName: string; permissions: string[] }> = {
  share: {
    keyName: "Power Tools Share Key",
    permissions: ["asset.view", "asset.download"],
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { purpose } = req.query as { purpose: string };

  if (req.method === "DELETE") {
    const [row] = await appDb
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, currentUser.id), eq(apiKeys.purpose, purpose)))
      .limit(1);

    if (!row) {
      return res.status(404).json({ message: "API key not found" });
    }

    await fetch(`${ENV.IMMICH_URL}/api/api-keys/${row.immichKeyId}`, {
      method: "DELETE",
      headers: getUserHeaders(currentUser, { "Content-Type": "application/json" }),
    });

    await appDb
      .delete(apiKeys)
      .where(and(eq(apiKeys.userId, currentUser.id), eq(apiKeys.purpose, purpose)));

    return res.status(200).json({ success: true });
  }

  if (req.method === "PUT") {
    const config = PURPOSE_CONFIG[purpose];
    if (!config) {
      return res.status(400).json({ message: `Unknown purpose: ${purpose}` });
    }

    // Delete old key from Immich if it exists
    const [existing] = await appDb
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, currentUser.id), eq(apiKeys.purpose, purpose)))
      .limit(1);

    if (existing) {
      await fetch(`${ENV.IMMICH_URL}/api/api-keys/${existing.immichKeyId}`, {
        method: "DELETE",
        headers: getUserHeaders(currentUser, { "Content-Type": "application/json" }),
      });
    }

    // Create new key in Immich
    const immichRes = await fetch(`${ENV.IMMICH_URL}/api/api-keys`, {
      method: "POST",
      headers: getUserHeaders(currentUser, { "Content-Type": "application/json" }),
      body: JSON.stringify({ name: config.keyName, permissions: config.permissions }),
    });

    if (!immichRes.ok) {
      const err = await immichRes.json().catch(() => ({}));
      return res.status(immichRes.status).json({ message: err.message ?? "Failed to create API key in Immich" });
    }

    const { secret, apiKey } = await immichRes.json();

    await appDb
      .insert(apiKeys)
      .values({ userId: currentUser.id, purpose, keyName: config.keyName, secret, immichKeyId: apiKey.id })
      .onConflictDoUpdate({
        target: [apiKeys.userId, apiKeys.purpose],
        set: { secret, immichKeyId: apiKey.id, keyName: config.keyName },
      });

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ message: "Method not allowed" });
}
