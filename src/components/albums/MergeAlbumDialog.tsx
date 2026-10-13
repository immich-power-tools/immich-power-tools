import React, { useState } from 'react'
import { Dialog, DialogHeader, DialogContent, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Button } from '../ui/button'
import { IAlbum } from '@/types/album';
import { useAlbumSelection } from '@/contexts/AlbumSelectionContext';
import AlbumThumbnail from './list/AlbumThumbnail';
import { mergeAlbums } from '@/handlers/api/album.handler';
import { toast } from "sonner";

interface IProps {
  onMerge: (primaryAlbumId: string, secondaryAlbumIds: string[]) => void;
}

export default function MergeAlbumDialog({ onMerge }: IProps) {
  const [open, setOpen] = useState(false);
  const [primaryAlbum, setPrimaryAlbum] = useState<IAlbum | null>(null);
  const [mergeLoading, setMergeLoading] = useState(false);

  const { selectedAlbums, clearSelection } = useAlbumSelection();

  const handleMergeAlbums = () => {
    const primaryAlbumId = selectedAlbums.find(album => album.id === primaryAlbum?.id)?.id;
    const secondaryAlbumIds = selectedAlbums.filter(album => album.id !== primaryAlbum?.id).map(album => album.id); 
    
    if (!primaryAlbumId || !secondaryAlbumIds) {
      toast.error('Failed to merge albums')
      return
    }
    setMergeLoading(true);

    return mergeAlbums(primaryAlbumId, secondaryAlbumIds).then(() => {
      onMerge(primaryAlbumId, secondaryAlbumIds)
      clearSelection()
      setOpen(false)
      toast.success('Albums merged successfully')
    }).catch((error) => {
      toast.error(error.message)
    }).finally(() => {
      setOpen(false)
      setMergeLoading(false)
    })
  }

  if (selectedAlbums.length < 2) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={mergeLoading}
          className="text-xs"
        >
          Merge Albums
        </Button>
      </DialogTrigger>
      <DialogContent>
      <DialogHeader>
          <DialogTitle>Merge Albums</DialogTitle>
        </DialogHeader>

        <div>
          <p className='text-sm font-medium'>Choose the primary album</p>
        </div>
        {/* Choose the primary album */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 py-4">
        {selectedAlbums.map((album) => (
          <AlbumThumbnail
            album={album}
            key={album.id}
            selected={primaryAlbum?.id === album.id}
            onSelect={(album) => setPrimaryAlbum(album)}
          // onSelect={(album, isShiftClick) => selectAlbum(album, searchedAlbums, isShiftClick ?? false)}
          />
        ))}
        </div>
        <DialogFooter>
          <Button type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button onClick={handleMergeAlbums}>Merge</Button>
        </DialogFooter>
      
      </DialogContent>
    </Dialog>
  )
}
