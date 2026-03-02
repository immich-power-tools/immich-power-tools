import React, { FormEvent, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import PageLayout from "@/components/layouts/PageLayout";
import Header from "@/components/shared/Header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listAlbums } from "@/handlers/api/album.handler";
import { IAlbum } from "@/types/album";

interface IAlbumContributorCount {
  userId: string;
  assetCount: number;
}

interface IImportSharedAsset {
  id: string;
  originalFileName: string;
  type: string;
  fileCreatedAt?: string | null;
  localDateTime?: string | null;
  description?: string | null;
  location?: string | null;
  thumbhash?: string | null;
  fileSizeInByte?: number | null;
  duration?: string | null;
  isFavorite?: boolean;
  isArchived?: boolean;
}

interface IImportSharedAlbum {
  albumName: string;
  assetCount: number;
  owner?: {
    name?: string | null;
    email?: string | null;
  } | null;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  shared?: boolean;
  hasSharedLink?: boolean;
  lastModifiedAssetTimestamp?: string | null;
  order?: string | null;
  contributorCounts?: IAlbumContributorCount[];
  assets: IImportSharedAsset[];
}

interface IImportSharedResponse {
  link: string;
  origin: string;
  key: string;
  sharedLink: {
    id: string;
    type: string;
    createdAt: string;
    expiresAt?: string | null;
    allowUpload?: boolean;
    allowDownload?: boolean;
    showMetadata?: boolean;
  };
  album: IImportSharedAlbum | null;
}

const formatDate = (value?: string | null) => {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

const formatDateOnly = (value?: string | null) => {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-3">
    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="text-sm font-medium text-foreground break-words">{value ?? "—"}</p>
  </div>
);

const formatContributors = (counts?: IAlbumContributorCount[]) => {
  if (!counts || counts.length === 0) {
    return "—";
  }
  return counts.map((entry) => `${entry.assetCount} assets`).join(", ");
};

const formatPermissions = (link?: IImportSharedResponse["sharedLink"]) => {
  if (!link) {
    return "View only";
  }
  const labels: string[] = [];
  if (link.allowDownload) {
    labels.push("Download");
  }
  if (link.allowUpload) {
    labels.push("Upload");
  }
  return labels.length ? labels.join(" / ") : "View only";
};

const formatFileSize = (bytes?: number | null) => {
  if (!bytes || bytes <= 0) {
    return null;
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size % 1 === 0 ? size : size.toFixed(1)} ${units[unit]}`;
};

export default function ImportSharedPage() {
  const [shareLink, setShareLink] = useState("");
  const [submittedLink, setSubmittedLink] = useState<string | null>(null);
  const [sharedData, setSharedData] = useState<IImportSharedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeVideoAsset, setActiveVideoAsset] = useState<IImportSharedAsset | null>(null);
  const [activeImageAsset, setActiveImageAsset] = useState<IImportSharedAsset | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [uploadBanner, setUploadBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [importAllLoading, setImportAllLoading] = useState(false);
  const [importAllDialogOpen, setImportAllDialogOpen] = useState(false);
  const [albumImportMode, setAlbumImportMode] = useState<"album" | "no-album" | "existing-album">("album");
  const [albumNameInput, setAlbumNameInput] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [existingAlbums, setExistingAlbums] = useState<IAlbum[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);

  useEffect(() => {
    if (importAllDialogOpen) {
      listAlbums().then(setExistingAlbums).catch(console.error);
    }
  }, [importAllDialogOpen]);

  useEffect(() => {
    if (sharedData?.album?.albumName) {
      setAlbumNameInput(sharedData.album.albumName);
    } else if (sharedData) {
      setAlbumNameInput("Imported shared album");
    } else {
      setAlbumNameInput("");
    }
  }, [sharedData]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSharedData(null);
    setSubmittedLink(null);
    setUploadBanner(null);
    setImportAllLoading(false);
    setImportAllDialogOpen(false);
    setAlbumImportMode("album");
    setAlbumNameInput("");
    setSelectedAssetIds(new Set());
    setSelectedAlbumId(null);

    if (!shareLink.trim()) {
      setError("Please paste a shared album link.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/import-shared", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ link: shareLink }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || "Failed to import shared album");
      }

      const payload: IImportSharedResponse = await response.json();
      setSharedData(payload);
      setSubmittedLink(payload.link);
      setUploadBanner(null);
      setImportAllLoading(false);
      setAlbumImportMode("album");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const sharedLinkDetails = sharedData?.sharedLink;
  const albumDetails = sharedData?.album;
  const importableAssetCount =
    albumDetails?.assets.filter((asset) => asset.type === "IMAGE" || asset.type === "VIDEO").length ?? 0;

  const buildThumbnailUrl = (asset: IImportSharedAsset) => {
    if (!sharedData) {
      return null;
    }
    const params = new URLSearchParams({
      assetId: asset.id,
      origin: sharedData.origin,
      key: sharedData.key,
      size: "thumbnail",
    });
    if (asset.thumbhash) {
      params.set("thumbhash", asset.thumbhash);
    }
    return `/api/import-shared/thumbnail?${params.toString()}`;
  };

  const buildVideoPlaybackUrl = (asset: IImportSharedAsset) => {
    if (!sharedData) {
      return null;
    }
    const params = new URLSearchParams({
      assetId: asset.id,
      origin: sharedData.origin,
      key: sharedData.key,
    });
    if (asset.thumbhash) {
      params.set("thumbhash", asset.thumbhash);
    }
    return `/api/import-shared/video?${params.toString()}`;
  };

  const buildPreviewUrl = (asset: IImportSharedAsset) => {
    if (!sharedData) {
      return null;
    }
    const params = new URLSearchParams({
      assetId: asset.id,
      origin: sharedData.origin,
      key: sharedData.key,
      size: "preview",
    });
    if (asset.thumbhash) {
      params.set("thumbhash", asset.thumbhash);
    }
    return `/api/import-shared/thumbnail?${params.toString()}`;
  };

  const handleImportAll = async (options: { createAlbum: boolean; albumName?: string; addToAlbumId?: string }) => {
    if (!sharedData || !albumDetails) {
      return;
    }
    let uploadableAssets = albumDetails.assets.filter(
      (asset) => asset.type === "IMAGE" || asset.type === "VIDEO"
    );

    if (selectedAssetIds.size > 0) {
      uploadableAssets = uploadableAssets.filter((asset) => selectedAssetIds.has(asset.id));
    }

    if (uploadableAssets.length === 0) {
      setUploadBanner({ type: "error", message: "No assets selected to import." });
      return;
    }

    const normalizedAlbumName = options.createAlbum
      ? options.albumName?.trim() || albumDetails.albumName || "Imported shared album"
      : undefined;

    const albumOptions = options.createAlbum
      ? { createAlbum: true, albumName: normalizedAlbumName }
      : options.addToAlbumId
      ? { createAlbum: false, addToAlbumId: options.addToAlbumId }
      : { createAlbum: false };

    setUploadBanner(null);
    setImportAllLoading(true);
    try {
      const response = await fetch("/api/import-shared/upload-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          origin: sharedData.origin,
          key: sharedData.key,
          assets: uploadableAssets.map((asset) => ({
            id: asset.id,
            originalFileName: asset.originalFileName,
            type: asset.type,
            fileCreatedAt: asset.fileCreatedAt ?? null,
            localDateTime: asset.localDateTime ?? null,
            duration: asset.duration ?? null,
            isFavorite: asset.isFavorite ?? false,
            isArchived: asset.isArchived ?? false,
          })),
          albumOptions,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Failed to import shared archive");
      }

      const processedAssetIds: string[] = result.processedAssetIds ?? [];
      const skippedAssetIds: string[] = result.skippedAssetIds ?? [];
      const failed: { assetId: string; reason?: string }[] = result.failed ?? [];

      const failedCount = failed.length;
      const skippedCount = skippedAssetIds.length;
      const uploadedCount = result.uploadedCount ?? processedAssetIds.length;
      let bannerType: "success" | "error" = failedCount ? "error" : "success";
      let message: string;
      if (!uploadedCount && skippedCount && !failedCount) {
        message = `All ${skippedCount} assets already exist on Immich.`;
      } else if (failedCount) {
        const skippedSuffix = skippedCount ? `, ${skippedCount} skipped` : "";
        message = `Imported ${uploadedCount} assets, ${failedCount} failed${skippedSuffix}.`;
      } else if (skippedCount) {
        message = `Imported ${uploadedCount} assets, skipped ${skippedCount} already on Immich.`;
      } else {
        message = `Imported ${uploadedCount} assets successfully.`;
      }
      if (options.createAlbum && uploadedCount > 0 && normalizedAlbumName) {
        message = `${message} Added to album "${normalizedAlbumName}".`;
      } else if (options.addToAlbumId && uploadedCount > 0) {
        const album = existingAlbums.find((a) => a.id === options.addToAlbumId);
        message = `${message} Added to album "${album?.albumName || "existing album"}".`;
      }
      setUploadBanner({ type: bannerType, message });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to import shared archive";
      setUploadBanner({ type: "error", message });
    } finally {
      setImportAllLoading(false);
    }
  };

  return (
    <PageLayout className="!p-0 !mb-0 relative pb-20">
      <Header
        leftComponent={
          sharedData ? (
            <Button variant="ghost" size="sm" onClick={() => {
              setSharedData(null);
              setShareLink("");
              setSubmittedLink(null);
              setError(null);
              setActiveVideoAsset(null);
              setActiveImageAsset(null);
              setPreviewLoading(false);
              setUploadBanner(null);
              setImportAllLoading(false);
              setImportAllDialogOpen(false);
              setAlbumImportMode("album");
              setAlbumNameInput("");
              setSelectedAssetIds(new Set());
              setSelectedAlbumId(null);
            }}>
              ← Back
            </Button>
          ) : (
            "Import shared"
          )
        }
        rightComponent={
          sharedData && albumDetails ? (
            <div className="flex gap-2">
              {selectedAssetIds.size > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedAssetIds(new Set())}
                  disabled={importAllLoading}
                >
                  Clear selection
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                disabled={importAllLoading || importableAssetCount === 0}
                onClick={() => {
                  if (importAllLoading) {
                    return;
                  }
                  if (!albumNameInput.trim()) {
                    setAlbumNameInput(albumDetails?.albumName || "Imported shared album");
                  }
                  setAlbumImportMode("album");
                  setImportAllDialogOpen(true);
                }}
              >
                {importAllLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {selectedAssetIds.size > 0 ? `Import selected (${selectedAssetIds.size})` : "Import all"}
              </Button>
            </div>
          ) : null
        }
      />
      <div className={!sharedData ? "flex flex-1 justify-center px-4 py-6" : "flex flex-col gap-6 p-4"}>
        <section className={!sharedData ? "w-full max-w-6xl flex flex-col gap-6" : "w-full flex flex-col gap-6"}>
          {!sharedData && (
            <Card>
              <CardHeader className="space-y-2">
                <CardTitle className="text-2xl">Import a shared album</CardTitle>
                <CardDescription>
                  Paste the shared public link for the album you want to import.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="share-link">Shared album link</Label>
                    <Input
                      id="share-link"
                      value={shareLink}
                      onChange={(event) => setShareLink(event.target.value)}
                      placeholder="https://demo.immich.app/share/<key>"
                      type="url"
                      required
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button type="submit" disabled={!shareLink.trim() || loading}>
                      {loading ? "Processing..." : "Submit"}
                    </Button>
                  </div>
                </form>
                {error && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {sharedLinkDetails && sharedData && albumDetails && (
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="text-xl">{albumDetails.albumName}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <InfoRow label="Expires" value={sharedLinkDetails.expiresAt ? formatDate(sharedLinkDetails.expiresAt) : "No expiry"} />
                {albumDetails && (
                  <>
                    <InfoRow label="Owner" value={albumDetails.owner?.name ?? "Unknown"} />
                    <InfoRow label="Assets" value={albumDetails.assetCount} />
                    <InfoRow label="Date range" value={`${formatDateOnly(albumDetails.startDate)} → ${formatDateOnly(albumDetails.endDate)}`} />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {albumDetails && sharedData && (
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="text-xl">Gallery</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {uploadBanner && (
                  <div
                    className={`rounded-md border px-4 py-2 text-sm ${
                      uploadBanner.type === "success"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                        : "border-destructive/40 bg-destructive/10 text-destructive"
                    }`}
                  >
                    {uploadBanner.message}
                  </div>
                )}
                {albumDetails.description && (
                  <p className="text-sm text-muted-foreground">{albumDetails.description}</p>
                )}
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                  {albumDetails.assets.length === 0 && (
                    <div className="col-span-full rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
                      This album has no assets yet.
                    </div>
                  )}
                  {albumDetails.assets.map((asset) => {
                    const formattedSize = formatFileSize(asset.fileSizeInByte);
                    const thumbnailUrl = buildThumbnailUrl(asset);
                    const isVideoAsset = asset.type === "VIDEO";
                    const isInteractive = true;
                    const ariaLabel = isVideoAsset
                      ? `Play video ${asset.originalFileName}`
                      : `View photo ${asset.originalFileName}`;
                    const isSelected = selectedAssetIds.has(asset.id);

                    return (
                      <div
                        key={asset.id}
                        className={`flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm ${
                          isInteractive ?
                            "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" :
                            ""
                        } ${isSelected ? "ring-2 ring-primary" : ""}`}
                        onClick={() => {
                          if (isVideoAsset) {
                            setActiveImageAsset(null);
                            setActiveVideoAsset(asset);
                            setPreviewLoading(false);
                          } else {
                            setActiveVideoAsset(null);
                            setPreviewLoading(true);
                            setActiveImageAsset(asset);
                          }
                        }}
                        role={isInteractive ? "button" : undefined}
                        tabIndex={isInteractive ? 0 : undefined}
                        aria-label={ariaLabel}
                        onKeyDown={(event) => {
                          if (!isInteractive) {
                            return;
                          }
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            if (isVideoAsset) {
                              setActiveImageAsset(null);
                              setActiveVideoAsset(asset);
                              setPreviewLoading(false);
                            } else {
                              setActiveVideoAsset(null);
                              setPreviewLoading(true);
                              setActiveImageAsset(asset);
                            }
                          }
                        }}
                      >
                      <div className="relative aspect-square w-full bg-muted">
                        <div className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => {
                                    const newSelection = new Set(selectedAssetIds);
                                    if (newSelection.has(asset.id)) {
                                        newSelection.delete(asset.id);
                                    } else {
                                        newSelection.add(asset.id);
                                    }
                                    setSelectedAssetIds(newSelection);
                                }}
                                className="bg-white/80 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                            />
                        </div>
                        {thumbnailUrl ? (
                          <img
                            src={thumbnailUrl}
                            alt={`Thumbnail for ${asset.originalFileName}`}
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                            No preview
                          </div>
                        )}
                        {isVideoAsset && (
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <div className="rounded-full bg-black/60 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white">
                              ▶ Play
                            </div>
                          </div>
                        )}
                        <div className="absolute bottom-2 right-2 flex gap-2">
                          <span className="rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                            {asset.type}
                          </span>
                          {formattedSize && (
                            <span className="rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                              {formattedSize}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 p-3">
                        <p className="text-sm font-semibold text-foreground" title={asset.originalFileName}>
                          {asset.originalFileName}
                        </p>
                        <p className="text-xs text-muted-foreground">Captured {formatDate(asset.fileCreatedAt || asset.localDateTime)}</p>
                        {asset.location && (
                          <p className="text-xs text-muted-foreground">{asset.location}</p>
                        )}
                        {asset.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{asset.description}</p>
                        )}
                      </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
      <Dialog
        open={importAllDialogOpen}
        onOpenChange={(open) => {
          if (importAllLoading) {
            return;
          }
          setImportAllDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedAssetIds.size > 0 ? "Import selected assets" : "Import all assets"}</DialogTitle>
            <DialogDescription>
              Decide whether to create a new Immich album for these imported assets.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-foreground">Destination</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant={albumImportMode === "album" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setAlbumImportMode("album")}
                  disabled={importAllLoading}
                >
                  Create a new album
                </Button>
                <Button
                  type="button"
                  variant={albumImportMode === "existing-album" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setAlbumImportMode("existing-album")}
                  disabled={importAllLoading}
                >
                  Existing Album
                </Button>
                <Button
                  type="button"
                  variant={albumImportMode === "no-album" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setAlbumImportMode("no-album")}
                  disabled={importAllLoading}
                >
                  No Album
                </Button>
              </div>
            </div>
            {albumImportMode === "album" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="import-album-name">Album name</Label>
                <Input
                  id="import-album-name"
                  value={albumNameInput}
                  onChange={(event) => setAlbumNameInput(event.target.value)}
                  placeholder="Imported shared album"
                  disabled={importAllLoading}
                />
              </div>
            )}
            {albumImportMode === "existing-album" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="existing-album">Select Album</Label>
                <Select onValueChange={setSelectedAlbumId} value={selectedAlbumId || undefined}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an album" />
                  </SelectTrigger>
                  <SelectContent>
                    {existingAlbums.map((album) => (
                      <SelectItem key={album.id} value={album.id}>
                        {album.albumName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setImportAllDialogOpen(false)}
              disabled={importAllLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (importAllLoading) {
                  return;
                }
                const shouldCreateAlbum = albumImportMode === "album";
                const trimmedAlbumName = albumNameInput.trim();
                setImportAllDialogOpen(false);
                handleImportAll({
                  createAlbum: shouldCreateAlbum,
                  albumName: shouldCreateAlbum ? trimmedAlbumName : undefined,
                  addToAlbumId: albumImportMode === "existing-album" && selectedAlbumId ? selectedAlbumId : undefined,
                });
              }}
              disabled={
                importAllLoading || 
                (albumImportMode === "album" && albumNameInput.trim().length === 0) ||
                (albumImportMode === "existing-album" && !selectedAlbumId)
              }
            >
              {importAllLoading ? "Importing..." : "Start import"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!activeVideoAsset}
        onOpenChange={(open) => {
          if (!open) {
            setActiveVideoAsset(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          {activeVideoAsset && (
            <>
              <DialogHeader>
                <DialogTitle>{activeVideoAsset.originalFileName}</DialogTitle>
              </DialogHeader>
              <div className="flex w-full justify-center">
                <video
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[70vh] w-auto max-w-full rounded-lg bg-black object-contain"
                  src={buildVideoPlaybackUrl(activeVideoAsset) ?? undefined}
                  poster={buildThumbnailUrl(activeVideoAsset) ?? undefined}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!activeImageAsset}
        onOpenChange={(open) => {
          if (!open) {
            setActiveImageAsset(null);
            setPreviewLoading(false);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          {activeImageAsset && (
            <>
              <DialogHeader>
                <DialogTitle>{activeImageAsset.originalFileName}</DialogTitle>
              </DialogHeader>
              <div className="relative flex w-full justify-center min-h-[200px]">
                <img
                  src={buildPreviewUrl(activeImageAsset) ?? undefined}
                  alt={activeImageAsset.originalFileName}
                  className={`max-h-[80vh] w-auto max-w-full rounded-lg object-contain transition-opacity ${
                    previewLoading ? "opacity-0" : "opacity-100"
                  }`}
                  onLoad={() => setPreviewLoading(false)}
                  onError={() => setPreviewLoading(false)}
                />
                {previewLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
