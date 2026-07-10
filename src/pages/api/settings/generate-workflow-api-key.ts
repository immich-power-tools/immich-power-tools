import { ENV } from "@/config/environment";
import { appDb } from "@/db";
import { settings } from "@/db/schema/settings.schema";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { getUserHeaders } from "@/helpers/user.helper";
import { and, eq } from "drizzle-orm";
import { NextApiRequest, NextApiResponse } from "next";
import { WORKFLOW_PERMISSIONS, getPermissionNames } from "@/config/permissions";

const WORKFLOW_API_KEY_SETTING = "workflow_api_key";
const WORKFLOW_KEY_NAME = "Power Tools Workflow Key";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  const currentUser = await getCurrentUser(req);
  if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

  // Create a new API key in Immich with workflow permissions
  const immichRes = await fetch(`${ENV.IMMICH_URL}/api/api-keys`, {
    method: "POST",
    headers: getUserHeaders(currentUser, { "Content-Type": "application/json" }),
    body: JSON.stringify({ name: WORKFLOW_KEY_NAME, permissions: getPermissionNames(WORKFLOW_PERMISSIONS) }),
  });

  if (!immichRes.ok) {
    const err = await immichRes.json().catch(() => ({}));
    return res.status(immichRes.status).json({ message: err.message ?? "Failed to create API key in Immich" });
  }

  const { secret } = await immichRes.json();

  // Save the secret to the KV settings store as workflow_api_key
  const [existing] = await appDb
    .select()
    .from(settings)
    .where(and(eq(settings.key, WORKFLOW_API_KEY_SETTING), eq(settings.ownerId, currentUser.id)));

  if (existing) {
    await appDb.update(settings).set({ value: secret }).where(eq(settings.id, existing.id));
  } else {
    await appDb.insert(settings).values({ key: WORKFLOW_API_KEY_SETTING, value: secret, ownerId: currentUser.id });
  }

  return res.status(200).json({ success: true });
}
