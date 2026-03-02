import type { NextApiRequest, NextApiResponse } from "next";
import { ENV } from "@/config/environment";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { getUserHeaders } from "@/helpers/user.helper";
import {
  HeadersRecord,
  ensurePowerToolsTag,
  tagAssetWithPowerTools,
} from "./helpers";

const respondWithError = (res: NextApiResponse, status: number, message: string) => {
  return res.status(status).json({ error: message });
};

const parseBody = (req: NextApiRequest) => {
  try {
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (error) {
    return null;
  }
};

const validatePayload = (payload: any) => {
  const { assetId, origin, key } = payload || {};
  if (!assetId || typeof assetId !== "string") {
    return { error: "Field 'assetId' is required" };
  }
  if (!origin || typeof origin !== "string") {
    return { error: "Field 'origin' is required" };
  }
  if (!key || typeof key !== "string") {
    return { error: "Field 'key' is required" };
  }

  let parsedOrigin: URL | null = null;
  try {
    parsedOrigin = new URL(origin);
  } catch (_err) {
    return { error: "Invalid origin provided" };
  }

  return {
    assetId,
    key,
    origin: parsedOrigin.origin,
  };
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
  if (!payload) {
    return respondWithError(res, 400, "Invalid request payload");
  }

  const jsonHeaders = getUserHeaders(currentUser) as HeadersRecord;

  const validation = validatePayload(payload);
  if ("error" in validation) {
    return respondWithError(res, 400, validation.error ?? "Validation failed");
  }

  const params = validation;

  try {
    const assetResponse = await fetch(
      `${params.origin}/api/assets/${params.assetId}?key=${params.key}`,
      {
        headers: {
          accept: "application/json",
        },
      }
    );

    if (!assetResponse.ok) {
      return respondWithError(res, assetResponse.status, "Failed to fetch remote asset metadata");
    }

    const asset = await assetResponse.json();

    if (!asset || asset.type !== "IMAGE") {
      return respondWithError(res, 400, "Only photo assets can be uploaded from this view");
    }

    const originalResponse = await fetch(
      `${params.origin}/api/assets/${params.assetId}/original?key=${params.key}`,
      {
        headers: {
          accept: "application/octet-stream",
        },
      }
    );

    if (!originalResponse.ok) {
      return respondWithError(res, originalResponse.status, "Failed to download original asset data");
    }

    const contentType = originalResponse.headers.get("content-type") ?? "application/octet-stream";
    const originalBuffer = await originalResponse.arrayBuffer();
    const assetBlob = new Blob([originalBuffer], { type: contentType });
    const fileName = asset.originalFileName ?? `${params.assetId}.bin`;

    const createdAt = asset.fileCreatedAt ?? asset.localDateTime ?? new Date().toISOString();
    const modifiedAt = asset.localDateTime ?? asset.fileCreatedAt ?? createdAt;

    const formData = new FormData();
    formData.set("deviceAssetId", `shared-${params.assetId}`);
    formData.set("deviceId", "immich-power-tools");
    formData.set("fileCreatedAt", createdAt);
    formData.set("fileModifiedAt", modifiedAt);
    formData.set("fileType", asset.type ?? "IMAGE");
    formData.set("duration", asset.duration ?? "0:00:00.000000");
    formData.set("assetData", assetBlob, fileName);

    if (asset.isArchived) {
      formData.set("isArchived", asset.isArchived.toString());
    }
    if (asset.isFavorite) {
      formData.set("isFavorite", asset.isFavorite.toString());
    }

    const { ["Content-Type"]: _omitContentType, ...uploadHeaders } = jsonHeaders;

    const uploadResponse = await fetch(`${ENV.IMMICH_URL}/api/assets`, {
      method: "POST",
      headers: uploadHeaders,
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorBody = await uploadResponse.text();
      console.error("Immich upload error", uploadResponse.status, errorBody);
      return respondWithError(res, uploadResponse.status, "Failed to upload asset to Immich instance");
    }

    const uploaded = await uploadResponse.json();
    const uploadedAssetId = uploaded?.id;

    if (!uploadedAssetId) {
      throw new Error("Immich upload response did not include an asset id");
    }

    const tagHeaders: HeadersRecord = {
      ...jsonHeaders,
      Accept: "application/json",
    };

    const tag = await ensurePowerToolsTag(tagHeaders);
    await tagAssetWithPowerTools(tag.id, uploadedAssetId, tagHeaders);

    return res.status(200).json({
      status: "uploaded",
      immichId: uploadedAssetId,
      deviceAssetId: `shared-${params.assetId}`,
      tagId: tag.id,
    });
  } catch (error: any) {
    console.error("Upload shared asset error", error);
    return respondWithError(res, 500, error?.message ?? "Unexpected error while uploading asset");
  }
}
