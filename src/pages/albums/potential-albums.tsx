import AlbumSelectorDialog from "@/components/albums/AlbumSelectorDialog";
import PotentialAlbumsAssets from "@/components/albums/potential-albums/PotentialAlbumsAssets";
import PotentialAlbumsDates from "@/components/albums/potential-albums/PotentialAlbumsDates";
import PotentialTrips from "@/components/albums/potential-albums/PotentialTrips";
import AssetOffsetDialog from "@/components/assets/assets-options/AssetOffsetDialog";
import PageLayout from "@/components/layouts/PageLayout";
import FloatingBar from "@/components/shared/FloatingBar";
import Header from "@/components/shared/Header";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { useCurrentUser } from "@/contexts/CurrentUserContext";
import PhotoSelectionContext, { IPhotoSelectionContext } from "@/contexts/PhotoSelectionContext";
import { addAssetToAlbum, createAlbum, IPotentialTrip } from "@/handlers/api/album.handler";
import { deleteAssets } from "@/handlers/api/asset.handler";
import { IAlbum, IAlbumCreate } from "@/types/album";
import { useRouter } from "next/router";
import React, { useMemo } from "react";

export default function PotentialAlbums() {
  const { toast } = useToast();
  const { id } = useCurrentUser();

  const { query } = useRouter();
  const { startDate, endDate } = query as { startDate?: string; endDate?: string };

  const [contextState, setContextState] = React.useState<IPhotoSelectionContext>({
    selectedIds: [],
    assets: [],
    config: {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      minAssets: 1,
    },
    updateContext: (newConfig: Partial<IPhotoSelectionContext>) => {
      setContextState(prevState => ({
        ...prevState,
        ...newConfig,
        config: newConfig.config ? { ...prevState.config, ...newConfig.config } : prevState.config
      }));
    }
  });

  const selectedAssets = useMemo(() => contextState.assets.filter((a) => contextState.selectedIds.includes(a.id)), [contextState.assets, contextState.selectedIds]);

  const updateContext = contextState.updateContext;

  const handleSelect = (album: IAlbum) => {
    return addAssetToAlbum(album.id, contextState.selectedIds)
      .then(() => {
        const newAssets = contextState.assets.filter(
          (asset) => !contextState.selectedIds.includes(asset.id)
        );
        updateContext({ selectedIds: [], assets: newAssets });
      })
      .then(() => {
        toast({
          title: `Assets added to ${album.albumName}`,
          description: `${contextState.selectedIds.length} assets added to album`,
        });
      })
      .catch(() => {
        toast({
          title: "Error",
          description: "Failed to add assets album",
          variant: "destructive",
        });
      });
  };

  const handleCreate = (formData: IAlbumCreate) => {
    return createAlbum({
      ...formData,
      assetIds: contextState.selectedIds,
    }).then(() => {
      toast({
        title: "Album created",
        description: "Album created successfully",
      });
      const newAssets = contextState.assets.filter(a => !contextState.selectedIds.includes(a.id));
      updateContext({ selectedIds: [], assets: newAssets });
    }).catch((error) => {
      console.log("Error", error);
    })
  }

  const handleDelete = () => {
    return deleteAssets(contextState.selectedIds)
      .then(() => {
        const newAssets = contextState.assets.filter(a => !contextState.selectedIds.includes(a.id));
        updateContext({ selectedIds: [], assets: newAssets });
      })
      .then(() => {
        toast({
          title: "Assets deleted",
          description: "Assets deleted successfully",
        });
      })
      .catch(() => {
        toast({
          title: "Error",
          description: "Failed to delete assets",
          variant: "destructive",
        });
      });
  }

  const handleOffsetComplete = () => {
    updateContext({
      selectedIds: [],
    });
  }

  return (
    <PageLayout className="!p-0 !mb-0 relative pb-20">
      <Header
        leftComponent="Potential Albums"
        rightComponent={(
          <div className="flex items-center gap-2">
            <Input
              placeholder="Minimum Assets Count"
              type="number"
              defaultValue={contextState.config.minAssets}
              onChange={(e) => {
                if (e.target.value) {
                  const newMinAssets = parseInt(e.target.value);
                  if (!isNaN(newMinAssets)) {
                    updateContext({ config: { ...contextState.config, minAssets: newMinAssets } });
                  }
                }
              }}
            />
          </div>
        )}
      />
      <PhotoSelectionContext.Provider
        value={{
          ...contextState,
          updateContext: updateContext,
        }}
      >
        <div className="flex divide-y">
          <Tabs defaultValue={endDate ? "trips" : "days"} className="min-w-[280px] max-w-[340px] border-r">
            <TabsList className="w-full grid grid-cols-2 rounded-none">
              <TabsTrigger value="days">Days</TabsTrigger>
              <TabsTrigger value="trips">Trips</TabsTrigger>
            </TabsList>
            <TabsContent value="days" className="m-0">
              <PotentialAlbumsDates />
            </TabsContent>
            <TabsContent value="trips" className="m-0">
              <PotentialTrips
                onSelectTrip={(trip: IPotentialTrip) =>
                  updateContext({
                    config: {
                      ...contextState.config,
                      startDate: trip.startDate,
                      endDate: trip.endDate,
                      tripCity: trip.cityName,
                      suggestedAlbumName: trip.suggestedName,
                    },
                  })
                }
              />
            </TabsContent>
          </Tabs>
          <PotentialAlbumsAssets />
        </div>
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
                      updateContext({
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
                      updateContext({
                        selectedIds: contextState.assets.map((a) => a.id),
                      })
                    }
                  >
                    Select all
                  </Button>
                )}
                <AlbumSelectorDialog
                  onSelected={handleSelect}
                  onSubmit={handleCreate}
                  defaultName={contextState.config.suggestedAlbumName}
                />
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
      </PhotoSelectionContext.Provider>
    </PageLayout>
  );
}
