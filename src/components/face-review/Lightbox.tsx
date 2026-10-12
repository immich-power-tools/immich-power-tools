import React, { useContext } from "react";
import { ExternalLink } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import ConfigContext from "@/contexts/ConfigContext";

/**
 * Full-photo preview for a face card — reuses the asset thumbnail proxy
 * (preview size, browser-cached) so eyeballing a photo never needs a new
 * tab or an Immich login.
 */
export default function Lightbox({
  assetId,
  onClose,
}: {
  assetId: string | null;
  onClose: () => void;
}) {
  const { exImmichUrl } = useContext(ConfigContext);
  return (
    <Dialog open={!!assetId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl p-2">
        <DialogTitle className="sr-only">Photo preview</DialogTitle>
        {assetId && (
          <div className="flex flex-col gap-2 items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/immich-proxy/asset/thumbnail/${assetId}?size=preview`}
              alt="Photo preview"
              className="max-h-[80vh] rounded-md object-contain"
            />
            <a
              href={`${exImmichUrl}/photos/${assetId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              Open in Immich <ExternalLink size={14} />
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
