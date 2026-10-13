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
  
  const { id } = req.query;
  const targetUrl = `${ENV.IMMICH_URL}/api/people/${id}/thumbnail`;

  const currentUser = await getCurrentUser(req);

  if (!currentUser) {
    return res.status(403).json({ message: 'Forbidden' })
  }

  try {
    // Forward the request to the target API
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: getUserHeaders(currentUser, {
        'Content-Type': 'application/octet-stream',
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    // Get the image data from the response
    const imageBuffer = await response.arrayBuffer()

    // Set the appropriate headers for the image response
    res.setHeader('Content-Type', response.headers.get('Content-Type') || 'image/png')
    res.setHeader('Content-Length', imageBuffer.byteLength)
    // Person cover thumbnails can change (Immich re-picks the face), so cap
    // the cache at a day rather than the asset proxy's week.
    res.setHeader('Cache-Control', 'private, max-age=86400')

    // Send the image data
    res.send(Buffer.from(imageBuffer))
  } catch (error) {

    res.redirect("https://placehold.co/400")
    console.error('Error:', error)
    // res.status(500).json({ message: 'Internal Server Error' })
  }
}