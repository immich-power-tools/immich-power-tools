import { ENV } from "@/config/environment";
import { appDb } from "@/db";
import { apiKeys } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { JsonWebTokenError, verify } from "jsonwebtoken";
import { NextApiResponse } from "next";

import { NextApiRequest } from "next";

interface ShareLinkFilters {
  personIds: string[];
  albumIds: string[];
  startDate: string;
  endDate: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { token } = req.query;
  const { assetIds } = req.body;
  try {
    if (!token) {
      return res.status(404).json({ message: "Token not found" });
    }
    if (req.method !== "POST") {
      return res.status(405).json({ message: "Method not allowed" });
    }

    const decoded = verify(token as string, ENV.JWT_SECRET) as { userId: string };

    if (!decoded) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const [keyRow] = await appDb
      .select({ secret: apiKeys.secret })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, decoded.userId), eq(apiKeys.purpose, "share")))
      .limit(1);

    if (!keyRow) {
      return res.status(403).json({ message: "Share key not configured. Please set up sharing in Power Tools." });
    }

    const targetUrl = `${ENV.IMMICH_URL}/api/download/archive`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      body: JSON.stringify({ assetIds }),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': keyRow.secret,
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    // Get the image data from the response
    const imageBuffer = await response.arrayBuffer()

    // Set the appropriate headers for the image response
    res.setHeader('Content-Type', response.headers.get('Content-Type') || 'image/png')
    res.setHeader('Content-Length', imageBuffer.byteLength)

    // Send the image data
    res.send(Buffer.from(imageBuffer))

  } catch (error) {
    if (error instanceof JsonWebTokenError) {
      return res.status(401).json({ message: "Please check your link and try again. Looks like it's expired." });
    }
    return res.status(500).json({ message: (error as Error).message });
  }
}