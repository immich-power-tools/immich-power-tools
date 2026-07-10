import { ENV } from "@/config/environment";

export const POWER_TOOLS_TAG_NAME = "immich-power-tools";
export const DEVICE_ID = "immich-power-tools";

export type HeadersRecord = Record<string, string>;

interface ImmichTagResponse {
  id: string;
  name: string;
}

export const ensurePowerToolsTag = async (headers: HeadersRecord) => {
  const listResponse = await fetch(`${ENV.IMMICH_URL}/api/tags`, {
    headers,
  });

  if (!listResponse.ok) {
    throw new Error("Failed to fetch tags from Immich instance");
  }

  const tags = (await listResponse.json()) as ImmichTagResponse[];
  const existing = tags.find((tag) => tag.name === POWER_TOOLS_TAG_NAME);
  if (existing) {
    return existing;
  }

  const createResponse = await fetch(`${ENV.IMMICH_URL}/api/tags`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: POWER_TOOLS_TAG_NAME }),
  });

  if (!createResponse.ok) {
    throw new Error("Failed to create immich-power-tools tag");
  }

  return (await createResponse.json()) as ImmichTagResponse;
};

export const inferAssetTypeFromName = (fileName: string): "IMAGE" | "VIDEO" => {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension) return "IMAGE";
  switch (extension) {
    case "mp4":
    case "mov":
    case "m4v":
    case "avi":
    case "mkv":
    case "webm":
    case "3gp":
    case "3g2":
    case "mts":
    case "m2ts":
      return "VIDEO";
    default:
      return "IMAGE";
  }
};

export const parseFileNameFromDisposition = (disposition?: string | null): string | null => {
  if (!disposition) return null;
  const match = disposition.match(/filename\*?=([^;]+)/i);
  if (!match || !match[1]) return null;
  const value = match[1].trim().replace(/^UTF-8''/i, "").replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const guessContentType = (fileName: string): string => {
  const extension = fileName.toLowerCase().split(".").pop();
  switch (extension) {
    case "jpg":
    case "jpeg":
    case "jfif":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "tif":
    case "tiff":
      return "image/tiff";
    case "bmp":
      return "image/bmp";
    case "mp4":
    case "m4v":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "avi":
      return "video/x-msvideo";
    case "mkv":
      return "video/x-matroska";
    case "webm":
      return "video/webm";
    case "3gp":
    case "3g2":
      return "video/3gpp";
    case "mts":
    case "m2ts":
      return "video/MP2T";
    default:
      return "application/octet-stream";
  }
};

export const createImmichAlbum = async (albumName: string, headers: HeadersRecord): Promise<string> => {
  const response = await fetch(`${ENV.IMMICH_URL}/api/albums`, {
    method: "POST",
    headers,
    body: JSON.stringify({ albumName }),
  });
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error(`Your API key does not have permission to create albums. Try importing without creating an album, or use an API key with album.create permission.`);
    }
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to create album "${albumName}" (status ${response.status}): ${body || "Unknown error"}`);
  }
  const album = await response.json().catch(() => null);
  const albumId = album?.id;
  if (!albumId || typeof albumId !== "string") {
    throw new Error("Immich album creation response did not include an id");
  }
  return albumId;
};

export const addAssetToAlbum = async (albumId: string, assetId: string, headers: HeadersRecord): Promise<void> => {
  const response = await fetch(`${ENV.IMMICH_URL}/api/albums/${albumId}/assets`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ ids: [assetId] }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed to attach asset ${assetId} to album ${albumId} (status ${response.status}): ${body || "Unknown error"}`
    );
  }
};

export interface SharedAssetPayload {
  id: string;
  originalFileName?: string;
  type: string;
  fileCreatedAt?: string | null;
  localDateTime?: string | null;
  duration?: string | null;
  isFavorite?: boolean;
  isArchived?: boolean;
}

export interface DownloadedAssetPayload {
  buffer: Buffer;
  fileName: string;
  contentType: string | null;
}

export const uploadAssetBuffer = async (
  asset: SharedAssetPayload,
  payload: DownloadedAssetPayload,
  uploadHeaders: HeadersRecord,
  jsonHeaders: HeadersRecord,
  tagId?: string
): Promise<string> => {
  const fileType = asset.type ?? inferAssetTypeFromName(payload.fileName);
  const resolvedFileName = payload.fileName || asset.originalFileName || `${asset.id}.bin`;
  const contentType = payload.contentType ?? guessContentType(resolvedFileName);
  const uint8Array = new Uint8Array(payload.buffer.byteLength);
  uint8Array.set(payload.buffer);
  const blob = new Blob([uint8Array.buffer], { type: contentType });
  const createdAt = asset.fileCreatedAt ?? asset.localDateTime ?? new Date().toISOString();
  const modifiedAt = asset.localDateTime ?? asset.fileCreatedAt ?? createdAt;

  const formData = new FormData();
  formData.set("fileCreatedAt", createdAt);
  formData.set("fileModifiedAt", modifiedAt);
  formData.set("fileType", fileType);
  formData.set("assetData", blob, resolvedFileName);
  if (asset.isArchived) formData.set("visibility", "archive");
  if (asset.isFavorite) formData.set("isFavorite", String(asset.isFavorite));

  const uploadResponse = await fetch(`${ENV.IMMICH_URL}/api/assets`, {
    method: "POST",
    headers: uploadHeaders,
    body: formData,
  });

  if (!uploadResponse.ok) {
    const body = await uploadResponse.text().catch(() => "");
    throw new Error(
      `Upload failed for ${asset.originalFileName ?? asset.id} (status ${uploadResponse.status}): ${body || "Unknown error"}`
    );
  }

  const uploaded = await uploadResponse.json();
  const uploadedId = uploaded?.id;
  if (!uploadedId) {
    throw new Error("Immich upload response did not include an asset id");
  }

  if (tagId) {
    await tagAssetWithPowerTools(tagId, uploadedId, jsonHeaders);
  }
  return uploadedId;
};

export const fetchSourceAssetChecksum = async (
  origin: string,
  assetId: string,
  key: string
): Promise<string | null> => {
  try {
    const res = await fetch(
      `${origin}/api/assets/${assetId}?key=${encodeURIComponent(key)}`,
      { headers: { accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return typeof data?.checksum === "string" ? data.checksum : null;
  } catch {
    return null;
  }
};

export const findExistingAssetIds = async (
  targetJsonHeaders: HeadersRecord,
  items: { id: string; checksum: string }[]
): Promise<Set<string>> => {
  const existing = new Set<string>();
  if (items.length === 0) return existing;
  try {
    const res = await fetch(`${ENV.IMMICH_URL}/api/assets/bulk-upload-check`, {
      method: "POST",
      headers: targetJsonHeaders,
      body: JSON.stringify({ assets: items }),
    });
    if (!res.ok) {
      console.warn(`[import] bulk-upload-check failed (status ${res.status})`);
      return existing;
    }
    const data = await res.json().catch(() => ({}));
    for (const result of data?.results ?? []) {
      if (result?.action === "reject" && result?.reason === "duplicate" && typeof result?.id === "string") {
        existing.add(result.id);
      }
    }
  } catch (error) {
    console.warn("[import] bulk-upload-check error", error);
  }
  return existing;
};

export const tagAssetWithPowerTools = async (
  tagId: string,
  assetId: string,
  headers: HeadersRecord
) => {
  const taggingHeaders: HeadersRecord = {
    ...headers,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const tagResponse = await fetch(`${ENV.IMMICH_URL}/api/tags/assets`, {
    method: "PUT",
    headers: taggingHeaders,
    body: JSON.stringify({ tagIds: [tagId], assetIds: [assetId] }),
  });

  if (!tagResponse.ok) {
    const errorBody = await tagResponse.text().catch(() => "");
    throw new Error(
      `Failed to tag uploaded asset (status ${tagResponse.status}): ${errorBody || "Unknown error"}`
    );
  }
};