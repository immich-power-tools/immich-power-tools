import React, { useMemo } from 'react'
import { IDuplicateAssetRecord, IDuplicateAsset } from '@/types/asset'
import { ASSET_THUMBNAIL_PATH } from '@/config/routes'
import LazyImage from '@/components/ui/lazy-image'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { humanizeBytes, humanizeNumber } from '@/helpers/string.helper'
import { formatDate } from '@/helpers/date.helper'
import { Camera, Calendar, HardDrive, MapPin, Trash2, Check, X, Shield } from 'lucide-react'

interface DuplicateAssetRecordProps {
  record: IDuplicateAssetRecord
  selectedAssets: Set<string>
  onAssetSelect: (assetId: string, isShiftClick?: boolean) => void
  onDeleteRecord: (record: IDuplicateAssetRecord) => void
  onKeepSelected: (record: IDuplicateAssetRecord, selectedIds: string[], unselectedIds: string[]) => void
  onKeepAllInRecord: (record: IDuplicateAssetRecord) => void
  selectionMode: 'keep' | 'discard'
}

interface DuplicateAssetItemProps {
  asset: IDuplicateAsset
  isSelected: boolean
  onSelect: (assetId: string, isShiftClick?: boolean) => void
  selectionMode: 'keep' | 'discard'
}

function DuplicateAssetItem({ asset, isSelected, onSelect, selectionMode }: DuplicateAssetItemProps) {
  const handleCheckboxChange = (event: React.MouseEvent) => {
    const isShiftClick = event.shiftKey
    onSelect(asset.id, isShiftClick)
  }

  return (
    <div className="border rounded-lg overflow-hidden shadow-lg relative group">
      <label className="block relative cursor-pointer">
        <LazyImage
          src={ASSET_THUMBNAIL_PATH(asset.id)}
          alt={asset.originalFileName}
          title={asset.originalFileName}
          style={{
            width: '100%',
            height: '200px',
            objectFit: 'cover',
          }}
        />
        
        {/* Overlay info */}
        <div className="absolute bottom-0 w-full bg-gray-800/70 text-white text-center text-xs font-bold py-1 group-hover:hidden">
          {formatDate(asset.exifInfo.dateTimeOriginal?.toString(), 'MMM d, yyyy')}
        </div>
        
        {/* Keep/Trash label */}
        <div className="absolute top-2 right-2">
          {selectionMode === 'keep' ? (
            isSelected ? (
              <div className="bg-green-600 text-white text-xs px-2 py-1 rounded font-bold flex items-center gap-1">
                <Shield size={12} />
                KEEP
              </div>
            ) : (
              <div className="bg-red-600 text-white text-xs px-2 py-1 rounded font-bold flex items-center gap-1">
                <Trash2 size={12} />
                DISCARD
              </div>
            )
          ) : (
            isSelected ? (
              <div className="bg-red-600 text-white text-xs px-2 py-1 rounded font-bold flex items-center gap-1">
                <Trash2 size={12} />
                DISCARD
              </div>
            ) : (
              <div className="bg-green-600 text-white text-xs px-2 py-1 rounded font-bold flex items-center gap-1">
                <Shield size={12} />
                KEEP
              </div>
            )
          )}
        </div>
        
        {/* Checkbox */}
        <Checkbox
          checked={isSelected}
          onClick={handleCheckboxChange}
          className="absolute top-2 left-2 w-6 h-6 rounded-full border-gray-300 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        />
        
        {/* Asset type indicator */}
        {asset.type === 'VIDEO' && (
          <div className="absolute top-12 right-2 bg-gray-800 text-white text-xs py-1 px-2 rounded">
            VIDEO
          </div>
        )}
      </label>
      
      {/* Asset details */}
      <div className={`p-3 ${isSelected ? 'bg-blue-500' : ''}`}>
        <h3 className={`text-sm font-semibold truncate ${isSelected ? 'text-white' : ''}`}>
          {asset.originalFileName}
        </h3>
        <p className={`text-xs truncate ${isSelected ? 'text-white/70' : 'text-gray-500 dark:text-gray-500'}`} title={asset.originalPath}>
          {asset.originalPath.substring(0, asset.originalPath.lastIndexOf('/'))}
        </p>

        <div className="mt-2 space-y-1">
          <div className={`flex items-center gap-1 text-xs ${isSelected ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`}>
            <HardDrive size={12} />
            {humanizeBytes(asset.exifInfo.fileSizeInByte)}
          </div>
          
          <div className={`flex items-center gap-1 text-xs ${isSelected ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`}>
            <Camera size={12} />
            {asset.exifInfo.exifImageWidth} × {asset.exifInfo.exifImageHeight}
          </div>
          
          {asset.exifInfo.city && (
            <div className={`flex items-center gap-1 text-xs ${isSelected ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`}>
              <MapPin size={12} />
              {asset.exifInfo.city}, {asset.exifInfo.country}
            </div>
          )}
          
          {asset.exifInfo.make && asset.exifInfo.model && (
            <div className={`text-xs ${isSelected ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`}>
              {asset.exifInfo.make} {asset.exifInfo.model}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DuplicateAssetRecord({ 
  record, 
  selectedAssets, 
  onAssetSelect, 
  onDeleteRecord, 
  onKeepSelected,
  onKeepAllInRecord,
  selectionMode
}: DuplicateAssetRecordProps) {
  const recordAssetIds = record.assets.map(asset => asset.id)
  const selectedInRecord = recordAssetIds.filter(id => selectedAssets.has(id)).length
  const unselectedInRecord = record.assets.length - selectedInRecord
  
  // Calculate total size and selected/unselected sizes
  const totalSize = useMemo(() => {
    return record.assets.reduce((sum, asset) => sum + asset.exifInfo.fileSizeInByte, 0)
  }, [record.assets])
  
  const selectedSize = useMemo(() => {
    return record.assets
      .filter(asset => selectedAssets.has(asset.id))
      .reduce((sum, asset) => sum + asset.exifInfo.fileSizeInByte, 0)
  }, [record.assets, selectedAssets])
  
  const unselectedSize = useMemo(() => {
    return record.assets
      .filter(asset => !selectedAssets.has(asset.id))
      .reduce((sum, asset) => sum + asset.exifInfo.fileSizeInByte, 0)
  }, [record.assets, selectedAssets])

  const handleKeepAll = () => {
    onKeepAllInRecord(record)
  }

  const handleDeleteRecord = () => {
    onDeleteRecord(record)
  }

  const handleKeepSelected = () => {
    const selectedAssetIds = record.assets
      .filter(asset => selectedAssets.has(asset.id))
      .map(asset => asset.id)
    
    const unselectedAssetIds = record.assets
      .filter(asset => !selectedAssets.has(asset.id))
      .map(asset => asset.id)
    
    if (selectedAssetIds.length === 0) return

    if (selectionMode === 'keep') {
      // Keep selected, delete unselected
      onKeepSelected(record, selectedAssetIds, unselectedAssetIds)
    } else {
      // Delete selected, keep unselected
      onKeepSelected(record, unselectedAssetIds, selectedAssetIds)
    }
  }

  return (
    <div className="mb-8">
      <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <Camera size={16} />
              {humanizeNumber(record.assets.length)} duplicate{record.assets.length !== 1 ? 's' : ''}
            </div>
            <div className="flex items-center gap-1">
              <HardDrive size={16} />
              {humanizeBytes(totalSize)} total
            </div>
                      {selectedInRecord > 0 && (
            <div className="flex items-center gap-2 text-sm">
              {selectionMode === 'keep' ? (
                <>
                  <div className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
                    <Shield size={16} />
                    {selectedInRecord} to keep ({humanizeBytes(selectedSize)})
                  </div>
                  <div className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                    <Trash2 size={16} />
                    {unselectedInRecord} to delete ({humanizeBytes(unselectedSize)} savings)
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                    <Trash2 size={16} />
                    {selectedInRecord} to delete ({humanizeBytes(selectedSize)} savings)
                  </div>
                  <div className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
                    <Shield size={16} />
                    {unselectedInRecord} to keep ({humanizeBytes(unselectedSize)})
                  </div>
                </>
              )}
            </div>
          )}
          </div>
          <div className="flex items-center gap-2">
            <AlertDialog
              title="Keep All Assets"
              description={`Are you sure you want to keep all ${record.assets.length} assets in this group? This will remove them from the duplicate detection and they won't appear as duplicates anymore.`}
              onConfirm={handleKeepAll}
              asChild
            >
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                title="Remove from duplicate detection"
              >
                <Shield size={16} />
                Keep All
              </Button>
            </AlertDialog>
            
            {selectedInRecord > 0 && (
              <AlertDialog
                title={selectionMode === 'keep' ? "Keep Selected Assets" : "Delete Selected Assets"}
                description={selectionMode === 'keep' 
                  ? `Keep ${selectedInRecord} selected assets and delete ${unselectedInRecord} unselected assets? The selected assets will be removed from duplicate detection. Storage savings: ${humanizeBytes(unselectedSize)}. This action cannot be undone.`
                  : `Delete ${selectedInRecord} selected assets and keep ${unselectedInRecord} unselected assets? The unselected assets will be removed from duplicate detection. Storage savings: ${humanizeBytes(selectedSize)}. This action cannot be undone.`
                }
                onConfirm={handleKeepSelected}
                variant="destructive"
                asChild
              >
                <Button
                  variant="default"
                  size="sm"
                  className="flex items-center gap-1"
                  title={selectionMode === 'keep' 
                    ? `Keep selected, delete others (${humanizeBytes(unselectedSize)} savings)`
                    : `Delete selected, keep others (${humanizeBytes(selectedSize)} savings)`
                  }
                >
                  {selectionMode === 'keep' ? <Shield size={16} /> : <Trash2 size={16} />}
                  {selectionMode === 'keep' ? 'Keep' : 'Delete'} Selected ({selectedInRecord})
                </Button>
              </AlertDialog>
            )}
            
            <AlertDialog
              title="Delete All Assets"
              description={`Are you sure you want to delete all ${record.assets.length} assets in this duplicate group? Storage savings: ${humanizeBytes(totalSize)}. This action cannot be undone.`}
              onConfirm={handleDeleteRecord}
              variant="destructive"
              asChild
            >
              <Button
                variant="destructive"
                size="sm"
                className="flex items-center gap-1"
                title={`Delete group (${humanizeBytes(totalSize)} savings)`}
              >
                <Trash2 size={16} />
                Delete All ({humanizeBytes(totalSize)})
              </Button>
            </AlertDialog>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {record.assets.map((asset) => (
          <DuplicateAssetItem
            key={asset.id}
            asset={asset}
            isSelected={selectedAssets.has(asset.id)}
            onSelect={onAssetSelect}
            selectionMode={selectionMode}
          />
        ))}
      </div>
    </div>
  )
}
