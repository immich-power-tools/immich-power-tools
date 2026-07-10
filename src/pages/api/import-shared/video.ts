import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "stream";

const respondWithError = (res: NextApiResponse, status: number, message: string) => {
  return res.status(status).json({ error: message });
};

const validateParams = (req: NextApiRequest) => {
  const { origin, assetId, key, thumbhash, platform, password } = req.query;

  if (!origin || Array.isArray(origin)) {
    return { error: "Query parameter 'origin' is required" };
  }
  if (!assetId || Array.isArray(assetId)) {
    return { error: "Query parameter 'assetId' is required" };
  }
  if (!key || Array.isArray(key)) {
    return { error: "Query parameter 'key' is required" };
  }

  const resolvedPlatform = typeof platform === "string" ? platform : "immich";
  const resolvedPassword = typeof password === "string" ? password : "";

  try {
    const parsedOrigin = new URL(origin);
    return {
      origin: parsedOrigin.origin,
      assetId,
      key,
      platform: resolvedPlatform,
      password: resolvedPassword,
      thumbhash: typeof thumbhash === "string" ? thumbhash : undefined,
    };
  } catch (_err) {
    return { error: "Invalid origin provided" };
  }
};

const passthroughHeaders = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "cache-control",
];

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
    // Ente videos are encrypted — full decryption for preview is too expensive
    if (params.platform === "ente") {
      return respondWithError(res, 501, "Video preview is not available for Ente imports");
    }

    let targetUrl: string;
    let fetchHeaders: Record<string, string>;

    if (params.platform === "nextcloud") {
      // Nextcloud: stream via WebDAV
      targetUrl = `${params.origin}/public.php/dav/files/${params.key}/${params.assetId}`;
      const basicAuth = Buffer.from(`${params.key}:${params.password}`).toString("base64");
      fetchHeaders = {
        Authorization: `Basic ${basicAuth}`,
        accept: "*/*",
        ...(req.headers.range ? { range: req.headers.range } : {}),
      };
    } else {
      // Immich: video playback endpoint
      const search = new URLSearchParams({ key: params.key });
      if (params.thumbhash) {
        search.set("c", params.thumbhash);
      }
      targetUrl = `${params.origin}/api/assets/${params.assetId}/video/playback?${search.toString()}`;
      fetchHeaders = {
        accept: "video/*",
        ...(req.headers.range ? { range: req.headers.range } : {}),
        referer: req.headers.referer?.toString() ?? params.origin,
        "sec-fetch-dest": "video",
      };
    }

    const upstream = await fetch(targetUrl, {
      headers: fetchHeaders,
    });

    if (!upstream.ok && upstream.status !== 206) {
      return respondWithError(res, upstream.status, "Failed to fetch video playback");
    }

    passthroughHeaders.forEach((header) => {
      const value = upstream.headers.get(header);
      if (value) {
        res.setHeader(header, value);
      }
    });

    res.status(upstream.status);

    const body = upstream.body;
    if (body) {
      const nodeStream = Readable.fromWeb(body as any);
      nodeStream.pipe(res);
    } else {
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.send(buffer);
    }
  } catch (error: any) {
    console.error("Video playback proxy error", error);
    return respondWithError(res, 500, error?.message ?? "Video playback proxy failed");
  }
}
