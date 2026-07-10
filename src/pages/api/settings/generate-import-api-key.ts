import { ENV } from "@/config/environment";
import { appDb } from "@/db";
import { settings } from "@/db/schema/settings.schema";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { getUserHeaders } from "@/helpers/user.helper";
import { and, eq } from "drizzle-orm";
import { NextApiRequest, NextApiResponse } from "next";
import { IMPORT_PERMISSIONS, getPermissionNames } from "@/config/permissions";

export const IMPORT_API_KEY_SETTING = "import_api_key";
const IMPORT_KEY_NAME = "Power Tools Import Key";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  const currentUser = await getCurrentUser(req);
  if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

  const immichRes = await fetch(`${ENV.IMMICH_URL}/api/api-keys`, {
    method: "POST",
    headers: getUserHeaders(currentUser, { "Content-Type": "application/json" }),
    body: JSON.stringify({ name: IMPORT_KEY_NAME, permissions: getPermissionNames(IMPORT_PERMISSIONS) }),
  });

  if (!immichRes.ok) {
    const err = await immichRes.json().catch(() => ({}));
    return res.status(immichRes.status).json({ message: err.message ?? "Failed to create API key in Immich" });
  }

  const { secret } = await immichRes.json();

  const [existing] = await appDb
    .select()
    .from(settings)
    .where(and(eq(settings.key, IMPORT_API_KEY_SETTING), eq(settings.ownerId, currentUser.id)));

  if (existing) {
    await appDb.update(settings).set({ value: secret }).where(eq(settings.id, existing.id));
  } else {
    await appDb.insert(settings).values({ key: IMPORT_API_KEY_SETTING, value: secret, ownerId: currentUser.id });
  }

  return res.status(200).json({ success: true });
}
