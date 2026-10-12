import { ENV } from "@/config/environment";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { getUserHeaders } from "@/helpers/user.helper";
import { APIError } from "@/lib/api";
import { scanMissingOriginals } from "@/lib/missing-originals/scanner";
import { MissingOriginalsConfigError } from "@/lib/missing-originals/pathMapper";
import type { NextApiRequest, NextApiResponse } from "next";

const parseIds = (body: any) => {
  if (!body || !Array.isArray(body.ids)) {
    return [];
  }

  return body.ids.filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const ids = parseIds(req.body);
    if (ids.length === 0) {
      return res.status(400).json({ message: "No asset IDs were provided" });
    }

    const recheck = await scanMissingOriginals({ ownerId: currentUser.id, onlyIds: ids });
    const recheckedMissingIds = recheck.missing.map((asset) => asset.id);

    if (recheck.unsafeToTrash) {
      return res.status(409).json({
        message: `Safety stop: ${recheck.safetyPercent.toFixed(2)}% of active assets are selected and missing, above the configured ${recheck.maxMissingPercent}% limit.`,
      });
    }

    if (recheckedMissingIds.length === 0) {
      return res.status(409).json({ message: "No selected assets are currently missing on disk" });
    }

    const response = await fetch(`${ENV.IMMICH_URL}/api/assets`, {
      method: "DELETE",
      headers: getUserHeaders(currentUser, { "Content-Type": "application/json" }),
      body: JSON.stringify({ ids: recheckedMissingIds, force: false }),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        message: text || "Immich API failed to move missing assets to Trash",
      });
    }

    return res.status(200).json({
      trashedCount: recheckedMissingIds.length,
      ids: recheckedMissingIds,
    });
  } catch (error: any) {
    if (error instanceof MissingOriginalsConfigError || error instanceof APIError) {
      return res.status(error instanceof APIError ? error.status : 400).json({ message: error.message });
    }

    console.error("Missing originals trash failed:", error);
    return res.status(500).json({ message: "Failed to move missing originals to Trash" });
  }
}
