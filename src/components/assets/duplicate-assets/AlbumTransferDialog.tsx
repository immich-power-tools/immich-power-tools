import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FolderOpen } from 'lucide-react'
import { IAssetAlbumInfo } from '@/handlers/api/asset.handler'

interface AlbumTransferDialogProps {
  open: boolean
  onClose: () => void
  albums: IAssetAlbumInfo[]
  onSkip: () => void
  onTransfer: (albumIds: string[]) => void
}

export default function AlbumTransferDialog({
  open,
  onClose,
  albums,
  onSkip,
  onTransfer,
}: AlbumTransferDialogProps) {
  const [selectedAlbumIds, setSelectedAlbumIds] = useState<Set<string>>(
    () => new Set(albums.map((a) => a.albumId))
  )

  const handleToggle = (albumId: string) => {
    setSelectedAlbumIds((prev) => {
      const next = new Set(prev)
      if (next.has(albumId)) {
        next.delete(albumId)
      } else {
        next.add(albumId)
      }
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move Album Memberships</DialogTitle>
          <DialogDescription>
            Select which albums to transfer to the kept asset before deleting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-60 overflow-y-auto py-2">
          {albums.map((album) => (
            <label
              key={album.albumId}
              className="flex items-center gap-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
            >
              <Checkbox
                checked={selectedAlbumIds.has(album.albumId)}
                onCheckedChange={() => handleToggle(album.albumId)}
              />
              <FolderOpen size={14} className="text-gray-500" />
              <span className="text-sm">{album.albumName}</span>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onSkip}>
            Skip &amp; Delete
          </Button>
          <Button
            onClick={() => onTransfer(Array.from(selectedAlbumIds))}
            disabled={selectedAlbumIds.size === 0}
          >
            Transfer &amp; Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
