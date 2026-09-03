import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { getAssetExif, ICullExif } from "@/handlers/api/cull.handler";
import { humanizeBytes } from "@/helpers/string.helper";

/**
 * EXIF summary overlay for the full-screen viewer — reuses the same
 * /api/assets/[id]/detail endpoint AssetInfoPanel uses elsewhere in the app,
 * fetched on demand (only while the panel is open for the current photo)
 * rather than bloating the paginated cull-assets list with EXIF for photos
 * that may never get their panel opened.
 */
export default function ExifPanel({ assetId }: { assetId: string }) {
  const [data, setData] = useState<ICullExif | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setLoading(true);
    getAssetExif(assetId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [assetId]);

  const row = (label: string, value: React.ReactNode) =>
    value != null && value !== "" ? (
      <div className="flex justify-between gap-4">
        <span className="text-white/50">{label}</span>
        <span className="text-right">{value}</span>
      </div>
    ) : null;

  const exposure = data && [
    data.fNumber ? `f/${data.fNumber}` : null,
    data.exposureTime || null,
    data.iso ? `ISO ${data.iso}` : null,
    data.focalLength ? `${data.focalLength}mm` : null,
  ].filter(Boolean).join(" · ");

  const location = data && [data.city, data.state, data.country].filter(Boolean).join(", ");

  return (
    <div
      className="absolute right-3 top-14 z-20 w-72 rounded-lg bg-black/80 p-4 text-sm text-white shadow-lg backdrop-blur"
      onClick={(e) => e.stopPropagation()}
    >
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin" /></div>
      ) : !data ? (
        <div className="text-white/50">Couldn&apos;t load EXIF data.</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {row("Camera", [data.make, data.model].filter(Boolean).join(" "))}
          {row("Lens", data.lensModel)}
          {row("Exposure", exposure || null)}
          {row("Dimensions", data.exifImageWidth && data.exifImageHeight ? `${data.exifImageWidth} × ${data.exifImageHeight}` : null)}
          {row("File size", data.fileSizeInByte ? humanizeBytes(data.fileSizeInByte) : null)}
          {row("Taken", data.dateTimeOriginal ? new Date(data.dateTimeOriginal).toLocaleString() : null)}
          {row("Location", location || null)}
        </div>
      )}
    </div>
  );
}
