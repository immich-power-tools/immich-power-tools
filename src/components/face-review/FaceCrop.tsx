import React from "react";

import { IFaceReviewFace } from "@/types/faceReview";

/**
 * Square face crop. The cropping itself happens server-side
 * (/api/face-review/faces/[faceId]/crop) — the server sits next to Immich,
 * pulls the big preview over LAN, and ships only a small WebP of the face.
 * The old version downloaded the full preview to the browser and cropped it
 * on a canvas, which made remote sessions crawl.
 *
 * Plain <img> so we get native lazy loading: below-the-fold crops don't
 * fetch until scrolled near. The response is immutable-cached, so revisits
 * render from the browser cache.
 */
export default function FaceCrop({
  face,
  size = 200,
  className,
  onClick,
  title,
}: {
  face: IFaceReviewFace;
  size?: number;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
}) {
  // Request 2x the display size for hi-dpi screens; endpoint allows 400/800.
  const fetchSize = size > 200 ? 800 : 400;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/face-review/faces/${face.faceId}/crop?s=${fetchSize}`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onClick={onClick}
      title={title}
      className={className}
    />
  );
}
