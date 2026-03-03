import React, { useEffect, useRef } from 'react'
import { VariableSizeList as List } from 'react-window'
import { IDuplicateAssetRecord } from '@/types/asset'
import { IAssetAlbumInfo } from '@/handlers/api/asset.handler'
import DuplicateAssetRecord from './DuplicateAssetRecord'

interface VirtualizedDuplicateListProps {
  duplicates: IDuplicateAssetRecord[]
  selectedAssets: Set<string>
  onAssetSelect: (assetId: string, isShiftClick?: boolean) => void
  onDeleteRecord: (record: IDuplicateAssetRecord) => void
  onKeepSelected: (record: IDuplicateAssetRecord, selectedIds: string[], unselectedIds: string[]) => void
  onKeepAllInRecord: (record: IDuplicateAssetRecord) => void
  height: number
  selectionMode: 'keep' | 'discard'
  assetAlbums: Record<string, IAssetAlbumInfo[]>
}

interface ListItemProps {
  index: number
  style: React.CSSProperties
  data: {
    duplicates: IDuplicateAssetRecord[]
    selectedAssets: Set<string>
    onAssetSelect: (assetId: string, isShiftClick?: boolean) => void
    onDeleteRecord: (record: IDuplicateAssetRecord) => void
    onKeepSelected: (record: IDuplicateAssetRecord, selectedIds: string[], unselectedIds: string[]) => void
    onKeepAllInRecord: (record: IDuplicateAssetRecord) => void
    selectionMode: 'keep' | 'discard'
    assetAlbums: Record<string, IAssetAlbumInfo[]>
  }
}

const ListItem: React.FC<ListItemProps> = ({ index, style, data }) => {
  const { duplicates, selectedAssets, onAssetSelect, onDeleteRecord, onKeepSelected, onKeepAllInRecord, selectionMode, assetAlbums } = data
  const record = duplicates[index]

  return (
    <div style={style}>
      <div style={{ padding: '0 24px' }}>
        <DuplicateAssetRecord
          record={record}
          selectedAssets={selectedAssets}
          onAssetSelect={onAssetSelect}
          onDeleteRecord={onDeleteRecord}
          onKeepSelected={onKeepSelected}
          onKeepAllInRecord={onKeepAllInRecord}
          selectionMode={selectionMode}
          assetAlbums={assetAlbums}
        />
      </div>
    </div>
  )
}

// Calculate dynamic height for each duplicate record
const getItemSize = (record: IDuplicateAssetRecord): number => {
  // Base height for the header section
  let height = 120 // Header + margin
  
  // Calculate grid rows needed
  const assetsPerRow = 5 // xl:grid-cols-5 is the max
  const rows = Math.ceil(record.assets.length / assetsPerRow)
  
  // Each asset item is approximately 320px tall (200px image + 120px details)
  const assetRowHeight = 320
  
  return height + (rows * assetRowHeight) + 32 // Add some margin
}

export default function VirtualizedDuplicateList({
  duplicates,
  selectedAssets,
  onAssetSelect,
  onDeleteRecord,
  onKeepSelected,
  onKeepAllInRecord,
  height,
  selectionMode,
  assetAlbums
}: VirtualizedDuplicateListProps) {
  const listRef = useRef<List>(null)

  // Reset cached row heights when the duplicates list changes (e.g. after filtering)
  useEffect(() => {
    listRef.current?.resetAfterIndex(0)
  }, [duplicates])

  // Custom item size getter for VariableSizeList
  const getItemHeight = (index: number) => {
    if (index >= duplicates.length) return 0
    return getItemSize(duplicates[index])
  }

  // Data to pass to each list item
  const itemData = {
    duplicates,
    selectedAssets,
    onAssetSelect,
    onDeleteRecord,
    onKeepSelected,
    onKeepAllInRecord,
    selectionMode,
    assetAlbums
  }

  // For better performance with many items, we'll use a custom implementation
  // that handles variable heights properly
  return (
    <div style={{ height }}>
      {duplicates.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No duplicate records to display</p>
        </div>
      ) : (
        <List
          ref={listRef}
          height={height}
          width="100%"
          itemCount={duplicates.length}
          itemSize={getItemHeight}
          itemData={itemData}
          overscanCount={2}
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#cbd5e1 transparent'
          }}
        >
          {ListItem}
        </List>
      )}
    </div>
  )
}
