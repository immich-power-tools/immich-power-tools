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

const deleteSingleAlbum = async (albumId: string, currentUser: IUser) => {
  const url = ENV.IMMICH_URL + "/api/albums/" + albumId;
  return fetch(url, {
    method: 'DELETE',
    headers: getUserHeaders(currentUser)
  }).then(async (response) => {
    if (response.status >= 400) {
      return {
        error: "Failed to fetch assets",
        errorData: await response.json()
      };
    }
    return {
      success: true
    };
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const currentUser = await getCurrentUser(req);
  
  if (!currentUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { albumIds } = req.body as { albumIds: string[] };
  if (!albumIds) {  
    return res.status(400).json({ error: 'albumIds is required' });
  }

  const deleteResults = await Promise.all(albumIds.map(async (albumId) => {
    return deleteSingleAlbum(albumId, currentUser);
  }));
  return res.status(200).json(deleteResults);
}