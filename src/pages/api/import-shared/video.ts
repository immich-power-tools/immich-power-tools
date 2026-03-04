import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "stream";

const respondWithError = (res: NextApiResponse, status: number, message: string) => {
  return res.status(status).json({ error: message });
};

const validateParams = (req: NextApiRequest) => {
  const { origin, assetId, key, thumbhash } = req.query;

  if (!origin || Array.isArray(origin)) {
    return { error: "Query parameter 'origin' is required" };
  }
  if (!assetId || Array.isArray(assetId)) {
    return { error: "Query parameter 'assetId' is required" };
  }
  if (!key || Array.isArray(key)) {
    return { error: "Query parameter 'key' is required" };
  }

  try {
    const parsedOrigin = new URL(origin);
    return {
      origin: parsedOrigin.origin,
      assetId,
      key,
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

  const search = new URLSearchParams({ key: params.key });
  if (params.thumbhash) {
    search.set("c", params.thumbhash);
  }

  const targetUrl = `${params.origin}/api/assets/${params.assetId}/video/playback?${search.toString()}`;

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        accept: "video/*",
        ...(req.headers.range ? { range: req.headers.range } : {}),
        referer: req.headers.referer?.toString() ?? params.origin,
        "sec-fetch-dest": "video",
      },
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
