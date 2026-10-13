import PageLayout from '@/components/layouts/PageLayout'
import Header from '@/components/shared/Header'
import Loader from '@/components/ui/loader'
import { listOrphanAssets, deleteAssets, IOrphanFilters } from '@/handlers/api/asset.handler'
import { addAssetToAlbum, createAlbumWithAssets } from '@/handlers/api/album.handler'
import { IAsset } from '@/types/asset'
import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { Camera, Trash2, Trash, Search } from 'lucide-react'
import { humanizeNumber } from '@/helpers/string.helper'
import PhotoSelectionContext, { IPhotoSelectionContext } from '@/contexts/PhotoSelectionContext'
import FloatingBar from '@/components/shared/FloatingBar'
import { Button } from '@/components/ui/button'
import { AlertDialog } from '@/components/ui/alert-dialog'
import AssetGrid from '@/components/shared/AssetGrid'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import AlbumSelectorDialog from '@/components/albums/AlbumSelectorDialog'
import { IAlbum } from '@/types/album'
import { toast } from "sonner";

export default function OrphanFinderPage() {
  const [assets, setAssets] = useState<IAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [filters, setFilters] = useState<IOrphanFilters>({
    notInAlbum: true,
    noPeople: false,
    noLocation: false,
    notFavorited: false,
    type: 'ALL',
    limit: 200,
    page: 1,
  })

  const [contextState, setContextState] = useState<IPhotoSelectionContext>({
    selectedIds: [],
    assets: [],
    config: {
      albumId: '',
      sort: "fileOriginalDate",
      sortOrder: "asc"
    },
    updateContext: (newConfig: Partial<IPhotoSelectionContext>) => {
      setContextState(prevState => ({
        ...prevState,
        ...newConfig,
        config: newConfig.config ? { ...prevState.config, ...newConfig.config } : prevState.config
      }));
    }
  });

  const selectedAssets = useMemo(() =>
    contextState.assets.filter((a) => contextState.selectedIds.includes(a.id)),
    [contextState.assets, contextState.selectedIds]
  );

  const hasActiveFilter = filters.notInAlbum || filters.noPeople || filters.noLocation || filters.notFavorited;

  const fetchOrphans = useCallback(async () => {
    if (!hasActiveFilter) return;
    setLoading(true)
    setErrorMessage('')
    listOrphanAssets(filters)
      .then((fetchedAssets) => {
        setAssets(fetchedAssets)
        contextState.updateContext({ assets: fetchedAssets, selectedIds: [] })
      })
      .catch((error) => {
        setErrorMessage(error.message || 'Failed to load orphan assets')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [filters, hasActiveFilter])

  useEffect(() => {
    fetchOrphans()
  }, [fetchOrphans])

  const handleDelete = () => {
    const count = contextState.selectedIds.length;
    return deleteAssets(contextState.selectedIds, { force: true }).then(() => {
      const newAssets = contextState.assets.filter((a) => !contextState.selectedIds.includes(a.id));
      toast.success(`Deleted ${count} asset(s)`);
      setAssets(newAssets)
      contextState.updateContext({ selectedIds: [], assets: newAssets });
    })
  }

  const handleTrash = () => {
    const count = contextState.selectedIds.length;
    return deleteAssets(contextState.selectedIds, { force: false }).then(() => {
      const newAssets = contextState.assets.filter((a) => !contextState.selectedIds.includes(a.id));
      toast.success(`Moved ${count} asset(s) to trash`);
      setAssets(newAssets)
      contextState.updateContext({ selectedIds: [], assets: newAssets });
    })
  }

  const handleAddToAlbum = async (album: IAlbum) => {
    try {
      await addAssetToAlbum(album.id, contextState.selectedIds);
    } catch {
      toast.error(`Failed to add assets to "${album.albumName}"`);
      return;
    }
    toast.success(`Added ${contextState.selectedIds.length} asset(s) to "${album.albumName}"`);
    if (filters.notInAlbum) {
      fetchOrphans();
    }
  }

  const handleCreateAlbumWithAssets = async (data: { albumName: string }) => {
    return createAlbumWithAssets(data.albumName, contextState.selectedIds).then(() => {
      toast.success(`Album "${data.albumName}" created with ${contextState.selectedIds.length} asset(s)`);
      if (filters.notInAlbum) {
        fetchOrphans();
      }
    }).catch(() => {
      toast.error("Failed to create album");
    });
  }

  const handleFilterToggle = (key: keyof IOrphanFilters) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key], page: 1 }));
  }

  const renderContent = () => {
    if (!hasActiveFilter) {
      return (
        <div className="text-center py-8 text-gray-500">
          Select at least one filter to find orphan assets.
        </div>
      );
    }
    if (loading) return <div className="flex items-center justify-center py-12"><Loader /></div>
    if (errorMessage) return <div className="text-red-500 p-4">{errorMessage}</div>
    return (
      <div className="p-4">
        {assets.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Search size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No orphan assets found</h3>
            <p>All your assets are well-organized with the current filters.</p>
          </div>
        ) : (
          <AssetGrid
            assets={assets}
            selectable={true}
            onSelectionChange={(ids) => contextState.updateContext({ selectedIds: ids })}
          />
        )}
      </div>
    )
  }

  return (
    <PageLayout className="!p-0 !mb-0 relative pb-20">
      <Header
        leftComponent="Orphan Finder"
        rightComponent={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id="notInAlbum"
                  checked={filters.notInAlbum}
                  onCheckedChange={() => handleFilterToggle('notInAlbum')}
                />
                <Label htmlFor="notInAlbum" className="text-sm cursor-pointer">No Album</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id="noPeople"
                  checked={filters.noPeople}
                  onCheckedChange={() => handleFilterToggle('noPeople')}
                />
                <Label htmlFor="noPeople" className="text-sm cursor-pointer">No People</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id="noLocation"
                  checked={filters.noLocation}
                  onCheckedChange={() => handleFilterToggle('noLocation')}
                />
                <Label htmlFor="noLocation" className="text-sm cursor-pointer">No Location</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id="notFavorited"
                  checked={filters.notFavorited}
                  onCheckedChange={() => handleFilterToggle('notFavorited')}
                />
                <Label htmlFor="notFavorited" className="text-sm cursor-pointer">Not Favorited</Label>
              </div>
            </div>
            <Select
              value={filters.type}
              onValueChange={(value) => setFilters(prev => ({ ...prev, type: value, page: 1 }))}
            >
              <SelectTrigger className="w-28 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="IMAGE">Images</SelectItem>
                <SelectItem value="VIDEO">Videos</SelectItem>
              </SelectContent>
            </Select>
            {!loading && assets.length > 0 && (
              <div className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-500">
                {humanizeNumber(assets.length)}
                <Camera className="w-4 h-4" />
              </div>
            )}
          </div>
        }
      />
      <PhotoSelectionContext.Provider value={{ ...contextState, updateContext: contextState.updateContext }}>
        {renderContent()}
        {selectedAssets.length > 0 && (
          <FloatingBar>
            <div className="flex items-center gap-2 justify-between w-full">
              <p className="text-sm text-muted-foreground">
                {contextState.selectedIds.length} Selected
              </p>
              <div className="flex items-center gap-2">
                {contextState.selectedIds.length === contextState.assets.length ? (
                  <Button variant="outline" size="sm" onClick={() => contextState.updateContext({ selectedIds: [] })}>
                    Unselect all
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => contextState.updateContext({ selectedIds: contextState.assets.map((a) => a.id) })}>
                    Select all
                  </Button>
                )}
                <div className="h-[10px] w-[1px] bg-zinc-500 dark:bg-zinc-600" />
                <AlbumSelectorDialog
                  onSelected={handleAddToAlbum}
                  onSubmit={handleCreateAlbumWithAssets}
                />
                <div className="h-[10px] w-[1px] bg-zinc-500 dark:bg-zinc-600" />
                <AlertDialog
                  title="Move selected assets to Trash?"
                  description="This action will move the selected assets to trash. You can restore them later."
                  onConfirm={handleTrash}
                  disabled={contextState.selectedIds.length === 0}
                >
                  <Button variant="outline" size="sm" disabled={contextState.selectedIds.length === 0}>
                    <Trash className="w-4 h-4 mr-2" />
                    Trash
                  </Button>
                </AlertDialog>
                <AlertDialog
                  title="Delete the selected assets?"
                  description="This action will delete the selected assets and cannot be undone."
                  onConfirm={handleDelete}
                  disabled={contextState.selectedIds.length === 0}
                >
                  <Button variant="destructive" size="sm" disabled={contextState.selectedIds.length === 0}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </AlertDialog>
              </div>
            </div>
          </FloatingBar>
        )}
      </PhotoSelectionContext.Provider>
    </PageLayout>
  )
}
