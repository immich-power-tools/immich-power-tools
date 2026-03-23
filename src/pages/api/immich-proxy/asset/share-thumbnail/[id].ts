// pages/api/proxy.js

import { ENV } from '@/config/environment';
import { appDb } from '@/db';
import { apiKeys } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { verify } from 'jsonwebtoken';
import { NextApiRequest, NextApiResponse } from 'next'

export const config = {
  api: {
    bodyParser: false,
  },
}


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' })
  }

  const { id, size, token, p } = req.query;
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  let userId: string;
  try {
    const previewDecoded = verify(token as string, ENV.JWT_SECRET) as { token: string };
    const mainDecoded = verify(previewDecoded.token, ENV.JWT_SECRET) as { userId: string };
    userId = mainDecoded.userId;
  } catch (error) {
    return res.status(401).json({ message: 'Token is invalid' })
  }

  const [keyRow] = await appDb
    .select({ secret: apiKeys.secret })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.purpose, "share")))
    .limit(1);

  if (!keyRow) {
    return res.status(403).json({ message: 'Share key not configured. Please set up sharing in Power Tools.' });
  }

  const resource = p === "true" ? "people" : "assets";
  const baseURL = `${ENV.IMMICH_URL}/api/${resource}/${id}`;
  const version = size === "original" ? "original" : "thumbnail";
  let targetUrl = `${baseURL}/${version}?size=${size}`;

  try {
    // Forward the request to the target API
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-api-key': keyRow.secret,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error("Error fetching thumbnail " + error.message)
    }

    // Get the image data from the response
    const imageBuffer = await response.arrayBuffer()

    // Set the appropriate headers for the image response
    res.setHeader('Content-Type', response.headers.get('Content-Type') || 'image/png')
    res.setHeader('Content-Length', imageBuffer.byteLength)

    // Send the image data
    res.send(Buffer.from(imageBuffer))
  } catch (error: any) {
    res.redirect("https://placehold.co/400")
    console.error('Error:', error)
  }
}