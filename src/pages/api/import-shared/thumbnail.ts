import type { NextApiRequest, NextApiResponse } from "next";

const respondWithError = (res: NextApiResponse, status: number, message: string) => {
  return res.status(status).json({ error: message });
};

const ALLOWED_SIZES = new Set(["thumbnail", "preview"]);

const validateParams = (req: NextApiRequest) => {
  const { origin, assetId, key, thumbhash, size } = req.query;

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

  try {
    const parsedOrigin = new URL(origin);
    return {
      origin: parsedOrigin.origin,
      assetId,
      key,
      size: resolvedSize,
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

  const search = new URLSearchParams({ key: params.key, size: params.size });
  if (params.thumbhash) {
    search.set("c", params.thumbhash);
  }

  try {
    const response = await fetch(
      `${params.origin}/api/assets/${params.assetId}/thumbnail?${search.toString()}`,
      {
        headers: {
          accept: "image/*",
        },
      }
    );

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
