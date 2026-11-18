import PageLayout from '@/components/layouts/PageLayout'
import Header from '@/components/shared/Header'
import Loader from '@/components/ui/loader'
import { useConfig } from '@/contexts/ConfigContext'
import { getAlbumInfo } from '@/handlers/api/album.handler'
import { deleteAssets, updateAssets } from '@/handlers/api/asset.handler'
import { IAlbum, IAlbumPerson } from '@/types/album'
import Link from 'next/link'
import React, { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/router'
import AlbumPeople, { IAlbumPeopleRef } from '@/components/albums/info/AlbumPeople'
import AlbumImages from '@/components/albums/info/AlbumImages'
import { Camera, ExternalLink, Users } from 'lucide-react'
import { humanizeNumber } from '@/helpers/string.helper'
import PhotoSelectionContext, { IPhotoSelectionContext } from '@/contexts/PhotoSelectionContext'
import FloatingBar from '@/components/shared/FloatingBar'
import { Button } from '@/components/ui/button'
import { AlertDialog } from '@/components/ui/alert-dialog'
import AssetOffsetDialog from '@/components/assets/assets-options/AssetOffsetDialog'
import { Input } from '@/components/ui/input'
import AlbumPersonNameBar from '@/components/albums/info/AlbumPersonNameBar'
import { toast } from "sonner";

export default function AlbumListPage() {
  const { exImmichUrl } = useConfig()
  const router = useRouter()
  const { pathname } = router
  const { albumId, faceId } = router.query as { albumId: string, faceId: string }
  const [albumInfo, setAlbumInfo] = useState<IAlbum>()
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedPerson, setSelectedPerson] = useState<IAlbumPerson | null>(null)
  const albumPeopleRef = useRef<IAlbumPeopleRef>(null)

  // PhotoSelection context state
  const [contextState, setContextState] = useState<IPhotoSelectionContext>({
    selectedIds: [],
    assets: [],
    config: {
      albumId: albumId,
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

  const fetchAlbumInfo = async () => {
    setLoading(true)
    getAlbumInfo(albumId)
      .then(setAlbumInfo)
      .catch((error) => {
        setErrorMessage(error.message)
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchAlbumInfo()

  }, [])
  // Update context albumId when router albumId changes
  useEffect(() => {
    contextState.updateContext({
      config: { ...contextState.config, albumId: albumId }
    });
  }, [albumId]);

  const handleSelectPerson = (person: IAlbumPerson) => {
    setSelectedPerson(person)
    if (faceId === person.id) {
      router.push({
        pathname,
        query: {
          albumId
        }
      })
    } else {
      router.push({
        pathname,
        query: {
          albumId,
          faceId: person.id
        }
      })
    }
  }

  const handleUpdatePerson = (person: IAlbumPerson | null) => {
    setSelectedPerson(person)
    if (person) {
      albumPeopleRef.current?.updatePerson(person)
    }
  }

  const handleMergePerson = (oldPerson: IAlbumPerson, newPerson: IAlbumPerson) => {
    setSelectedPerson(newPerson)
    albumPeopleRef.current?.mergePerson(oldPerson, newPerson)
  }

  const handleDelete = () => {
    const count = contextState.selectedIds.length;
    return deleteAssets(contextState.selectedIds).then(() => {
      const newAssets = contextState.assets.filter((a) => !contextState.selectedIds.includes(a.id));
      toast.success(`Deleted ${count} asset(s)`);
      contextState.updateContext({
        selectedIds: [],
        assets: newAssets,
      });
    })
  }

  const handleOffsetComplete = () => {
    contextState.updateContext({
      selectedIds: [],
    });
  }

  const renderContent = () => {
    if (loading) {
      return <Loader />
    }
    else if (errorMessage) {
      return <div>{errorMessage}</div>
    }
    return (
      <div className="flex divide-y">
        {albumInfo && (
          <>
            <AlbumPeople ref={albumPeopleRef} album={albumInfo} key={albumInfo.id} onSelect={handleSelectPerson} />
            <AlbumImages album={albumInfo} key={albumInfo.id} selectedPerson={selectedPerson} />
          </>
        )}
      </div>
    )
  }

  return (
    <PageLayout className="!p-0 !mb-0 relative pb-20">
      <Header
        leftComponent={albumInfo?.albumName || "Loading..."}
        rightComponent={
          !loading && (
            <div className="flex items-center gap-2">
              <p className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-500">
                {humanizeNumber(albumInfo?.assetCount || 0)}
                {' '}
                <Camera className="w-4 h-4" />
              </p>
              <p className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-500">
                {humanizeNumber(albumInfo?.faceCount || 0)}
                {' '}
                <Users className="w-4 h-4" />
              </p>
              <Link
                className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-500"
                target="_blank"
                href={`${exImmichUrl}/albums/${albumId}`}>
                <ExternalLink className="w-4 h-4" />
                Open In Immich
              </Link> 
            </div>
          )
        }
      />
      <PhotoSelectionContext.Provider
        value={{
          ...contextState,
          updateContext: contextState.updateContext,
        }}
      >
        {renderContent()}
        {selectedAssets.length > 0 &&
          <FloatingBar>
            <div className="flex items-center gap-2 justify-between w-full">
              <p className="text-sm text-muted-foreground">
                {contextState.selectedIds.length} Selected
              </p>
              <div className="flex items-center gap-2">
                {contextState.selectedIds.length === contextState.assets.length ? (
                  <Button
                    variant={"outline"}
                    size={"sm"}
                    onClick={() =>
                      contextState.updateContext({
                        selectedIds: [],
                      })
                    }
                  >
                    Unselect all
                  </Button>
                ) : (
                  <Button
                    variant={"outline"}
                    size={"sm"}
                    onClick={() =>
                      contextState.updateContext({
                        selectedIds: contextState.assets.map((a) => a.id),
                      })
                    }
                  >
                    Select all
                  </Button>
                )}
                <AssetOffsetDialog assets={selectedAssets} onComplete={handleOffsetComplete} />
                <div className="h-[10px] w-[1px] bg-zinc-500 dark:bg-zinc-600"></div>
                <AlertDialog
                  title="Delete the selected assets?"
                  description="This action will delete the selected assets and cannot be undone."
                  onConfirm={handleDelete}
                  disabled={contextState.selectedIds.length === 0}
                >
                  <Button variant={"destructive"} size={"sm"} disabled={contextState.selectedIds.length === 0}>
                    Delete
                  </Button>
                </AlertDialog>
              </div>
            </div>
          </FloatingBar>
        }

        {!selectedAssets.length && faceId && !selectedPerson?.name && (
          <AlbumPersonNameBar selectedPerson={selectedPerson} faceId={faceId} onUpdate={handleUpdatePerson} onMerge={handleMergePerson} />
        )}
      </PhotoSelectionContext.Provider>
    </PageLayout>
  )
}
