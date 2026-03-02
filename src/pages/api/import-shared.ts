import type { NextApiRequest, NextApiResponse } from "next";

interface IAlbumContributorCount {
  userId: string;
  assetCount: number;
}

interface ImmichOwner {
  name?: string | null;
  email?: string | null;
}

interface ImmichExifInfo {
  city?: string | null;
  state?: string | null;
  country?: string | null;
  description?: string | null;
  fileSizeInByte?: number | null;
}

interface ImmichAsset {
  id: string;
  originalFileName: string;
  type: string;
  fileCreatedAt?: string | null;
  localDateTime?: string | null;
  thumbhash?: string | null;
  exifInfo?: ImmichExifInfo | null;
}

interface ImmichAlbumResponse {
  albumName: string;
  assetCount?: number;
  owner?: ImmichOwner | null;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  shared?: boolean;
  hasSharedLink?: boolean;
  lastModifiedAssetTimestamp?: string | null;
  order?: string | null;
  contributorCounts?: IAlbumContributorCount[];
  assets: ImmichAsset[];
}

interface ImmichSharedLinkResponse {
  id: string;
  key: string;
  type: string;
  createdAt: string;
  expiresAt?: string | null;
  allowUpload?: boolean;
  allowDownload?: boolean;
  showMetadata?: boolean;
  album?: { id: string } | null;
}

interface IImportSharedAsset {
  id: string;
  originalFileName: string;
  type: string;
  fileCreatedAt?: string | null;
  localDateTime?: string | null;
  description?: string | null;
  location?: string | null;
  thumbhash?: string | null;
  fileSizeInByte?: number | null;
}

interface IImportSharedAlbum {
  albumName: string;
  assetCount: number;
  owner?: ImmichOwner | null;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  shared?: boolean;
  hasSharedLink?: boolean;
  lastModifiedAssetTimestamp?: string | null;
  order?: string | null;
  contributorCounts?: IAlbumContributorCount[];
  assets: IImportSharedAsset[];
}

interface IImportSharedResponse {
  link: string;
  origin: string;
  key: string;
  sharedLink: {
    id: string;
    type: string;
    createdAt: string;
    expiresAt?: string | null;
    allowUpload?: boolean;
    allowDownload?: boolean;
    showMetadata?: boolean;
  };
  album: IImportSharedAlbum | null;
}

const respondWithError = (res: NextApiResponse, status: number, message: string) => {
  return res.status(status).json({ error: message });
};

const parseSharedLink = (link: string) => {
  const trimmed = link.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    const key = segments.pop();
    if (!key) {
      return null;
    }
    return { key, origin: url.origin, original: trimmed };
  } catch (_err) {
    return null;
  }
};

const buildLocationString = (exif?: ImmichExifInfo | null) => {
  if (!exif) {
    return null;
  }
  const parts = [exif.city, exif.state, exif.country]
    .filter((value): value is string => !!value && value.trim().length > 0);
  return parts.length > 0 ? parts.join(", ") : null;
};

const fetchJson = async <T>(url: string) => {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Request failed for ${url} (status ${response.status})`);
  }
  return (await response.json()) as T;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respondWithError(res, 405, "Method Not Allowed");
  }

  const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const link = payload?.link;

  if (!link || typeof link !== "string") {
    return respondWithError(res, 400, "A shared album link is required");
  }

  const parsed = parseSharedLink(link);
  if (!parsed) {
    return respondWithError(res, 400, "Invalid Immich share link");
  }

  try {
    const sharedLink = await fetchJson<ImmichSharedLinkResponse>(
      `${parsed.origin}/api/shared-links/me?key=${parsed.key}`
    );

    const albumId = sharedLink.album?.id;
    let albumResult: IImportSharedAlbum | null = null;

    if (albumId) {
      const album = await fetchJson<ImmichAlbumResponse>(
        `${parsed.origin}/api/albums/${albumId}?key=${parsed.key}&withoutAssets=false`
      );

      const assets = (album.assets || []).map((asset) => ({
        id: asset.id,
        originalFileName: asset.originalFileName,
        type: asset.type,
        fileCreatedAt: asset.fileCreatedAt ?? null,
        localDateTime: asset.localDateTime ?? null,
        description: asset.exifInfo?.description ?? null,
        location: buildLocationString(asset.exifInfo),
        thumbhash: asset.thumbhash ?? null,
        fileSizeInByte: asset.exifInfo?.fileSizeInByte ?? null,
      } satisfies IImportSharedAsset));

      albumResult = {
        albumName: album.albumName,
        assetCount: album.assetCount ?? assets.length,
        owner: album.owner ?? null,
        description: album.description ?? null,
        startDate: album.startDate ?? null,
        endDate: album.endDate ?? null,
        shared: album.shared ?? false,
        hasSharedLink: album.hasSharedLink ?? false,
        lastModifiedAssetTimestamp: album.lastModifiedAssetTimestamp ?? null,
        order: album.order ?? null,
        contributorCounts: album.contributorCounts ?? [],
        assets,
      } satisfies IImportSharedAlbum;
    }

    const responseBody: IImportSharedResponse = {
      link: parsed.original,
      origin: parsed.origin,
      key: parsed.key,
      sharedLink: {
        id: sharedLink.id,
        type: sharedLink.type,
        createdAt: sharedLink.createdAt,
        expiresAt: sharedLink.expiresAt ?? null,
        allowUpload: sharedLink.allowUpload ?? false,
        allowDownload: sharedLink.allowDownload ?? false,
        showMetadata: sharedLink.showMetadata ?? false,
      },
      album: albumResult,
    };

    return res.status(200).json(responseBody);
  } catch (error: any) {
    console.error("Import shared error", error);
    return respondWithError(res, 500, error?.message ?? "Failed to import shared album");
  }
}
