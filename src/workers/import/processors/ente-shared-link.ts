import { eq } from "drizzle-orm";
import { appDb } from "@/db";
import { importJobItems } from "@/db/schema";
import { ENV } from "@/config/environment";
import {
  ensurePowerToolsTag,
  HeadersRecord,
  createImmichAlbum,
  addAssetToAlbum,
  uploadAssetBuffer,
  SharedAssetPayload,
  DownloadedAssetPayload,
  DEVICE_ID,
  guessContentType,
} from "@/pages/api/import-shared/helpers";
import {
  getFileRedirectUrl,
  decryptSecretStream,
} from "@/pages/api/import-shared/ente";
import _sodium from "libsodium-wrappers-sumo";
import type {
  ImportJob,
  ImportJobItem,
  ImportProcessor,
  ProcessorContext,
  SetupResult,
} from "../types";

const makeDeviceAssetId = (fileId: string) => `shared-ente-${fileId}`;

const downloadEnteAsset = async (
  apiBase: string,
  token: string,
  fileId: string,
  fileDecryptionHeader: string,
  fileKey: Uint8Array,
  title: string
): Promise<DownloadedAssetPayload> => {
  const redirectUrl = await getFileRedirectUrl(apiBase, token, fileId, "download");

  const response = await fetch(redirectUrl, {
    method: "GET",
    headers: { accept: "*/*" },
  });

  if (!response.ok) {
    throw new Error(`Failed to download Ente file ${fileId} (status ${response.status})`);
  }

  const encrypted = Buffer.from(await response.arrayBuffer());
  const decrypted = await decryptSecretStream(encrypted, fileDecryptionHeader, fileKey);

  return {
    buffer: decrypted,
    fileName: title,
    contentType: guessContentType(title),
  };
};

export class EnteSharedLinkProcessor implements ImportProcessor {
  async setup(job: ImportJob, context: ProcessorContext): Promise<SetupResult> {
    const headers = context.headers as HeadersRecord;

    const items = await appDb
      .select()
      .from(importJobItems)
      .where(eq(importJobItems.jobId, job.id));

    // Build deviceAssetIds for dedup check
    const deviceAssetIds: string[] = [];
    const deviceAssetIdLookup = new Map<string, string>();
    for (const item of items) {
      const deviceAssetId = makeDeviceAssetId(item.assetId);
      deviceAssetIds.push(deviceAssetId);
      deviceAssetIdLookup.set(deviceAssetId.toLowerCase(), item.assetId);
    }

    // Check which assets already exist in Immich
    const skipAssetIds: string[] = [];
    if (deviceAssetIds.length > 0) {
      try {
        const jsonHeaders: HeadersRecord = { ...headers, "Content-Type": "application/json" };
        const checkResponse = await fetch(`${ENV.IMMICH_URL}/api/assets/exist`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ deviceAssetIds, deviceId: DEVICE_ID }),
        });

        if (checkResponse.ok) {
          const existPayload = await checkResponse.json().catch(() => ({}));
          const existingIds: string[] = existPayload?.existingIds ?? [];
          for (const deviceAssetId of existingIds) {
            if (typeof deviceAssetId !== "string") continue;
            const matchedAssetId = deviceAssetIdLookup.get(deviceAssetId.toLowerCase());
            if (matchedAssetId) {
              skipAssetIds.push(matchedAssetId);
            }
          }
        } else {
          console.warn(`[EnteProcessor] Failed to check existing assets (status ${checkResponse.status})`);
        }
      } catch (error) {
        console.warn("[EnteProcessor] Unable to check existing assets", error);
      }
    }

    // Parse importData for album options
    let importData: Record<string, unknown> = {};
    try {
      importData = JSON.parse(job.importData);
    } catch {
      // ignore
    }

    const albumOptions = importData.albumOptions as {
      createAlbum?: boolean;
      albumName?: string;
      addToAlbumId?: string;
    } | undefined;

    let albumId: string | undefined;
    const jsonHeaders: HeadersRecord = { ...headers, "Content-Type": "application/json" };

    if (albumOptions?.createAlbum) {
      const desiredAlbumName =
        albumOptions.albumName?.trim() || `Ente import ${new Date().toISOString()}`;
      albumId = await createImmichAlbum(desiredAlbumName, jsonHeaders);
      console.log(`[EnteProcessor] Created album ${albumId} (${desiredAlbumName})`);
    } else if (typeof albumOptions?.addToAlbumId === "string" && albumOptions.addToAlbumId.trim()) {
      albumId = albumOptions.addToAlbumId.trim();
    }

    const importDataPatch: Record<string, unknown> = {};
    if (albumId) importDataPatch.albumId = albumId;

    const tagAssets = importData.tagAssets !== false;
    if (tagAssets) {
      try {
        const tag = await ensurePowerToolsTag(jsonHeaders);
        importDataPatch.tagId = tag.id;
      } catch (err) {
        console.warn("[EnteProcessor] Failed to create power-tools tag, skipping tagging", err);
      }
    }

    return { skipAssetIds, albumId, importDataPatch };
  }

  async processItem(
    job: ImportJob,
    item: ImportJobItem,
    context: ProcessorContext
  ): Promise<{ immichId: string }> {
    const headers = context.headers as HeadersRecord;

    // Parse item metadata + encryption artifacts
    let title = `file_${item.assetId}`;
    let type = "IMAGE";
    let fileCreatedAt: string | null = null;
    let localDateTime: string | null = null;
    let enteFileKey = "";
    let enteFileDecryptionHeader = "";

    try {
      const parsed = JSON.parse(item.itemData);
      title = parsed.originalFileName ?? parsed.title ?? title;
      type = parsed.type ?? "IMAGE";
      fileCreatedAt = parsed.fileCreatedAt ?? null;
      localDateTime = parsed.localDateTime ?? null;
      enteFileKey = parsed.enteFileKey ?? "";
      enteFileDecryptionHeader = parsed.enteFileDecryptionHeader ?? "";
    } catch {
      // ignore parse errors
    }

    // Parse urlConfig for token and apiBase
    let urlConfig: Record<string, unknown> = {};
    try {
      urlConfig = JSON.parse(job.urlConfig);
    } catch {
      // ignore
    }
    const token = typeof urlConfig.key === "string" ? urlConfig.key : "";
    const apiBase = typeof urlConfig.apiBase === "string" ? urlConfig.apiBase : job.url;

    if (!enteFileKey || !enteFileDecryptionHeader) {
      throw new Error(`Missing encryption artifacts for Ente file ${item.assetId}`);
    }

    // Decode file key from base64
    await _sodium.ready;
    const fileKeyBytes = _sodium.from_base64(enteFileKey, _sodium.base64_variants.ORIGINAL);

    // Download and decrypt
    const downloaded = await downloadEnteAsset(
      apiBase,
      token,
      item.assetId,
      enteFileDecryptionHeader,
      fileKeyBytes,
      title
    );

    // Build asset payload for upload
    const asset: SharedAssetPayload = {
      id: item.assetId,
      originalFileName: title,
      type,
      fileCreatedAt,
      localDateTime,
      duration: null,
      isFavorite: false,
      isArchived: false,
    };

    // Strip Content-Type for multipart upload
    const { ["Content-Type"]: _omit, ...uploadHeaders } = headers;

    // Read tagId from importData set during setup()
    const importData = JSON.parse(job.importData) as { albumId?: string; tagId?: string };
    const tagId = importData.tagId;

    const immichId = await uploadAssetBuffer(
      asset,
      downloaded,
      uploadHeaders as HeadersRecord,
      headers as HeadersRecord,
      makeDeviceAssetId(item.assetId),
      tagId
    );

    // Add to album if one was resolved during setup
    if (context.albumId) {
      const jsonHeaders: HeadersRecord = { ...headers, "Content-Type": "application/json" };
      await addAssetToAlbum(context.albumId, immichId, jsonHeaders);
    }

    return { immichId };
  }
}
