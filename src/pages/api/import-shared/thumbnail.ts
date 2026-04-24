import type { NextApiRequest, NextApiResponse } from "next";
import { getFileRedirectUrl, decryptSecretStream, decryptSecretBox } from "./ente";
import _sodium from "libsodium-wrappers-sumo";

const respondWithError = (res: NextApiResponse, status: number, message: string) => {
  return res.status(status).json({ error: message });
};

const ALLOWED_SIZES = new Set(["thumbnail", "preview"]);

const validateParams = (req: NextApiRequest) => {
  const { origin, assetId, key, thumbhash, size, platform } = req.query;

  if (!origin || Array.isArray(origin)) {
    return { error: "Query parameter 'origin' is required" };
  }
  if (!assetId || Array.isArray(assetId)) {
    return { error: "Query parameter 'assetId' is required" };
  }
  if (!key || Array.isArray(key)) {
    return { error: "Query parameter 'key' is required" };
  }

  let resolvedSize = "thumbnail";
  if (typeof size === "string") {
    resolvedSize = size;
  } else if (Array.isArray(size)) {
    return { error: "Query parameter 'size' must be a single value" };
  }

  if (!ALLOWED_SIZES.has(resolvedSize)) {
    return { error: "Query parameter 'size' must be either 'thumbnail' or 'preview'" };
  }

  const resolvedPlatform = typeof platform === "string" ? platform : "immich";

  try {
    const parsedOrigin = new URL(origin);
    return {
      origin: parsedOrigin.origin,
      assetId,
      key,
      size: resolvedSize,
      platform: resolvedPlatform,
      thumbhash: typeof thumbhash === "string" ? thumbhash : undefined,
    };
  } catch (_err) {
    return { error: "Invalid origin provided" };
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return respondWithError(res, 405, "Method Not Allowed");
  }

  const params = validateParams(req);
  if ("error" in params) {
    return respondWithError(res, 400, params.error as string);
  }

  try {
    // ── Ente: encrypted thumbnails ──
    if (params.platform === "ente") {
      const enteFileKey = typeof req.query.enteFileKey === "string" ? req.query.enteFileKey : "";
      const enteThumbnailHeader = typeof req.query.enteThumbnailHeader === "string" ? req.query.enteThumbnailHeader : "";
      const apiBase = typeof req.query.apiBase === "string" ? req.query.apiBase : params.origin;

      if (!enteFileKey || !enteThumbnailHeader) {
        return respondWithError(res, 400, "Missing Ente encryption params (enteFileKey, enteThumbnailHeader)");
      }

      await _sodium.ready;
      const fileKeyBytes = _sodium.from_base64(enteFileKey, _sodium.base64_variants.ORIGINAL);

      const redirectUrl = await getFileRedirectUrl(apiBase, params.key, params.assetId, "preview");
      const encryptedResp = await fetch(redirectUrl);
      if (!encryptedResp.ok) {
        return respondWithError(res, encryptedResp.status, "Failed to fetch Ente thumbnail");
      }
      const encrypted = Buffer.from(await encryptedResp.arrayBuffer());
      const decrypted = await decryptSecretStream(encrypted, enteThumbnailHeader, fileKeyBytes);

      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.status(200).send(decrypted);
    }

    let targetUrl: string;

    if (params.platform === "nextcloud") {
      // Nextcloud public preview endpoint
      const dimensions = params.size === "preview" ? { x: 1080, y: 1080 } : { x: 250, y: 250 };
      const previewParams = new URLSearchParams({
        file: `/${params.assetId}`,
        x: String(dimensions.x),
        y: String(dimensions.y),
        mimeFallback: "true",
        a: "0",
      });
      targetUrl = `${params.origin}/apps/files_sharing/publicpreview/${params.key}?${previewParams.toString()}`;
    } else {
      // Immich thumbnail endpoint
      const search = new URLSearchParams({ key: params.key, size: params.size });
      if (params.thumbhash) {
        search.set("c", params.thumbhash);
      }
      targetUrl = `${params.origin}/api/assets/${params.assetId}/thumbnail?${search.toString()}`;
    }

    const response = await fetch(targetUrl, {
      headers: {
        accept: "image/*",
      },
    });

    if (!response.ok) {
      return respondWithError(res, response.status, "Failed to fetch thumbnail");
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? "image/jpeg";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    console.error("Thumbnail proxy error", error);
    return respondWithError(res, 500, error?.message ?? "Thumbnail proxy failed");
  }
}
