import PageLayout from "@/components/layouts/PageLayout";
import AssetGrid from "@/components/shared/AssetGrid";
import FloatingBar from "@/components/shared/FloatingBar";
import Header from "@/components/shared/Header";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import DataTable, { DataTableRef } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import LazyImage from "@/components/ui/lazy-image";
import Loader from "@/components/ui/loader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import PhotoSelectionContext, { IPhotoSelectionContext } from "@/contexts/PhotoSelectionContext";
import {
  IMissingOriginalAsset,
  IMissingOriginalsScanResponse,
  scanMissingOriginals,
  trashMissingOriginals,
} from "@/handlers/api/asset.handler";
import { formatDate } from "@/helpers/date.helper";
import { humanizeNumber } from "@/helpers/string.helper";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Download, FileWarning, Grid3X3, Image, RefreshCw, Search, Table, Trash, Video, X } from "lucide-react";
import dynamic from "next/dynamic";
import React, { useCallback, useMemo, useRef, useState } from "react";

type MissingOriginalsViewMode = "grid" | "list";
type MissingOriginalsTypeFilter = "all" | "images" | "videos";

const AssetInfoPanel = dynamic(() => import("@/components/asset-info/AssetInfoPanel"), { ssr: false });

const toCsvValue = (value: string | number | Date | null | undefined) => {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

const getMissingOriginalLocation = (asset: IMissingOriginalAsset) => {
  return [asset.city, asset.state, asset.country].filter(Boolean).join(", ");
};

const getMissingOriginalDate = (asset: IMissingOriginalAsset) => {
  return asset.dateTimeOriginal || asset.localDateTime;
};

const formatAssetDate = (asset: IMissingOriginalAsset) => {
  const date = getMissingOriginalDate(asset);
  if (!date) {
    return "";
  }

  const parsed = date instanceof Date ? date : new Date(date);
  return Number.isNaN(parsed.getTime()) ? "" : formatDate(parsed.toISOString(), "MMM d, yyyy h:mm a");
};

const getAssetTypeLabel = (type: string) => {
  const normalized = type.toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const assetMatchesTypeFilter = (asset: IMissingOriginalAsset, typeFilter: MissingOriginalsTypeFilter) => {
  const normalizedType = asset.type.toLowerCase();

  if (typeFilter === "images") {
    return normalizedType.includes("image");
  }

  if (typeFilter === "videos") {
    return normalizedType.includes("video");
  }

  return true;
};

const assetMatchesSearch = (asset: IMissingOriginalAsset, search: string) => {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  const searchableText = [
    asset.originalFileName,
    asset.originalPath,
    asset.mappedPath,
    asset.type,
    formatAssetDate(asset),
    getMissingOriginalLocation(asset),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchableText.includes(normalizedSearch);
};

const downloadCsv = (assets: IMissingOriginalAsset[]) => {
  const header = ["id", "originalFileName", "type", "date", "location", "originalPath", "mappedPath"];
  const rows = assets.map((asset) => [
    asset.id,
    asset.originalFileName,
    asset.type,
    formatAssetDate(asset),
    getMissingOriginalLocation(asset),
    asset.originalPath,
    asset.mappedPath,
  ]);
  const csv = [header, ...rows].map((row) => row.map(toCsvValue).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "immich-missing-originals.csv";
  link.click();
  URL.revokeObjectURL(url);
};

export default function MissingOriginalsPage() {
  const [scanResult, setScanResult] = useState<IMissingOriginalsScanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [viewMode, setViewMode] = useState<MissingOriginalsViewMode>("grid");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<MissingOriginalsTypeFilter>("all");
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null);
  const dataTableRef = useRef<DataTableRef<IMissingOriginalAsset>>(null);

  const [contextState, setContextState] = useState<IPhotoSelectionContext>({
    selectedIds: [],
    assets: [],
    config: {
      albumId: "",
      sort: "fileOriginalDate",
      sortOrder: "asc",
    },
    updateContext: (newConfig: Partial<IPhotoSelectionContext>) => {
      setContextState((prevState: IPhotoSelectionContext) => ({
        ...prevState,
        ...newConfig,
        config: newConfig.config ? { ...prevState.config, ...newConfig.config } : prevState.config,
      }));
    },
  });

  const missingAssets = scanResult?.missing ?? [];
  const detailAsset = useMemo(
    () => missingAssets.find((asset: IMissingOriginalAsset) => asset.id === detailAssetId) ?? null,
    [detailAssetId, missingAssets]
  );
  const filteredMissingAssets = useMemo(
    () =>
      missingAssets.filter(
        (asset: IMissingOriginalAsset) =>
          assetMatchesTypeFilter(asset, typeFilter) && assetMatchesSearch(asset, search)
      ),
    [missingAssets, search, typeFilter]
  );
  const selectedAssets = useMemo(
    () => missingAssets.filter((asset: IMissingOriginalAsset) => contextState.selectedIds.includes(asset.id)),
    [missingAssets, contextState.selectedIds]
  );
  const missingOriginalColumns = useMemo<ColumnDef<IMissingOriginalAsset>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "thumbnail",
        header: "Thumbnail",
        cell: ({ row }) => {
          const asset = row.original;
          return (
            <div className="h-12 w-12 overflow-hidden rounded border border-gray10 bg-gray-100 dark:border-gray7 dark:bg-gray-800">
              <LazyImage
                src={asset.url}
                alt={asset.originalFileName}
                width={48}
                height={48}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: "originalFileName",
        header: ({ column }) => (
          <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Filename
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="flex max-w-[260px] items-center gap-2">
            <div className="truncate font-medium" title={row.original.originalFileName}>
              {row.original.originalFileName}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 p-0"
              title="View details"
              aria-label={`View details for ${row.original.originalFileName}`}
              onClick={() => setDetailAssetId(row.original.id)}
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
      {
        id: "date",
        accessorFn: (asset) => {
          const date = getMissingOriginalDate(asset);
          const parsed = date instanceof Date ? date : new Date(date);
          return parsed.getTime() || 0;
        },
        header: ({ column }) => (
          <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Date
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => <div className="whitespace-nowrap">{formatAssetDate(row.original) || "Unknown"}</div>,
      },
      {
        accessorKey: "type",
        header: ({ column }) => (
          <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Type
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const asset = row.original;
          const normalizedType = asset.type.toLowerCase();
          const Icon = normalizedType.includes("video") ? Video : Image;
          return (
            <div className="flex items-center gap-2 whitespace-nowrap">
              <Icon className="h-4 w-4 text-muted-foreground" />
              {getAssetTypeLabel(asset.type)}
            </div>
          );
        },
      },
      {
        id: "location",
        accessorFn: (asset) => getMissingOriginalLocation(asset),
        header: ({ column }) => (
          <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Location
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const location = getMissingOriginalLocation(row.original);
          return <div className="max-w-[180px] truncate">{location || "Unknown"}</div>;
        },
      },
      {
        id: "path",
        accessorFn: (asset) => asset.mappedPath || asset.originalPath,
        header: ({ column }) => (
          <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Path
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const asset = row.original;
          return (
            <div className="max-w-[420px]">
              <div className="truncate font-mono text-xs" title={asset.mappedPath || asset.originalPath}>
                {asset.mappedPath || asset.originalPath}
              </div>
            </div>
          );
        },
      },
    ],
    []
  );

  const runScan = async () => {
    setLoading(true);
    setErrorMessage("");
    setDetailAssetId(null);

    try {
      const result = await scanMissingOriginals();
      setScanResult(result);
      contextState.updateContext({ assets: result.missing, selectedIds: [] });
      dataTableRef.current?.clearSelection();
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to scan missing originals");
    } finally {
      setLoading(false);
    }
  };

  const removeTrashedAssets = (ids: string[]) => {
    const idSet = new Set(ids);
    const remaining = missingAssets.filter((asset: IMissingOriginalAsset) => !idSet.has(asset.id));

    if (scanResult) {
      const missingPercent = scanResult.totalChecked === 0 ? 0 : (remaining.length / scanResult.totalChecked) * 100;
      const safetyPercent = scanResult.totalEligibleAssets === 0 ? 0 : (remaining.length / scanResult.totalEligibleAssets) * 100;

      setScanResult({
        ...scanResult,
        missing: remaining,
        missingCount: remaining.length,
        missingPercent,
        safetyPercent,
        unsafeToTrash: safetyPercent > scanResult.maxMissingPercent,
      });
    }

    contextState.updateContext({ assets: remaining, selectedIds: [] });
    dataTableRef.current?.clearSelection();
    setDetailAssetId((currentId) => (currentId && idSet.has(currentId) ? null : currentId));
  };

  const trashAssets = async (ids: string[]) => {
    const result = await trashMissingOriginals(ids);
    removeTrashedAssets(result.ids);
    toast({
      title: "Moved to Trash",
      description: `${result.trashedCount} missing asset record(s) were moved to Immich Trash.`,
    });
  };

  const handleTableSelectionChange = useCallback((selectedIds: string[]) => {
    setContextState((prevState: IPhotoSelectionContext) => ({
      ...prevState,
      selectedIds,
    }));
  }, []);

  const handleSelectAll = () => {
    const selectedIds = missingAssets.map((asset: IMissingOriginalAsset) => asset.id);
    contextState.updateContext({ selectedIds });
    dataTableRef.current?.selectRows(selectedIds);
  };

  const handleClearSelection = () => {
    contextState.updateContext({ selectedIds: [] });
    dataTableRef.current?.clearSelection();
  };

  const renderSummary = () => {
    if (!scanResult) {
      return (
        <div className="p-6 text-center text-gray-500">
          <FileWarning className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <p>Run a dry scan to find active asset records whose original files are missing from disk.</p>
        </div>
      );
    }

    return (
      <div className="grid gap-3 p-4 md:grid-cols-4">
        <div className="border border-gray10 p-3 dark:border-gray7">
          <p className="text-xs text-gray-500">Checked</p>
          <p className="text-lg font-semibold">{humanizeNumber(scanResult.totalChecked)}</p>
        </div>
        <div className="border border-gray10 p-3 dark:border-gray7">
          <p className="text-xs text-gray-500">Missing</p>
          <p className="text-lg font-semibold">{humanizeNumber(scanResult.missingCount)}</p>
        </div>
        <div className="border border-gray10 p-3 dark:border-gray7">
          <p className="text-xs text-gray-500">Missing Percent</p>
          <p className="text-lg font-semibold">{scanResult.missingPercent.toFixed(2)}%</p>
        </div>
        <div className="border border-gray10 p-3 dark:border-gray7">
          <p className="text-xs text-gray-500">Safety Limit</p>
          <p className="text-lg font-semibold">{scanResult.maxMissingPercent}%</p>
        </div>
        <div className="border border-gray10 p-3 text-xs text-gray-500 dark:border-gray7 md:col-span-4">
          Mapping <span className="font-mono">{scanResult.dbPrefix}</span> to{" "}
          <span className="font-mono">{scanResult.scanRoot}</span>
        </div>
        {scanResult.message && (
          <div className="border border-gray10 p-3 text-sm text-gray-500 dark:border-gray7 md:col-span-4">
            {scanResult.message}
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (loading) {
      return <div className="flex justify-center py-12"><Loader /></div>;
    }

    if (errorMessage) {
      return <div className="p-4 text-red-500">{errorMessage}</div>;
    }

    if (!scanResult || missingAssets.length === 0) {
      return renderSummary();
    }

    return (
      <>
        {renderSummary()}
        {scanResult.unsafeToTrash && (
          <div className="mx-4 mb-4 border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            Safety stop active. Too many assets appear missing, which may indicate a bad mount or path mapping.
          </div>
        )}
        <div className="p-4">
          {viewMode === "list" ? (
            <DataTable
              ref={dataTableRef}
              columns={missingOriginalColumns}
              data={filteredMissingAssets}
              getRowId={(row: IMissingOriginalAsset) => row.id}
              onRowSelectionChange={handleTableSelectionChange}
            />
          ) : filteredMissingAssets.length > 0 ? (
            <AssetGrid
              assets={filteredMissingAssets}
              selectable={true}
              onSelectionChange={(selectedIds) => contextState.updateContext({ selectedIds })}
            />
          ) : (
            <div className="border border-gray10 p-6 text-center text-sm text-gray-500 dark:border-gray7">
              No missing originals match the current search and filters.
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <PageLayout className="!p-0 !mb-0 relative pb-20">
      <Header
        leftComponent={
          <div className="flex items-center gap-2">
            <span>Missing Originals</span>
            {missingAssets.length > 0 && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                ({humanizeNumber(filteredMissingAssets.length)} of {humanizeNumber(missingAssets.length)})
              </span>
            )}
          </div>
        }
        rightComponent={
          <div className="flex flex-wrap items-center gap-2">
            {missingAssets.length > 0 && (
              <>
                <Input
                  type="text"
                  placeholder="Search missing originals"
                  className="w-56"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <Select
                  value={typeFilter}
                  onValueChange={(value) => setTypeFilter(value as MissingOriginalsTypeFilter)}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="images">Images</SelectItem>
                    <SelectItem value="videos">Videos</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center rounded-md border">
                  <Button
                    variant={viewMode === "grid" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("grid")}
                    className="rounded-r-none"
                    aria-label="Grid view"
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("list")}
                    className="rounded-l-none"
                    aria-label="List view"
                  >
                    <Table className="h-4 w-4" />
                  </Button>
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadCsv(missingAssets)}>
                  <Download className="mr-2 h-4 w-4" />
                  CSV
                </Button>
                <AlertDialog
                  title={`Move all ${missingAssets.length} missing asset record(s) to Trash?`}
                  description="This re-checks each file first, then moves only confirmed missing records to Immich Trash. It does not hard-delete files or database rows."
                  onConfirm={() => trashAssets(missingAssets.map((asset: IMissingOriginalAsset) => asset.id))}
                  disabled={scanResult?.unsafeToTrash}
                >
                  <Button variant="outline" size="sm" disabled={scanResult?.unsafeToTrash}>
                    <Trash className="mr-2 h-4 w-4" />
                    Trash all
                  </Button>
                </AlertDialog>
              </>
            )}
            <Button size="sm" onClick={runScan} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Scan
            </Button>
          </div>
        }
      />
      <PhotoSelectionContext.Provider value={contextState}>
        {renderContent()}
        {detailAsset && (
          <div className="fixed inset-0 z-50 flex bg-black/95">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-3 top-3 z-[60] h-8 w-8 p-0 text-white hover:bg-white/10 hover:text-white"
              onClick={() => setDetailAssetId(null)}
              aria-label="Close asset details"
            >
              <X className="h-4 w-4" />
            </Button>
            <div className="flex min-w-0 flex-1 items-center justify-center p-6">
              {detailAsset.type === "VIDEO" ? (
                <video
                  src={detailAsset.videoURL}
                  controls
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <img
                  src={detailAsset.previewUrl}
                  alt={detailAsset.originalFileName}
                  className="max-h-full max-w-full object-contain"
                />
              )}
            </div>
            <AssetInfoPanel assetId={detailAsset.id} />
          </div>
        )}
        {selectedAssets.length > 0 && (
          <FloatingBar>
            <div className="flex w-full items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">{contextState.selectedIds.length} Selected</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleSelectAll}>
                  Select all
                </Button>
                <Button variant="outline" size="sm" onClick={handleClearSelection}>
                  Unselect all
                </Button>
                <AlertDialog
                  title={`Move ${contextState.selectedIds.length} missing asset record(s) to Trash?`}
                  description="This re-checks the files first, then moves only confirmed missing records to Immich Trash. It does not hard-delete files or database rows."
                  onConfirm={() => trashAssets(contextState.selectedIds)}
                  disabled={scanResult?.unsafeToTrash || contextState.selectedIds.length === 0}
                >
                  <Button variant="outline" size="sm" disabled={scanResult?.unsafeToTrash || contextState.selectedIds.length === 0}>
                    <Trash className="mr-2 h-4 w-4" />
                    Trash selected
                  </Button>
                </AlertDialog>
              </div>
            </div>
          </FloatingBar>
        )}
      </PhotoSelectionContext.Provider>
    </PageLayout>
  );
}
