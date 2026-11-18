import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { APIError } from "@/lib/api";
import { scanMissingOriginals } from "@/lib/missing-originals/scanner";
import { MissingOriginalsConfigError } from "@/lib/missing-originals/pathMapper";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const result = await scanMissingOriginals({ ownerId: currentUser.id });
    return res.status(200).json(result);
  } catch (error: any) {
    if (error instanceof MissingOriginalsConfigError || error instanceof APIError) {
      return res.status(error instanceof APIError ? error.status : 400).json({ message: error.message });
    }

    console.error("Missing originals scan failed:", error);
    return res.status(500).json({ message: "Failed to scan missing originals" });
  }
}

export const config = {
  api: {
    responseLimit: false,
  },
};
