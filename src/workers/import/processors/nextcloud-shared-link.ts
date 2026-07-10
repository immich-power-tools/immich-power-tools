import { eq } from "drizzle-orm";
import { appDb } from "@/db";
import { importJobItems } from "@/db/schema";
import {
  ensurePowerToolsTag,
  HeadersRecord,
  createImmichAlbum,
  addAssetToAlbum,
  uploadAssetBuffer,
  SharedAssetPayload,
  DownloadedAssetPayload,
  parseFileNameFromDisposition,
} from "@/pages/api/import-shared/helpers";
import type { ImportJob, ImportJobItem, ImportProcessor, ProcessorContext, SetupResult } from "../types";

const buildBasicAuth = (username: string, password: string): string => {
  const encoded = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${encoded}`;
};

const downloadNextcloudAsset = async (
  baseUrl: string,
  token: string,
  relativePath: string,
  password: string
): Promise<DownloadedAssetPayload> => {
  const encodedPath = relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const url = `${baseUrl}/public.php/dav/files/${token}/${encodedPath}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: buildBasicAuth(token, password),
      accept: "*/*",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${relativePath} from Nextcloud (status ${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const disposition = response.headers.get("content-disposition");
  const inferredName = parseFileNameFromDisposition(disposition);
  const fileName = inferredName ?? relativePath.split("/").pop() ?? "unknown";

  return {
    buffer,
    fileName,
    contentType: response.headers.get("content-type"),
  };
};

export class NextcloudSharedLinkProcessor implements ImportProcessor {
  async setup(job: ImportJob, context: ProcessorContext): Promise<SetupResult> {
    const headers = context.headers as HeadersRecord;

    const items = await appDb
      .select()
      .from(importJobItems)
      .where(eq(importJobItems.jobId, job.id));

    const skipAssetIds: string[] = [];

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
        albumOptions.albumName?.trim() || `Nextcloud import ${new Date().toISOString()}`;
      albumId = await createImmichAlbum(desiredAlbumName, jsonHeaders);
      console.log(`[NextcloudProcessor] Created album ${albumId} (${desiredAlbumName})`);
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
        console.warn("[NextcloudProcessor] Failed to create power-tools tag, skipping tagging", err);
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
    let relativePath: string;
    try {
      const parsed = JSON.parse(item.itemData);
      relativePath = parsed.relativePath ?? item.assetId;
      asset = {
        id: item.assetId,
        originalFileName: parsed.originalFileName,
        type: parsed.type ?? "IMAGE",
        fileCreatedAt: parsed.fileCreatedAt ?? null,
        localDateTime: parsed.localDateTime ?? null,
        duration: parsed.duration ?? null,
        isFavorite: false,
        isArchived: false,
      };
    } catch {
      relativePath = item.assetId;
      asset = { id: item.assetId, type: "IMAGE" };
    }

    // Parse urlConfig for token and password
    let urlConfig: Record<string, unknown> = {};
    try {
      urlConfig = JSON.parse(job.urlConfig);
    } catch {
      // ignore
    }
    const token = typeof urlConfig.key === "string" ? urlConfig.key : "";
    const password = typeof urlConfig.password === "string" ? urlConfig.password : "";

    // Download the asset from Nextcloud
    const downloaded = await downloadNextcloudAsset(job.url, token, relativePath, password);

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
