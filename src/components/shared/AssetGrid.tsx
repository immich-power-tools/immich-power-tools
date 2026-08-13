import "yet-another-react-lightbox/styles.css";
import "react-photo-album/rows.css";

import { IAsset } from '@/types/asset';
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState, useCallback } from 'react'
import Lightbox from 'yet-another-react-lightbox';
import { RowsPhotoAlbum } from "react-photo-album";
import type { Photo, RenderImageContext, RenderImageProps } from "react-photo-album";
import LazyGridImage from "../ui/lazy-grid-image";
import Download from "yet-another-react-lightbox/plugins/download";
import Video from "yet-another-react-lightbox/plugins/video";
import { usePhotoSelectionContext } from '@/contexts/PhotoSelectionContext';
import { useConfig } from '@/contexts/ConfigContext';
import dynamic from 'next/dynamic';
import { Heart, Info, Trash2, ExternalLink } from 'lucide-react';
import { updateAssets, deleteAssets } from '@/handlers/api/asset.handler';
import { toast } from '@/components/ui/use-toast';
import {
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogPortal,
  AlertDialogOverlay,
} from '@/components/ui/alert-dialog';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';

const AssetInfoPanel = dynamic(() => import('@/components/asset-info/AssetInfoPanel'), { ssr: false });

export interface AssetPhoto extends Photo {
  id: string;
  isVideo: boolean;
  duration?: string;
  isSelected: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

interface AssetGridProps {
  assets: IAsset[];
  isInternal?: boolean;
  selectable?: boolean;
  /** Selection-first click mode: plain click selects just that photo,
   *  cmd/ctrl toggles it, shift extends a range. The preview only opens
   *  via renderExtras' openPreview action (or double-click). */
  clickToSelect?: boolean;
  /** Per-thumbnail overlay content; defaults to the open-in-Immich link. */
  renderExtras?: (photo: AssetPhoto, actions: { openPreview: () => void }) => React.ReactNode;
  /** Reports the photo id under the cursor (null when leaving). */
  onPhotoHover?: (id: string | null) => void;
  /** Photo to flash with a cyan ring (e.g. its map pin was clicked). */
  highlightedAssetId?: string | null;
  onSelectionChange?: (ids: string[]) => void;
  onDeleteAsset?: (id: string) => void;
  onFavoriteAsset?: (id: string, isFavorite: boolean) => void;
}

interface AssetGridRef {
  getSelectedIds: () => string[];
  selectAll: () => void;
  unselectAll: () => void;
}

const AssetGrid = forwardRef<AssetGridRef, AssetGridProps>(({ assets, isInternal = true, selectable = false, clickToSelect = false, renderExtras, onPhotoHover, highlightedAssetId, onSelectionChange, onDeleteAsset, onFavoriteAsset }, ref) => {
  const [index, setIndex] = useState(-1);
  const [lastSelectedIndex, setLastSelectedIndex] = useState(-1);
  const [showInfoPanel, setShowInfoPanel] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('assetInfoPanelOpen') === 'true'
    }
    return false
  });
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set(assets.filter(a => a.isFavorite).map(a => a.id)));
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const { exImmichUrl } = useConfig();
  // Use context for selection state
  const { selectedIds, updateContext } = usePhotoSelectionContext();

  // Sync favoriteIds when assets change
  useEffect(() => {
    setFavoriteIds(new Set(assets.filter(a => a.isFavorite).map(a => a.id)));
  }, [assets]);

  const handleToggleFavorite = useCallback(async (assetId: string) => {
    const isFav = favoriteIds.has(assetId);
    const newFav = !isFav;
    // Optimistic update
    setFavoriteIds(prev => {
      const next = new Set(prev);
      newFav ? next.add(assetId) : next.delete(assetId);
      return next;
    });
    try {
      await updateAssets({ ids: [assetId], isFavorite: newFav });
      toast({ title: newFav ? "Added to favorites" : "Removed from favorites" });
      onFavoriteAsset?.(assetId, newFav);
    } catch {
      // Revert on failure
      setFavoriteIds(prev => {
        const next = new Set(prev);
        isFav ? next.add(assetId) : next.delete(assetId);
        return next;
      });
      toast({ title: "Error", description: "Failed to update favorite", variant: "destructive" });
    }
  }, [favoriteIds, onFavoriteAsset]);

  const toggleInfoPanel = useCallback(() => {
    setShowInfoPanel((v) => {
      const next = !v
      localStorage.setItem('assetInfoPanelOpen', String(next))
      return next
    })
  }, []);

  const currentAsset = index >= 0 && index < assets.length ? assets[index] : null;

  useImperativeHandle(ref, () => ({
    getSelectedIds: () => selectedIds,
    selectAll: () => {
      const allIds = assets.map((asset) => asset.id);
      updateContext({ selectedIds: allIds });
      onSelectionChange?.(allIds);
    },
    unselectAll: () => {
      updateContext({ selectedIds: [] });
      onSelectionChange?.([]);
    },
  }), [assets, selectedIds, updateContext]);


  const handleSelect = (_idx: number, asset: AssetPhoto, event: React.MouseEvent) => {

    event.stopPropagation();
    const isPresent = selectedIds.includes(asset.id);
    if (isPresent) {
      const newSelectedIds = selectedIds.filter((id) => id !== asset.id);
      updateContext({ selectedIds: newSelectedIds });
      onSelectionChange?.(newSelectedIds);
    } else {
      const clickedIndex = images.findIndex((image) => {
        return image.id === asset.id;
      });
      if (event.shiftKey) {
        const startIndex = Math.min(clickedIndex, lastSelectedIndex);
        const endIndex = Math.max(clickedIndex, lastSelectedIndex);
        const rangeSelectedIds = images.slice(startIndex, endIndex + 1).map((image) => image.id);
        const allSelectedIds = [...selectedIds, ...rangeSelectedIds];
        const uniqueSelectedIds = [...new Set(allSelectedIds)];
        updateContext({ selectedIds: uniqueSelectedIds });
        onSelectionChange?.(uniqueSelectedIds);
      } else {
        const newSelectedIds = [...selectedIds, asset.id];
        updateContext({ selectedIds: newSelectedIds });
        onSelectionChange?.(newSelectedIds);
      }
      setLastSelectedIndex(clickedIndex);
    }
  };

  const handleClickToSelect = (asset: AssetPhoto, event: React.MouseEvent) => {
    const clickedIndex = images.findIndex((image) => image.id === asset.id);
    let newSelectedIds: string[];
    if (event.shiftKey && lastSelectedIndex >= 0) {
      const startIndex = Math.min(clickedIndex, lastSelectedIndex);
      const endIndex = Math.max(clickedIndex, lastSelectedIndex);
      const rangeIds = images.slice(startIndex, endIndex + 1).map((image) => image.id);
      newSelectedIds = [...new Set([...selectedIds, ...rangeIds])];
    } else if (event.metaKey || event.ctrlKey) {
      newSelectedIds = selectedIds.includes(asset.id)
        ? selectedIds.filter((id) => id !== asset.id)
        : [...selectedIds, asset.id];
    } else {
      // Plain click selects just this photo; clicking the sole selected photo deselects it.
      newSelectedIds = selectedIds.length === 1 && selectedIds[0] === asset.id ? [] : [asset.id];
    }
    updateContext({ selectedIds: newSelectedIds });
    onSelectionChange?.(newSelectedIds);
    setLastSelectedIndex(clickedIndex);
  };

  const handleClick = (index: number, asset: AssetPhoto, event: React.MouseEvent) => {
    if (clickToSelect && selectable) {
      if (event.detail >= 2) {
        setIndex(index);
      } else {
        handleClickToSelect(asset, event);
      }
      return;
    }
    if (selectable && (event.metaKey || event.ctrlKey || selectedIds.length > 0)) {
      handleSelect(index, asset, event);
    } else {
      setIndex(index);
    }
  }

  const slides = useMemo(() => {
    return assets.filter((asset) => !deletedIds.has(asset.id)).map((asset) => ({
      ...asset,
      orientation: 1,
      src: asset.previewUrl as string,
      type: (asset.type === "VIDEO" ? "video" : "image") as any,
      sources:
        asset.type === "VIDEO"
          ? [
            {
              src: asset.downloadUrl as string,
              type: "video/mp4",
            },
          ]
          : undefined,
      height: asset.exifImageHeight as number,
      width: asset.exifImageWidth as number,
      downloadUrl: asset.downloadUrl as string,
    }));
  }, [assets]);

  const images: AssetPhoto[] = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    return assets
      .filter((p) => !deletedIds.has(p.id))
      .map((p) => ({
        ...p,
        src: p.url as string,
        original: p.previewUrl as string,
        width: p.exifImageWidth as number,
        height: p.exifImageHeight as number,
        orientation: 1,
        isSelected: selectedSet.has(p.id),
        isVideo: p.type === "VIDEO",
        duration: p.duration != null ? String(p.duration) : undefined,
      }));
  }, [assets, selectedIds, deletedIds]);

  const handleEsc = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    if (event.key === "Escape") {
      updateContext({ selectedIds: [] });
      onSelectionChange?.([]);
    }
  };

  useEffect(() => {
    // Listen for esc key press and unselect all images
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [images]);

  const renderImage = (props: RenderImageProps, context: RenderImageContext<AssetPhoto>) => {
    return (
      <LazyGridImage
        imageProps={props}
        photo={context.photo}
        width={context.width}
        height={context.height}
        selectable={selectable}
        onSelect={(event) => handleSelect(context.index, context.photo, event)}
        selectionMode={selectable && selectedIds.length > 0}
        onHover={onPhotoHover}
        highlighted={highlightedAssetId === context.photo.id}
      />
    );
  };

  const handleOpenInImmich = useCallback(() => {
    if (currentAsset) {
      window.open(exImmichUrl + "/photos/" + currentAsset.id, "_blank");
    }
  }, [currentAsset, exImmichUrl]);

  const toolbarButtons = useMemo(() => {
    if (!currentAsset) return [];
    const isFav = favoriteIds.has(currentAsset.id);
    return [
      <button
        key="favorite"
        type="button"
        className="yarl__button"
        title={isFav ? "Unfavorite" : "Favorite"}
        onClick={() => handleToggleFavorite(currentAsset.id)}
      >
        <Heart
          className={`h-6 w-6 ${isFav ? 'fill-red-500 text-red-500' : 'text-white'}`}
        />
      </button>,
      <button
        key="info"
        type="button"
        className="yarl__button"
        title="Info"
        onClick={toggleInfoPanel}
      >
        <Info className={`h-6 w-6 ${showInfoPanel ? 'text-blue-400' : 'text-white'}`} />
      </button>,
      <button
        key="open-immich"
        type="button"
        className="yarl__button"
        title="Open in Immich"
        onClick={handleOpenInImmich}
      >
        <ExternalLink className="h-6 w-6 text-white" />
      </button>,
      <button
        key="delete"
        type="button"
        className="yarl__button"
        title="Move to trash"
        onClick={() => setDeleteConfirmOpen(true)}
      >
        <Trash2 className="h-6 w-6 text-white" />
      </button>,
    ];
  }, [currentAsset, showInfoPanel, onDeleteAsset, onFavoriteAsset, handleOpenInImmich, favoriteIds, handleToggleFavorite]);

  return (
    <div>
      <Lightbox
        slides={slides}
        plugins={[Download, Video]}
        open={index >= 0}
        index={index}
        close={() => { setIndex(-1); }}
        on={{
          view: ({ index }) => setIndex(index),
        }}
        toolbar={{
          buttons: [
            ...toolbarButtons,
            "download",
            "close",
          ],
        }}
        render={{
          slideContainer: ({ children }) => (
            // Stacks on phones (info panel below the photo) instead of
            // crushing the photo beside a fixed-width side panel.
            <div className="flex h-full w-full flex-col md:flex-row">
              <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center">
                {children}
              </div>
              {showInfoPanel && currentAsset && (
                <AssetInfoPanel
                  assetId={currentAsset.id}
                />
              )}
            </div>
          ),
        }}
        styles={{
          container: {
            backgroundColor: "rgba(0, 0, 0, 0.95)",
          },
          slide: {
            padding: 0,
          },
        }}
      />
      <AlertDialogPrimitive.Root open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogPortal>
          <AlertDialogOverlay className="!z-[10000]" />
          <AlertDialogPrimitive.Content className="fixed left-[50%] top-[50%] z-[10001] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>Move to trash?</AlertDialogTitle>
              <AlertDialogDescription>
                {currentAsset ? `"${currentAsset.originalFileName}"` : "This asset"} goes to Immich&apos;s trash (recoverable there until it&apos;s emptied), not permanent deletion.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteConfirmOpen(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={async () => {
                  if (currentAsset) {
                    try {
                      await deleteAssets([currentAsset.id], { force: false }); // Immich trash, NOT permanent
                      setDeletedIds((prev) => new Set(prev).add(currentAsset.id));
                      onDeleteAsset?.(currentAsset.id);
                      toast({ title: "Moved to trash", description: `"${currentAsset.originalFileName}" is in Immich's trash.` });
                      setIndex(-1);
                    } catch {
                      toast({ title: "Error", description: "Failed to delete asset.", variant: "destructive" });
                    }
                  }
                  setDeleteConfirmOpen(false);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogPrimitive.Content>
        </AlertDialogPortal>
      </AlertDialogPrimitive.Root>

      <RowsPhotoAlbum
        photos={images}
        targetRowHeight={150}
        rowConstraints={{ singleRowMaxHeight: 300 }}
        spacing={2}
        padding={0}
        onClick={({ index, event, photo }) => handleClick(index, photo, event)}
        render={{
          image: renderImage,
          extras: (_, { photo, index }) =>
            renderExtras ? (
              renderExtras(photo, { openPreview: () => setIndex(index) })
            ) : (
              <a
                href={exImmichUrl + "/photos/" + photo.id}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-1 left-1 bg-black/60 p-1 rounded"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5 text-white" />
              </a>
            ),
        }}
      />
    </div>
  );
})
AssetGrid.displayName = "AssetGrid";
export default AssetGrid;
