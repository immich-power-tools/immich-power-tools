import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "drizzle-orm";
import sharp from "sharp";

import { db } from "@/config/db";
import { ENV } from "@/config/environment";
import { getUserHeaders } from "@/helpers/user.helper";
import { requireUser } from "@/lib/face-review/route-utils";

/**
 * Square face crop, rendered SERVER-side. The client used to download the
 * asset's whole `preview` (~1440px, hundreds of KB) and crop the face on a
 * canvas — fine on LAN, brutal remotely. Here the server (LAN-adjacent to
 * Immich) fetches the preview, does the identical crop math (pad 40%,
 * square, clamp — see the old FaceCrop.tsx / the source tool's faces.js),
 * and ships only a ~500px WebP of the face itself.
 *
 * A face's bounding box never changes once detected, so the response is
 * immutable — cache hard.
 */

// Display is ~200px; 400 = 2x for hi-dpi. 800 kept for possible zoom use.
const ALLOWED_SIZES = [400, 800];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  const faceId = String(req.query.faceId || "");
  if (!/^[0-9a-f-]{36}$/i.test(faceId)) {
    return res.status(400).json({ error: "Invalid face id" });
  }
  const size = ALLOWED_SIZES.includes(+(req.query.s as string)) ? +(req.query.s as string) : 400;

  const gate = await requireUser(req, res);
  if (!gate) return;

  try {
    // Owner scoping via the asset join, not the person: Find More renders
    // faces that belong to *other* (or no) person records, but always on the
    // requesting user's own assets.
    const { rows } = await db.execute(sql`
      SELECT af."assetId"::text AS asset_id,
             af."boundingBoxX1" AS x1, af."boundingBoxY1" AS y1,
             af."boundingBoxX2" AS x2, af."boundingBoxY2" AS y2,
             af."imageWidth" AS image_w, af."imageHeight" AS image_h
        FROM asset_face af
        JOIN asset a ON a.id = af."assetId" AND a."deletedAt" IS NULL AND a."ownerId" = ${gate.ownerId}
       WHERE af.id = ${faceId}
       LIMIT 1
    `);
    const face = rows[0] as
      | { asset_id: string; x1: number; y1: number; x2: number; y2: number; image_w: number; image_h: number }
      | undefined;
    if (!face) return res.status(404).json({ error: "Face not found" });

    const upstream = await fetch(
      `${ENV.IMMICH_URL}/api/assets/${face.asset_id}/thumbnail?size=preview`,
      { headers: getUserHeaders(gate.user) }
    );
    if (!upstream.ok) {
      return res.status(502).json({ error: `Preview fetch failed (${upstream.status})` });
    }
    const preview = Buffer.from(await upstream.arrayBuffer());

    const img = sharp(preview);
    const meta = await img.metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;

    let region: { left: number; top: number; width: number; height: number } | null = null;
    const { x1, y1, x2, y2, image_w: mlW, image_h: mlH } = face;
    if (W && H && [x1, y1, x2, y2].every((v) => typeof v === "number" && !Number.isNaN(v)) && x2 > x1) {
      // Same math as the old client-side FaceCrop: bbox lives in the ML
      // model's coordinate space, so scale to the preview's real size.
      const scaleX = mlW ? W / mlW : 1;
      const scaleY = mlH ? H / mlH : 1;
      let sx = x1 * scaleX;
      let sy = y1 * scaleY;
      let sw = (x2 - x1) * scaleX;
      let sh = (y2 - y1) * scaleY;
      const padX = sw * 0.4, padY = sh * 0.4;
      sx = Math.max(0, sx - padX);
      sy = Math.max(0, sy - padY);
      sw = Math.min(W - sx, sw + padX * 2);
      sh = Math.min(H - sy, sh + padY * 2);
      const cropSize = Math.min(Math.max(sw, sh), W, H);
      sx = Math.min(Math.max(0, sx + sw / 2 - cropSize / 2), W - cropSize);
      sy = Math.min(Math.max(0, sy + sh / 2 - cropSize / 2), H - cropSize);
      region = {
        left: Math.round(sx),
        top: Math.round(sy),
        width: Math.max(1, Math.round(cropSize)),
        height: Math.max(1, Math.round(cropSize)),
      };
      // Rounding can push the region 1px past the edge; pull it back in.
      region.width = Math.min(region.width, W - region.left);
      region.height = Math.min(region.height, H - region.top);
    }

    const out = await (region ? img.extract(region) : img)
      .resize(size, size, { fit: "cover" })
      .webp({ quality: 78 })
      .toBuffer();

    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Content-Length", out.byteLength);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    return res.send(out);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message });
  }
}
