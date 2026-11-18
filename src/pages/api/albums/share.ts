import { ENV } from "@/config/environment";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { getUserHeaders } from "@/helpers/user.helper";
import { IUser } from "@/types/user";
import { NextApiResponse } from "next";

import { NextApiRequest } from "next";

interface IAlbumShare {
  albumId: string;
  allowDownload: boolean;
  allowUpload: boolean;
  showMetadata: boolean;
}

const generateShareLink = async (album: IAlbumShare, currentUser: IUser) => {
  const url = ENV.IMMICH_URL + "/api/shared-links";
  return fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      type: "ALBUM",
      albumId: album.albumId,
      allowDownload: album.allowDownload,
      allowUpload: album.allowUpload,
      showMetadata: album.showMetadata,
    }),
    headers: getUserHeaders(currentUser, { "Content-Type": "application/json" })
  }).then(async (response) => {
    if (response.status >= 400) {
      return {
        error: "Failed to fetch assets",
        errorData: await response.json()
      };
    }
    const data = await response.json();
    return {
      ...album, 
      ...data,
      shareLink: ENV.EXTERNAL_IMMICH_URL + "/share/" + data.key
    };
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const currentUser = await getCurrentUser(req);
  
  if (!currentUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { albums } = req.body as { albums: IAlbumShare[] };
  if (!albums) {  
    return res.status(400).json({ error: 'albums is required' });
  }

  const shareLinks = await Promise.all(albums.map(async (album) => {
    return generateShareLink(album, currentUser);
  }));
  return res.status(200).json(shareLinks);
}