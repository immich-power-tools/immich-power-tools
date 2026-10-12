// pages/api/proxy.js

import { ENV } from '@/config/environment';
import { getCurrentUser } from '@/handlers/serverUtils/user.utils';
import { getUserHeaders } from '@/helpers/user.helper';
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
  
  const { id, size } = req.query;
  const targetUrl = `${ENV.IMMICH_URL}/api/assets/${id}/thumbnail?size=${size || 'thumbnail'}`;

  const user = await getCurrentUser(req);
  if (!user) {
    return res.status(403).json({ message: 'Unauthorized' })
  }
  try {
    // Forward the request to the target API
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: getUserHeaders(user, {
        'Content-Type': 'application/octet-stream',
      }),
    })

    if (!response.ok) {
      console.error('HTTP error:', response.status, await response.text())
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
    res.status(500).json({ message: 'Internal Server Error' })
  }
}
