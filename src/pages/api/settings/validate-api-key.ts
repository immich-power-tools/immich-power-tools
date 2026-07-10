import { ENV } from "@/config/environment";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { NextApiRequest, NextApiResponse } from "next";
import { WORKFLOW_PERMISSIONS, getPermissionNames } from "@/config/permissions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  const currentUser = await getCurrentUser(req);
  if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

  const { apiKey, requiredPermissions } = req.body;
  if (!apiKey) return res.status(400).json({ message: "apiKey is required" });

  const REQUIRED_PERMISSIONS: string[] = Array.isArray(requiredPermissions) ? requiredPermissions : getPermissionNames(WORKFLOW_PERMISSIONS);

  try {
    const keyRes = await fetch(`${ENV.IMMICH_URL}/api/api-keys/me`, {
      headers: { "x-api-key": apiKey },
    });

    if (!keyRes.ok) {
      return res.status(200).json({
        valid: false,
        error: "Invalid API key — could not authenticate with Immich",
        permissions: [],
        missing: REQUIRED_PERMISSIONS,
      });
    }

    const keyData = await keyRes.json();
    const granted: string[] = keyData.permissions ?? [];
    // A key created with the "All" checkbox reports its permissions as ["all"],
    // which grants every permission without listing them individually.
    const missing = granted.includes("all")
      ? []
      : REQUIRED_PERMISSIONS.filter((p) => !granted.includes(p));

    return res.status(200).json({
      valid: missing.length === 0,
      error: missing.length > 0 ? `Missing permissions: ${missing.join(", ")}` : null,
      permissions: granted,
      missing,
    });
  } catch (error: any) {
    return res.status(200).json({
      valid: false,
      error: `Could not connect to Immich: ${error.message}`,
      permissions: [],
      missing: REQUIRED_PERMISSIONS,
    });
  }
}
