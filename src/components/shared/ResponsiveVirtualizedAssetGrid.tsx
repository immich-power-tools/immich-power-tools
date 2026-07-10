import "yet-another-react-lightbox/styles.css";

import { IAsset } from '@/types/asset';
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState, useCallback, useRef } from 'react'
import Lightbox from 'yet-another-react-lightbox';
import Download from "yet-another-react-lightbox/plugins/download";
import Video from "yet-another-react-lightbox/plugins/video";
import { usePhotoSelectionContext } from '@/contexts/PhotoSelectionContext';
import { FixedSizeGrid as Grid } from 'react-window';
import LazyImage from '../ui/lazy-image';
import { humanizeDuration } from '@/helpers/string.helper';
import { PlayIcon } from '@radix-ui/react-icons';
import { useGridDimensions } from '@/hooks';

interface ResponsiveVirtualizedAssetGridProps {
  assets: IAsset[];
  isInternal?: boolean;
  selectable?: boolean;
  onSelectionChange?: (ids: string[]) => void;
  targetItemSize?: number;
  gap?: number;
  minColumns?: number;
  maxColumns?: number;
  className?: string;
}

interface ResponsiveVirtualizedAssetGridRef {
  getSelectedIds: () => string[];
  selectAll: () => void;
  unselectAll: () => void;
}

const ResponsiveVirtualizedAssetGrid = forwardRef<ResponsiveVirtualizedAssetGridRef, ResponsiveVirtualizedAssetGridProps>(({ 
  assets, 
  isInternal = true, 
  selectable = false, 
  onSelectionChange,
  targetItemSize = 200,
  gap = 8,
  minColumns = 2,
  maxColumns = 8,
  className = ""
}, ref) => {
  const [index, setIndex] = useState(-1);
  const [lastSelectedIndex, setLastSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  
  // Use context for selection state
  const { selectedIds, updateContext } = usePhotoSelectionContext();

  // Calculate grid dimensions
  const gridDimensions = useGridDimensions({
    containerWidth: containerSize.width,
    containerHeight: containerSize.height,
    itemSize: targetItemSize,
    gap,
    minColumns,
    maxColumns
  });


  // Resize observer to handle container size changes
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

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

  const slides = useMemo(() => {
    return assets.map((asset) => ({
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

  const handleSelect = useCallback((_idx: number, asset: IAsset, event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    const isPresent = selectedIds.includes(asset.id);
    if (isPresent) {
      const newSelectedIds = selectedIds.filter((id) => id !== asset.id);
      updateContext({ selectedIds: newSelectedIds });
      onSelectionChange?.(newSelectedIds);
    } else {
      const clickedIndex = assets.findIndex((a) => a.id === asset.id);
      if (event.shiftKey) {
        const startIndex = Math.min(clickedIndex, lastSelectedIndex);
        const endIndex = Math.max(clickedIndex, lastSelectedIndex);
        const rangeSelectedIds = assets.slice(startIndex, endIndex + 1).map((a) => a.id);
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
  }, [selectedIds, assets, lastSelectedIndex, updateContext, onSelectionChange]);

  const handleClick = useCallback((index: number, asset: IAsset, event: React.MouseEvent<HTMLElement>) => {
    if (selectable && (event.metaKey || event.ctrlKey || selectedIds.length > 0)) {
      handleSelect(index, asset, event);
    } else {
      setIndex(index);
    }
  }, [selectedIds, selectable, handleSelect]);

  const handleEsc = useCallback((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      updateContext({ selectedIds: [] });
      onSelectionChange?.([]);
    }
  }, [updateContext, onSelectionChange]);

  useEffect(() => {
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [handleEsc]);

  // Cell renderer for React Window
  const Cell = useCallback(({ columnIndex, rowIndex, style }: { columnIndex: number; rowIndex: number; style: React.CSSProperties }) => {
    const assetIndex = rowIndex * gridDimensions.columnCount + columnIndex;
    const asset = assets[assetIndex];

    if (!asset) {
      return <div style={style} />;
    }

    const isSelected = selectedIds.includes(asset.id);

    return (
      <div 
        style={{
          ...style,
          padding: `${gap / 2}px`,
        }}
        className={`relative ${isSelected ? 'ring-2 ring-blue-500 rounded-lg' : ''}`}
        onClick={(e) => handleClick(assetIndex, asset, e)}
      >
        <div className="relative w-full h-full rounded-lg overflow-hidden">
          <LazyImage
            src={asset.url as string}
            alt={asset.originalFileName || ''}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
          {asset.type === "VIDEO" && (
            <div className="absolute bottom-2 right-2 bg-black/50 p-1 rounded-full flex items-center gap-1">
              <PlayIcon className="w-3 h-3 text-white" />
              {asset.duration && (
                <span className="text-xs text-white">
                  {humanizeDuration(asset.duration.toString())}
                </span>
              )}
            </div>
          )}
          {selectable && (
            <div 
              className={`absolute top-2 left-2 w-4 h-4 rounded-full border-2 cursor-pointer z-10 ${
                isSelected 
                  ? 'bg-blue-500 border-blue-500' 
                  : 'bg-white/80 border-gray-300'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(assetIndex, asset, e);
              }}
            />
          )}
        </div>
      </div>
    );
  }, [assets, selectedIds, gridDimensions.columnCount, handleClick, selectable, gap]);

  // Don't render grid until we have container dimensions
  if (containerSize.width === 0 || gridDimensions.rowCount === 0) {
    return (
      <div ref={containerRef} className={`w-full h-full ${className}`}>
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-500">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`w-full h-full ${className}`}>
      <Lightbox
        slides={slides}
        plugins={[Download, Video]}
        open={index >= 0}
        index={index}
        close={() => setIndex(-1)}
      />
      <Grid
        columnCount={gridDimensions.columnCount}
        columnWidth={gridDimensions.itemSize}
        height={containerSize.height}
        rowCount={gridDimensions.rowCount}
        rowHeight={gridDimensions.itemSize}
        width={containerSize.width}
      >
        {Cell}
      </Grid>
    </div>
  );
});

ResponsiveVirtualizedAssetGrid.displayName = "ResponsiveVirtualizedAssetGrid";
export default ResponsiveVirtualizedAssetGrid;
