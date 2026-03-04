import type { NextApiRequest, NextApiResponse } from "next";
import { ENV } from "@/config/environment";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { getUserHeaders } from "@/helpers/user.helper";
import {
  HeadersRecord,
  ensurePowerToolsTag,
  tagAssetWithPowerTools,
} from "./helpers";

interface ISharedAssetPayload {
  id: string;
  originalFileName?: string;
  type: string;
  fileCreatedAt?: string | null;
  localDateTime?: string | null;
  duration?: string | null;
  isFavorite?: boolean;
  isArchived?: boolean;
}

interface IAlbumImportOptions {
  createAlbum: boolean;
  albumName?: string;
  addToAlbumId?: string;
}

interface IImportAllPayload {
  origin: string;
  key: string;
  assets: ISharedAssetPayload[];
  albumOptions?: IAlbumImportOptions | null;
}

interface IFailureDetail {
  assetId: string;
  reason: string;
}

interface DownloadedAssetPayload {
  buffer: Buffer;
  fileName: string;
  contentType: string | null;
}

const DEVICE_ID = "immich-power-tools";
const ALLOWED_ASSET_TYPES = new Set(["IMAGE", "VIDEO"]);
const CONCURRENT_TRANSFERS = 4;
const makeDeviceAssetId = (assetId: string) => `shared-${assetId}`;

const respondWithError = (res: NextApiResponse, status: number, message: string) => {
  return res.status(status).json({ error: message });
};

const parseBody = (req: NextApiRequest) => {
  try {
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (_error) {
    return null;
  }
};

const normalizeAlbumOptions = (value: any): IAlbumImportOptions => {
  if (!value || typeof value !== "object") {
    return { createAlbum: false };
  }

  const createAlbum = Boolean(value.createAlbum);
  const addToAlbumId = typeof value.addToAlbumId === "string" && value.addToAlbumId.trim().length > 0 ? value.addToAlbumId.trim() : undefined;

  if (!createAlbum && !addToAlbumId) {
    return { createAlbum: false };
  }

  const albumName =
    typeof value.albumName === "string" && value.albumName.trim().length > 0
      ? value.albumName.trim()
      : undefined;

  return {
    createAlbum,
    albumName,
    addToAlbumId,
  };
};

const normalizeAssetPayload = (value: any): ISharedAssetPayload | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (!value.id || typeof value.id !== "string") {
    return null;
  }
  if (!value.type || typeof value.type !== "string") {
    return null;
  }
  return {
    id: value.id,
    originalFileName: typeof value.originalFileName === "string" ? value.originalFileName : undefined,
    type: value.type,
    fileCreatedAt: value.fileCreatedAt ?? null,
    localDateTime: value.localDateTime ?? null,
    duration: value.duration ?? null,
    isFavorite: value.isFavorite ?? false,
    isArchived: value.isArchived ?? false,
  };
};

const validatePayload = (payload: any) => {
  if (!payload || typeof payload !== "object") {
    return { error: "Invalid request payload" };
  }

  const { origin, key, assets } = payload as IImportAllPayload;
  const normalizedAlbumOptions = normalizeAlbumOptions((payload as IImportAllPayload).albumOptions);

  if (!origin || typeof origin !== "string") {
    return { error: "Field 'origin' is required" };
  }
  if (!key || typeof key !== "string") {
    return { error: "Field 'key' is required" };
  }
  if (!Array.isArray(assets) || assets.length === 0) {
    return { error: "Field 'assets' must include at least one entry" };
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin.trim());
  } catch (_err) {
    return { error: "Invalid origin provided" };
  }

  const normalizedAssets = assets
    .map(normalizeAssetPayload)
    .filter((asset): asset is ISharedAssetPayload => !!asset);

  if (normalizedAssets.length === 0) {
    return { error: "No valid assets provided" };
  }

  return {
    origin: parsedOrigin.origin,
    key,
    assets: normalizedAssets,
    albumOptions: normalizedAlbumOptions,
  };
};

const inferAssetTypeFromName = (fileName: string): "IMAGE" | "VIDEO" => {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension) {
    return "IMAGE";
  }
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

const parseFileNameFromDisposition = (disposition?: string | null) => {
  if (!disposition) {
    return null;
  }
  const match = disposition.match(/filename\*?=([^;]+)/i);
  if (!match || !match[1]) {
    return null;
  }
  const value = match[1].trim().replace(/^UTF-8''/i, "").replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
};

const guessContentType = (fileName: string) => {
  const lower = fileName.toLowerCase();
  const extension = lower.split(".").pop();
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

const createImmichAlbum = async (albumName: string, headers: HeadersRecord) => {
  const response = await fetch(`${ENV.IMMICH_URL}/api/albums`, {
    method: "POST",
    headers,
    body: JSON.stringify({ albumName }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed to create album "${albumName}" (status ${response.status}): ${body || "Unknown error"}`
    );
  }

  const album = await response.json().catch(() => null);
  const albumId = album?.id;
  if (!albumId || typeof albumId !== "string") {
    throw new Error("Immich album creation response did not include an id");
  }
  return albumId;
};

const addAssetToAlbum = async (albumId: string, assetId: string, headers: HeadersRecord) => {
  const response = await fetch(`${ENV.IMMICH_URL}/api/albums/${albumId}/assets`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ ids: [assetId] }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed to attach asset ${assetId} to album ${albumId} (status ${response.status}): ${
        body || "Unknown error"
      }`
    );
  }
};

const downloadSharedAsset = async (
  asset: ISharedAssetPayload,
  origin: string,
  key: string
): Promise<DownloadedAssetPayload> => {
  const url = `${origin}/api/assets/${asset.id}/original?key=${key}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "*/*",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${asset.originalFileName ?? asset.id} (status ${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const disposition = response.headers.get("content-disposition");
  const inferredName = parseFileNameFromDisposition(disposition);
  const fallbackExtension = asset.type === "VIDEO" ? "mp4" : "jpg";
  const fileName = inferredName ?? asset.originalFileName ?? `${asset.id}.${fallbackExtension}`;

  return {
    buffer,
    fileName,
    contentType: response.headers.get("content-type"),
  };
};

const uploadAssetBuffer = async (
  asset: ISharedAssetPayload,
  payload: DownloadedAssetPayload,
  uploadHeaders: HeadersRecord,
  jsonHeaders: HeadersRecord,
  tagId: string
) => {
  const fileType = asset.type ?? inferAssetTypeFromName(payload.fileName);
  const resolvedFileName = payload.fileName || asset.originalFileName || `${asset.id}.bin`;
  const contentType = payload.contentType ?? guessContentType(resolvedFileName);
  const uint8Array = new Uint8Array(payload.buffer.byteLength);
  uint8Array.set(payload.buffer);
  const blob = new Blob([uint8Array.buffer], { type: contentType });
  const createdAt = asset.fileCreatedAt ?? asset.localDateTime ?? new Date().toISOString();
  const modifiedAt = asset.localDateTime ?? asset.fileCreatedAt ?? createdAt;

  const formData = new FormData();
  formData.set("deviceAssetId", makeDeviceAssetId(asset.id));
  formData.set("deviceId", DEVICE_ID);
  formData.set("fileCreatedAt", createdAt);
  formData.set("fileModifiedAt", modifiedAt);
  formData.set("fileType", fileType);
  formData.set("duration", asset.duration ?? "0:00:00.000000");
  formData.set("assetData", blob, resolvedFileName);

  if (asset.isArchived) {
    formData.set("isArchived", String(asset.isArchived));
  }
  if (asset.isFavorite) {
    formData.set("isFavorite", String(asset.isFavorite));
  }

  const uploadResponse = await fetch(`${ENV.IMMICH_URL}/api/assets`, {
    method: "POST",
    headers: uploadHeaders,
    body: formData,
  });

  if (!uploadResponse.ok) {
    const body = await uploadResponse.text().catch(() => "");
    throw new Error(
      `Upload failed for ${asset.originalFileName ?? asset.id} (status ${uploadResponse.status}): ${
        body || "Unknown error"
      }`
    );
  }

  const uploaded = await uploadResponse.json();
  const uploadedId = uploaded?.id;
  if (!uploadedId) {
    throw new Error("Immich upload response did not include an asset id");
  }

  await tagAssetWithPowerTools(tagId, uploadedId, jsonHeaders);
  return uploadedId;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respondWithError(res, 405, "Method Not Allowed");
  }

  if (!ENV.IMMICH_URL) {
    return respondWithError(res, 500, "IMMICH_URL must be configured");
  }

  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return respondWithError(res, 401, "Unauthorized");
  }

  const payload = parseBody(req);
  const validation = validatePayload(payload);
  if ("error" in validation) {
    return respondWithError(res, 400, validation.error ?? "Validation failed");
  }

  const { origin, key, assets, albumOptions } = validation;
  const uploadableAssets = assets.filter((asset) => ALLOWED_ASSET_TYPES.has(asset.type));
  const normalizedAlbumOptions = albumOptions ?? { createAlbum: false };
  if (uploadableAssets.length === 0) {
    return respondWithError(res, 400, "No image or video assets available to import");
  }

  const jsonHeaders = getUserHeaders(currentUser) as HeadersRecord;
  const jsonHeadersWithContentType: HeadersRecord = {
    ...jsonHeaders,
    "Content-Type": "application/json",
  };

  const deviceAssetIds: string[] = [];
  const deviceAssetIdLookup = new Map<string, string>();
  for (const asset of uploadableAssets) {
    const deviceAssetId = makeDeviceAssetId(asset.id);
    deviceAssetIds.push(deviceAssetId);
    deviceAssetIdLookup.set(deviceAssetId.toLowerCase(), asset.id);
  }

  const existingAssetIds = new Set<string>();
  if (deviceAssetIds.length > 0) {
    try {
      const checkResponse = await fetch(`${ENV.IMMICH_URL}/api/assets/exist`, {
        method: "POST",
        headers: jsonHeadersWithContentType,
        body: JSON.stringify({
          deviceAssetIds,
          deviceId: DEVICE_ID,
        }),
      });

      if (checkResponse.ok) {
        const existPayload = await checkResponse.json().catch(() => ({}));
        const existingIds: string[] = existPayload?.existingIds ?? [];
        for (const deviceAssetId of existingIds) {
          if (typeof deviceAssetId !== "string") {
            continue;
          }
          const normalizedId = deviceAssetId.toLowerCase();
          const matchedAssetId = deviceAssetIdLookup.get(normalizedId);
          if (matchedAssetId) {
            existingAssetIds.add(matchedAssetId);
          }
        }
      } else {
        console.warn(`Failed to check existing assets before import (status ${checkResponse.status})`);
      }
    } catch (error) {
      console.warn("Unable to check existing assets before import", error);
    }
  }

  const assetsToImport = uploadableAssets.filter((asset) => !existingAssetIds.has(asset.id));
  const skippedAssetIds = uploadableAssets
    .filter((asset) => existingAssetIds.has(asset.id))
    .map((asset) => asset.id);

  if (assetsToImport.length === 0) {
    return res.status(200).json({
      uploadedIds: [],
      processedAssetIds: [],
      uploadedCount: 0,
      failed: [],
      requestedCount: 0,
      skippedAssetIds,
    });
  }

  if (skippedAssetIds.length) {
    console.log(`Skipping ${skippedAssetIds.length} assets already stored in Immich`);
  }

  let targetAlbumId: string | null = null;
  if (normalizedAlbumOptions.createAlbum) {
    const desiredAlbumName =
      normalizedAlbumOptions.albumName?.trim() || `Shared import ${new Date().toISOString()}`;
    try {
      targetAlbumId = await createImmichAlbum(desiredAlbumName, jsonHeadersWithContentType);
      console.log(`Created Immich album ${targetAlbumId} for shared import (${desiredAlbumName})`);
    } catch (error: any) {
      console.error("Failed to create Immich album for import", error);
      return respondWithError(res, 500, error?.message ?? "Unable to create Immich album");
    }
  } else if (normalizedAlbumOptions.addToAlbumId) {
    targetAlbumId = normalizedAlbumOptions.addToAlbumId;
  }

  const assetIds = assetsToImport.map((asset) => asset.id);
  console.log(
    `Starting per-asset import for ${assetIds.length} assets (concurrency ${Math.min(
      CONCURRENT_TRANSFERS,
      assetsToImport.length
    )})`
  );

  const { ["Content-Type"]: _omitContentType, ...uploadHeaders } = jsonHeaders;
  const tag = await ensurePowerToolsTag(jsonHeaders);

  const uploadedImmichIds: string[] = [];
  const processedAssetIds: string[] = [];
  const failed: IFailureDetail[] = [];

  let currentIndex = 0;
  const concurrency = Math.min(CONCURRENT_TRANSFERS, assetsToImport.length);

  const worker = async () => {
    while (true) {
      const index = currentIndex++;
      if (index >= assetsToImport.length) {
        break;
      }

      const asset = assetsToImport[index];
      try {
        const downloaded = await downloadSharedAsset(asset, origin, key);
        const uploadedId = await uploadAssetBuffer(asset, downloaded, uploadHeaders, jsonHeaders, tag.id);
        if (targetAlbumId) {
          await addAssetToAlbum(targetAlbumId, uploadedId, jsonHeadersWithContentType);
        }
        uploadedImmichIds.push(uploadedId);
        processedAssetIds.push(asset.id);
      } catch (error: any) {
        failed.push({ assetId: asset.id, reason: error?.message ?? "Upload failed" });
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  return res.status(200).json({
    uploadedIds: uploadedImmichIds,
    processedAssetIds,
    uploadedCount: uploadedImmichIds.length,
    failed,
    requestedCount: assetsToImport.length,
    skippedAssetIds,
    albumId: targetAlbumId,
  });
}
