import type { NextApiRequest, NextApiResponse } from "next";
import { ENV } from "@/config/environment";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { getUserHeaders } from "@/helpers/user.helper";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const headers = getUserHeaders(currentUser, { "Content-Type": "application/json" });

  const result = { canUpload: false };

  // Test asset upload permission by calling a no-op endpoint
  try {
    const response = await fetch(`${ENV.IMMICH_URL}/api/assets/bulk-upload-check`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        assets: [{ id: "permission-check", checksum: "0000000000000000000000000000000000000000" }],
      }),
    });
    result.canUpload = response.ok;
  } catch {
    result.canUpload = false;
  }

  return res.status(200).json(result);
}
