import { eq } from "drizzle-orm";
import { appDb } from "@/db";
import { importJobItems } from "@/db/schema";
import {
  ensurePowerToolsTag,
  HeadersRecord,
  parseFileNameFromDisposition,
  createImmichAlbum,
  addAssetToAlbum,
  uploadAssetBuffer,
  SharedAssetPayload,
  DownloadedAssetPayload,
  fetchSourceAssetChecksum,
  findExistingAssetIds,
} from "@/pages/api/import-shared/helpers";
import type { ImportJob, ImportJobItem, ImportProcessor, ProcessorContext, SetupResult } from "../types";

const downloadSharedAsset = async (
  asset: SharedAssetPayload,
  origin: string,
  key: string
): Promise<DownloadedAssetPayload> => {
  const url = `${origin}/api/assets/${asset.id}/original?key=${key}`;
  const response = await fetch(url, { method: "GET", headers: { accept: "*/*" } });
  if (!response.ok) {
    throw new Error(`Failed to download ${asset.originalFileName ?? asset.id} (status ${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const disposition = response.headers.get("content-disposition");
  const inferredName = parseFileNameFromDisposition(disposition);
  const fallbackExtension = asset.type === "VIDEO" ? "mp4" : "jpg";
  const fileName = inferredName ?? asset.originalFileName ?? `${asset.id}.${fallbackExtension}`;
  return { buffer, fileName, contentType: response.headers.get("content-type") };
};

export class ImmichSharedLinkProcessor implements ImportProcessor {
  async setup(job: ImportJob, context: ProcessorContext): Promise<SetupResult> {
    const headers = context.headers as HeadersRecord;

    // Load all items for this job from the db
    const items = await appDb
      .select()
      .from(importJobItems)
      .where(eq(importJobItems.jobId, job.id));

    let shareKey = "";
    try {
      const urlConfig = JSON.parse(job.urlConfig) as { key?: string };
      if (typeof urlConfig.key === "string") shareKey = urlConfig.key;
    } catch {
    }

    const dedupHeaders: HeadersRecord = { ...headers, "Content-Type": "application/json" };
    const checkItems: { id: string; checksum: string }[] = [];
    for (const item of items) {
      const checksum = await fetchSourceAssetChecksum(job.url, item.assetId, shareKey);
      if (checksum) checkItems.push({ id: item.assetId, checksum });
    }
    const existingAssetIds = await findExistingAssetIds(dedupHeaders, checkItems);
    const skipAssetIds: string[] = Array.from(existingAssetIds);

    // Parse importData for album options
    let importData: Record<string, unknown> = {};
    try {
      importData = JSON.parse(job.importData);
    } catch {
      // ignore parse errors, treat as empty
    }

    const albumOptions = importData.albumOptions as {
      createAlbum?: boolean;
      albumName?: string;
      addToAlbumId?: string;
    } | undefined;

    let albumId: string | undefined;
    const jsonHeadersWithContentType: HeadersRecord = {
      ...headers,
      "Content-Type": "application/json",
    };

    if (albumOptions?.createAlbum) {
      const desiredAlbumName =
        albumOptions.albumName?.trim() || `Shared import ${new Date().toISOString()}`;
      albumId = await createImmichAlbum(desiredAlbumName, jsonHeadersWithContentType);
      console.log(`[ImmichSharedLinkProcessor] Created album ${albumId} (${desiredAlbumName})`);
    } else if (typeof albumOptions?.addToAlbumId === "string" && albumOptions.addToAlbumId.trim()) {
      albumId = albumOptions.addToAlbumId.trim();
    }

    const importDataPatch: Record<string, unknown> = {};
    if (albumId) importDataPatch.albumId = albumId;

    // Tag assets with "immich-power-tools" if enabled
    const tagAssets = importData.tagAssets !== false; // default true for backwards compat
    if (tagAssets) {
      try {
        const tag = await ensurePowerToolsTag({ ...context.headers, "Content-Type": "application/json" } as HeadersRecord);
        importDataPatch.tagId = tag.id;
      } catch (err) {
        console.warn("[ImmichSharedLinkProcessor] Failed to create power-tools tag, skipping tagging", err);
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

    // Parse item metadata
    let asset: SharedAssetPayload;
    try {
      const parsed = JSON.parse(item.itemData);
      asset = {
        id: item.assetId,
        originalFileName: parsed.originalFileName,
        type: parsed.type ?? "IMAGE",
        fileCreatedAt: parsed.fileCreatedAt ?? null,
        localDateTime: parsed.localDateTime ?? null,
        duration: parsed.duration ?? null,
        isFavorite: parsed.isFavorite ?? false,
        isArchived: parsed.isArchived ?? false,
      };
    } catch {
      asset = { id: item.assetId, type: "IMAGE" };
    }

    // Parse urlConfig for the share key
    let urlConfig: Record<string, unknown> = {};
    try {
      urlConfig = JSON.parse(job.urlConfig);
    } catch {
      // ignore
    }
    const key = typeof urlConfig.key === "string" ? urlConfig.key : "";

    // Download the asset from the shared link
    const downloaded = await downloadSharedAsset(asset, job.url, key);

    // Strip Content-Type for multipart upload (same pattern as upload-all.ts)
    const { ["Content-Type"]: _omit, ...uploadHeaders } = headers;

    // Read tagId from importData set during setup() (optional)
    const importData = JSON.parse(job.importData) as { albumId?: string; tagId?: string };
    const tagId = importData.tagId;

    const immichId = await uploadAssetBuffer(
      asset,
      downloaded,
      uploadHeaders as HeadersRecord,
      headers as HeadersRecord,
      tagId
    );

    // Add to album if one was resolved during setup
    if (context.albumId) {
      const jsonHeadersWithContentType: HeadersRecord = {
        ...headers,
        "Content-Type": "application/json",
      };
      await addAssetToAlbum(context.albumId, immichId, jsonHeadersWithContentType);
    }

    return { immichId };
  }
}
