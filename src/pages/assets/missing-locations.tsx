import MissingLocationAssets from "@/components/assets/missing-location/MissingLocationAssets";
import MissingLocationDates from "@/components/assets/missing-location/MissingLocationDates";
import TagMissingLocationDialog from "@/components/assets/missing-location/TagMissingLocationDialog/TagMissingLocationDialog";
import PageLayout from "@/components/layouts/PageLayout";
import Header from "@/components/shared/Header";
import { Button } from "@/components/ui/button";
import PhotoSelectionContext, { IPhotoSelectionContext, IPhotoSelectionConfig } from "@/contexts/PhotoSelectionContext";
import { deleteAssets, updateAssets } from "@/handlers/api/asset.handler";

import { IPlace } from "@/types/common";
import { SortDesc, SortAsc } from "lucide-react";
import { isSameDay } from "date-fns";
import { useRouter } from "next/router";
import React, { useMemo } from "react";
import FloatingBar from "@/components/shared/FloatingBar";
import { Select, SelectValue, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";
import { AlertDialog } from "@/components/ui/alert-dialog";
import AssetOffsetDialog from "@/components/assets/assets-options/AssetOffsetDialog";
import { toast } from "sonner";

export default function MissingLocations() {
  const { query, push } = useRouter();
  const { startDate, groupBy = "date", albumId } = query as { startDate: string, groupBy: string, albumId: string };

  const [contextState, setContextState] = React.useState<IPhotoSelectionContext>({
    selectedIds: [],
    assets: [],
    config: {
      startDate: startDate || undefined,
      albumId: albumId || undefined,
      sort: "fileOriginalDate",
      sortOrder: "asc",
      dates: []
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

  const handleSubmit = async (place: IPlace) => {
    await updateAssets({
      ids: contextState.selectedIds,
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
    });

    const newAssets = contextState.assets.filter(asset => !contextState.selectedIds.includes(asset.id));
    let newDates = [...contextState.config.dates || []];

    if (contextState.config.startDate) {
      const dayRecordIndex = newDates.findIndex(f => isSameDay(new Date(f.value), new Date(contextState.config.startDate!)));

      if (dayRecordIndex !== -1) {
        if (newAssets.length > 0) {
          newDates[dayRecordIndex] = { ...newDates[dayRecordIndex], asset_count: newAssets.length };
        }
        else {
          newDates.splice(dayRecordIndex, 1);
        }
      }
    }

    contextState.updateContext({
      selectedIds: [],
      assets: newAssets,
      config: { ...contextState.config, dates: newDates }
    });
  };

  const handleDelete = () => {
    const count = contextState.selectedIds.length;
    return deleteAssets(contextState.selectedIds).then(() => {
      const newAssets = contextState.assets.filter((a) => !contextState.selectedIds.includes(a.id));
      toast.success(`Deleted ${count} asset(s)`);
      let newDates = [...contextState.config.dates || []];

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
  const handleChange = (e: { sortOrder: "asc" | "desc" }) => {
    contextState.updateContext({ config: { ...contextState.config, sortOrder: e.sortOrder } });
  }

  return (
    <PageLayout className="!p-0 !mb-0 relative pb-20">
      <Header
        leftComponent="Missing Location"
        rightComponent={
          <div className="flex items-center gap-2">
            <Select value={groupBy} onValueChange={(value) => {
              contextState.updateContext({ config: { startDate: undefined, albumId: undefined } });
              push({
                pathname: "/assets/missing-locations",
                query: {
                  ...query,
                  groupBy: value,
                  startDate: undefined,
                  albumId: undefined,
                },
              });
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Group by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="album">Album</SelectItem>
                <SelectItem value="date">Date</SelectItem>
              </SelectContent>
            </Select>
            <div>
              <Button variant="default" size="sm" onClick={() => handleChange({ sortOrder: contextState.config.sortOrder === "asc" ? "desc" : "asc" })}>
                {contextState.config.sortOrder === "asc" ? <SortAsc size={16} /> : <SortDesc size={16} />}
              </Button>
            </div>
          </div>
        }
      />
      <PhotoSelectionContext.Provider
        value={{
          ...contextState,
          updateContext: contextState.updateContext,
        }}
      >
        <div className="flex divide-y">
          <MissingLocationDates groupBy={groupBy as "date" | "album"} />
          <MissingLocationAssets groupBy={groupBy as "date" | "album"} />
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
                <TagMissingLocationDialog onSubmit={handleSubmit} />
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
