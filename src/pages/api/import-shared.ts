import type { NextApiRequest, NextApiResponse } from "next";
import { detectNextcloud, checkPasswordProtection, listNextcloudFiles } from "./import-shared/nextcloud";
import { detectEnte, fetchEnteAlbum } from "./import-shared/ente";

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
  // Ente-specific encryption artifacts (optional)
  enteFileKey?: string;
  enteFileDecryptionHeader?: string;
  enteThumbnailDecryptionHeader?: string;
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
  platform: "immich" | "nextcloud" | "ente";
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
  // Ente-specific (optional)
  enteApiBase?: string;
  enteAlbumKey?: string;
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
    let errorBody: { message?: string } = {};
    try { errorBody = await response.json(); } catch { /* ignore */ }
    if (response.status === 401 && errorBody.message === "Password required") {
      const err = new Error("PASSWORD_REQUIRED");
      (err as any).code = "PASSWORD_REQUIRED";
      throw err;
    }
    if (response.status === 401 && errorBody.message === "Invalid password") {
      const err = new Error("Invalid password for this shared link.");
      (err as any).code = "INVALID_PASSWORD";
      throw err;
    }
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
  const password = payload?.password;

  if (!link || typeof link !== "string") {
    return respondWithError(res, 400, "A shared album link is required");
  }

  // Detect platform from the URL
  const nextcloud = detectNextcloud(link);

  if (nextcloud) {
    // ── Nextcloud flow ──
    try {
      if (!password) {
        const isProtected = await checkPasswordProtection(nextcloud.baseUrl, nextcloud.token);
        if (isProtected) {
          return res.status(401).json({ error: "PASSWORD_REQUIRED" });
        }
      }

      const { metadata, files } = await listNextcloudFiles(nextcloud.baseUrl, nextcloud.token, password ?? "");

      const assets: IImportSharedAsset[] = files.map((file) => ({
        id: file.relativePath,
        originalFileName: file.fileName,
        type: file.type,
        fileCreatedAt: file.lastModified ?? null,
        localDateTime: null,
        description: null,
        location: null,
        thumbhash: file.blurhash ?? null,
        fileSizeInByte: file.size || null,
      }));

      // Derive date range from file modification dates
      const dates = files
        .map((f) => f.lastModified ? new Date(f.lastModified).getTime() : NaN)
        .filter((t) => !Number.isNaN(t));
      const startDate = dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : null;
      const endDate = dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null;

      const albumName = metadata.displayName || "Nextcloud Share";
      const owner = metadata.ownerId
        ? { name: metadata.ownerId, email: null }
        : null;

      const responseBody: IImportSharedResponse = {
        platform: "nextcloud",
        link: link.trim(),
        origin: nextcloud.baseUrl,
        key: nextcloud.token,
        sharedLink: {
          id: nextcloud.token,
          type: "FOLDER",
          createdAt: new Date().toISOString(),
          expiresAt: null,
          allowUpload: false,
          allowDownload: true,
          showMetadata: true,
        },
        album: {
          albumName,
          assetCount: assets.length,
          owner,
          description: null,
          startDate,
          endDate,
          shared: true,
          hasSharedLink: true,
          lastModifiedAssetTimestamp: endDate,
          order: null,
          contributorCounts: [],
          assets,
        },
      };

      return res.status(200).json(responseBody);
    } catch (error: any) {
      if (error?.code === "PASSWORD_REQUIRED") {
        return res.status(401).json({ error: "PASSWORD_REQUIRED" });
      }
      console.error("Nextcloud import shared error", error);
      return respondWithError(res, 500, error?.message ?? "Failed to fetch Nextcloud share");
    }
  }

  // ── Ente flow ──
  const ente = detectEnte(link);
  if (ente) {
    try {
      const result = await fetchEnteAlbum(link);

      const assets: IImportSharedAsset[] = result.files.map((f) => ({
        id: f.id,
        originalFileName: f.title,
        type: f.type,
        fileCreatedAt: f.creationTime
          ? new Date(f.creationTime / 1000).toISOString()
          : null,
        localDateTime: f.modificationTime
          ? new Date(f.modificationTime / 1000).toISOString()
          : null,
        description: null,
        location: null,
        thumbhash: null,
        fileSizeInByte: f.fileSize ?? null,
        enteFileKey: f.fileKey,
        enteFileDecryptionHeader: f.fileDecryptionHeader,
        enteThumbnailDecryptionHeader: f.thumbnailDecryptionHeader,
      }));

      const dates = result.files
        .map((f) => f.creationTime)
        .filter((t) => t > 0);
      const startDate =
        dates.length > 0
          ? new Date(Math.min(...dates) / 1000).toISOString()
          : null;
      const endDate =
        dates.length > 0
          ? new Date(Math.max(...dates) / 1000).toISOString()
          : null;

      const responseBody: IImportSharedResponse = {
        platform: "ente",
        link: link.trim(),
        origin: result.apiBase,
        key: result.token,
        sharedLink: {
          id: result.token,
          type: "ALBUM",
          createdAt: new Date().toISOString(),
          expiresAt: null,
          allowUpload: false,
          allowDownload: true,
          showMetadata: true,
        },
        album: {
          albumName: result.albumName,
          assetCount: assets.length,
          owner: null,
          description: null,
          startDate,
          endDate,
          shared: true,
          hasSharedLink: true,
          lastModifiedAssetTimestamp: endDate,
          order: null,
          contributorCounts: [],
          assets,
        },
        enteApiBase: result.apiBase,
        enteAlbumKey: result.albumKeyB58,
      };

      return res.status(200).json(responseBody);
    } catch (error: any) {
      console.error("Ente import shared error", error);
      return respondWithError(
        res,
        500,
        error?.message ?? "Failed to fetch Ente album"
      );
    }
  }

  // ── Immich flow ──
  const parsed = parseSharedLink(link);
  if (!parsed) {
    return respondWithError(res, 400, "Invalid share link. Supported: Immich, Nextcloud, or Ente share URLs.");
  }

  const authQuery = password
    ? `key=${parsed.key}&password=${encodeURIComponent(password)}`
    : `key=${parsed.key}`;

  try {
    const sharedLink = await fetchJson<ImmichSharedLinkResponse>(
      `${parsed.origin}/api/shared-links/me?${authQuery}`
    );

    const albumId = sharedLink.album?.id;
    let albumResult: IImportSharedAlbum | null = null;

    if (albumId) {
      const album = await fetchJson<ImmichAlbumResponse>(
        `${parsed.origin}/api/albums/${albumId}?${authQuery}&withoutAssets=false`
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
      platform: "immich",
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
    if (error?.code === "PASSWORD_REQUIRED") {
      return res.status(401).json({ error: "PASSWORD_REQUIRED" });
    }
    if (error?.code === "INVALID_PASSWORD") {
      return res.status(401).json({ error: error.message });
    }
    console.error("Import shared error", error);
    return respondWithError(res, 500, error?.message ?? "Failed to import shared album");
  }
}
