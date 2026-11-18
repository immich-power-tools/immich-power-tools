import PageLayout from '@/components/layouts/PageLayout'
import Header from '@/components/shared/Header'
import Loader from '@/components/ui/loader'
import { useConfig } from '@/contexts/ConfigContext'
import { deleteAlbums, listAlbums } from '@/handlers/api/album.handler'
import { IAlbum } from '@/types/album'
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import AlbumThumbnail from '@/components/albums/list/AlbumThumbnail'
import { Button } from '@/components/ui/button'
import { Select, SelectItem, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRouter } from 'next/router'
import { Share, SortAsc, SortDesc, Trash, Grid3X3, Table as TableIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import AlbumShareDialog, { IAlbumShareDialogRef } from '@/components/albums/share/AlbumShareDialog'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { toast } from "sonner";
import FloatingBar from '@/components/shared/FloatingBar'
import DataTable, { DataTableRef } from '@/components/ui/data-table'
import { albumColumns } from '@/components/albums/AlbumTableColumns'
import MergeAlbumDialog from '@/components/albums/MergeAlbumDialog'
import { AlbumSelectionProvider, useAlbumSelection } from '@/contexts/AlbumSelectionContext'

const SORT_BY_OPTIONS = [
  { value: 'lastPhotoDate', label: 'Last Photo Date' },
  { value: 'firstPhotoDate', label: 'First Photo Date' },
  { value: 'assetCount', label: 'Asset Count' },
  { value: 'createdAt', label: 'Created At' },
  { value: 'updatedAt', label: 'Updated At' },
  { value: 'albumName', label: 'Album Name' },
  { value: 'albumSize', label: 'Album Size' },
  { value: 'faceCount', label: 'Number of People' },
]

const AlbumList = () => {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const { query, pathname } = router
  const { sortBy, sortOrder } = query as { sortBy: string, sortOrder: string }
  const [albums, setAlbums] = useState<IAlbum[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const albumShareDialogRef = useRef<IAlbumShareDialogRef>(null);
  const [deleting, setDeleting] = useState(false)

  const dataTableRef = useRef<DataTableRef<IAlbum>>(null)
  
  // Separate selection state for table view
  const [tableSelectedIds, setTableSelectedIds] = useState<string[]>([])

  const selectedSortBy = useMemo(() => SORT_BY_OPTIONS.find((option) => option.value === sortBy), [sortBy])

  const searchedAlbums = useMemo(() => albums.filter((album) => album.albumName.toLowerCase().includes(search.toLowerCase())), [albums, search])

  const {
    selectedAlbums,     
    selectAlbum,
    selectAll,
    clearSelection,
  } = useAlbumSelection()

  // Use appropriate selection state based on view mode
  const currentSelectedIds = viewMode === 'table' ? tableSelectedIds : selectedAlbums.map(album => album.id)
  const currentSelectedCount = currentSelectedIds.length

  const fetchAlbums = async () => {
    setLoading(true)
    listAlbums({
      sortBy,
      sortOrder
    })
      .then(setAlbums)
      .catch((error) => {
        setErrorMessage(error.message)
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchAlbums()
  }, [sortBy, sortOrder])

  const handleDeleteAlbums = async () => {
    setDeleting(true)
    return deleteAlbums(currentSelectedIds).then(() => {
      if (viewMode === 'table') {
        setTableSelectedIds([])
      } else {
        clearSelection()
      }
      setAlbums(albums.filter((album) => !currentSelectedIds.includes(album.id)))
      toast.success(`Deleted ${currentSelectedCount} albums`)
    }).catch((error) => {
      toast.error(error.message)
    }).finally(() => {
      setDeleting(false)
    })
  }

  const handleMergeAlbums = async (primaryAlbumId: string, secondaryAlbumIds: string[]  ) => {
    setAlbums(albums.filter((album) => !secondaryAlbumIds.includes(album.id) && album.id !== primaryAlbumId))
    toast.success(`Merged ${secondaryAlbumIds.length} albums`)
  }

  const handleTableSelectionChange = useCallback((selectedRowIds: string[]) => {
    setTableSelectedIds(selectedRowIds)
  }, [])

  const handleSelectAll = () => {
    if (viewMode === 'table') {
      setTableSelectedIds(searchedAlbums.map(album => album.id))
    } else {
      selectAll(searchedAlbums)
    }
  }

  const handleClearSelection = () => {
    if (viewMode === 'table') {
      setTableSelectedIds([])
    } else {
      clearSelection()
    }
  }

  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClearSelection()
    }
  }

  useEffect(() => {
    // Escape to clear selection
  
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

  const isAllSelectedCurrent = searchedAlbums.length > 0 && currentSelectedCount === searchedAlbums.length
  const isPartiallySelectedCurrent = currentSelectedCount > 0 && currentSelectedCount < searchedAlbums.length

  const renderContent = () => {
    if (loading) {
      return <Loader />
    }
    else if (errorMessage) {
      return <div>{errorMessage}</div>
    }
    
    if (viewMode === 'table') {
      return (
        <div className="p-4">
          <DataTable
            columns={albumColumns}
            data={searchedAlbums}
            onRowSelectionChange={handleTableSelectionChange}
            getRowId={(row) => row.id}
            searchValue={search}
            onSearchChange={setSearch}
            ref={dataTableRef}
          />
        </div>
      )
    }
    
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 p-4">
        {searchedAlbums.map((album) => (
          <AlbumThumbnail
            album={album}
            key={album.id}
            selected={selectedAlbums.some(selectedAlbum => selectedAlbum.id === album.id)}
            onSelect={(album, isShiftClick) => selectAlbum(album, searchedAlbums, isShiftClick ?? false)}
          />
        ))}
      </div>
    )
  }
  
  return (
    <PageLayout className="!p-0 !mb-0 relative pb-20">
      <Header
        leftComponent={
          <div className="flex items-center gap-2">
            <span>Manage Albums</span>
            {currentSelectedCount > 0 && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                ({currentSelectedCount} selected)
              </span>
            )}
          </div>
        }
        rightComponent={
          <div className="flex items-center gap-2">
            <Input type="text" placeholder="Search" className="w-48" onChange={(e) => setSearch(e.target.value)} />
            
            <div className="flex items-center border rounded-md">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="rounded-r-none"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('table')}
                className="rounded-l-none"
              >
                <TableIcon className="h-4 w-4" />
              </Button>
            </div>
            

            <Select
              defaultValue={selectedSortBy?.value}
              onValueChange={(value) => router.push({
                pathname,
                query: {
                  ...query,
                  sortBy: value,
                }

              })}>
              <SelectTrigger className="px-2">
                <SelectValue placeholder="Sort by">{selectedSortBy?.label || 'Sort by'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SORT_BY_OPTIONS.map((option) => (
                  <SelectItem value={option.value} key={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="px-2" variant={"secondary"} onClick={() => router.push({
              pathname,
              query: {
                ...query,
                sortOrder: sortOrder === 'asc' ? 'desc' : 'asc',
              }
            })}>
              {sortOrder === 'asc' ? <SortAsc /> : <SortDesc />}
            </Button>
          </div>
        }
      />
      {renderContent()}
      {currentSelectedCount > 0 && (
        <FloatingBar>
          <div className="flex items-center gap-2 justify-between w-full">
            <p className="text-sm text-muted-foreground">
              {currentSelectedCount} Selected
            </p>
            <div className="flex items-center gap-2">
              <MergeAlbumDialog 
                onMerge={handleMergeAlbums}
              />

              {isAllSelectedCurrent ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearSelection}
                  className="text-xs"
                >
                  Clear Selection
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  className="text-xs"
                >
                  Select All
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                className="flex items-center gap-2"
                onClick={() => {
                  albumShareDialogRef.current?.open(selectedAlbums as IAlbum[])
                }}>
                <Share size={16} /> Share
              </Button>
              <div className="h-[10px] w-[1px] bg-zinc-500 dark:bg-zinc-600"></div>
              <AlertDialog
                title='Delete Albums'
                description='Are you sure you want to delete these albums?'
                onConfirm={handleDeleteAlbums}
              >
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex items-center gap-2"
                  disabled={deleting}
                >
                  <Trash size={16} /> {deleting ? "Deleting..." : "Delete"}
                </Button>
              </AlertDialog>
            </div>
          </div>
        </FloatingBar>
      )}
      <AlbumShareDialog
        ref={albumShareDialogRef}
      />
    </PageLayout>
  )
}

export default function AlbumListPage() {
  return (
    <AlbumSelectionProvider>
      <AlbumList />
    </AlbumSelectionProvider>
  )
}
