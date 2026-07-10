import React, { FormEvent, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  Loader2,
  Images,
  User,
  Clock,
  CheckCircle2,
  XCircle,
  Clock3,
  Link2,
  Download,
  Tag,
  ArrowLeft,
  FolderPlus,
  Folder,
  FolderMinus,
  AlertTriangle,
} from "lucide-react";
import PageLayout from "@/components/layouts/PageLayout";
import Header from "@/components/shared/Header";
import ApiKeyGate from "@/components/shared/ApiKeyGate";

import { IMPORT_PERMISSIONS } from "@/config/permissions";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listAlbums } from "@/handlers/api/album.handler";
import { importShared } from "@/handlers/api/import-shared.handler";
import { createImportJob, getImportJob, listImportJobs } from "@/handlers/api/import-jobs.handler";
import ImportJobDetailDialog from "@/components/import/ImportJobDetailDialog";
import { validatePermissions } from "@/handlers/api/validate-permissions.handler";
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
  // Ente-specific encryption artifacts (optional)
  enteFileKey?: string;
  enteFileDecryptionHeader?: string;
  enteThumbnailDecryptionHeader?: string;
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
  platform: "immich" | "nextcloud" | "ente";
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
  // Ente-specific (optional)
  enteApiBase?: string;
  enteAlbumKey?: string;
}

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatDateOnly = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatFileSize = (bytes?: number | null) => {
  if (!bytes || bytes <= 0) return null;
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
  const [shareLinkPassword, setShareLinkPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [submittedLink, setSubmittedLink] = useState<string | null>(null);
  const [sharedData, setSharedData] = useState<IImportSharedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeVideoAsset, setActiveVideoAsset] = useState<IImportSharedAsset | null>(null);
  const [activeImageAsset, setActiveImageAsset] = useState<IImportSharedAsset | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [uploadBanner, setUploadBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [importAllLoading, setImportAllLoading] = useState(false);
  const [albumImportMode, setAlbumImportMode] = useState<"album" | "no-album" | "existing-album">("album");
  const [albumNameInput, setAlbumNameInput] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [existingAlbums, setExistingAlbums] = useState<IAlbum[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<{ uploaded: number; skipped: number; failed: number; total: number } | null>(null);
  const [tagAssets, setTagAssets] = useState(true);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);

  const [hasImportApiKey, setHasImportApiKey] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/settings/kv/import_api_key")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setHasImportApiKey(!!data?.value))
      .catch(() => setHasImportApiKey(false));
  }, []);

  const { data: permissions } = useQuery({
    queryKey: ["validate-permissions"],
    queryFn: validatePermissions,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { data: importHistory, refetch: refetchHistory } = useQuery({
    queryKey: ["import-jobs"],
    queryFn: listImportJobs,
    staleTime: 30 * 1000,
  });

  const albumNameRef = useRef(albumNameInput);

  useEffect(() => {
    albumNameRef.current = albumNameInput;
  }, [albumNameInput]);

  useEffect(() => {
    if (sharedData) {
      listAlbums().then(setExistingAlbums).catch(console.error);
    }
  }, [sharedData]);

  useEffect(() => {
    if (sharedData?.album?.albumName) {
      setAlbumNameInput(sharedData.album.albumName);
    } else if (sharedData) {
      setAlbumNameInput("Imported shared album");
    } else {
      setAlbumNameInput("");
    }
  }, [sharedData]);

  useEffect(() => {
    if (!activeJobId) return;

    const interval = setInterval(async () => {
      try {
        const { job } = await getImportJob(activeJobId);
        setJobProgress({
          uploaded: job.uploadedCount,
          skipped: job.skippedCount,
          failed: job.failedCount,
          total: job.totalCount,
        });

        if (job.status === "completed" || job.status === "failed") {
          clearInterval(interval);
          setActiveJobId(null);
          setImportAllLoading(false);

          let importData: Record<string, unknown> = {};
          try {
            importData = JSON.parse(job.importData);
          } catch {
            // malformed importData — skip album name append
          }
          const failedCount = job.failedCount;
          const skippedCount = job.skippedCount;
          const uploadedCount = job.uploadedCount;
          const bannerType: "success" | "error" = (failedCount > 0 || job.status === "failed") ? "error" : "success";
          let message: string;

          if (job.status === "failed" && importData.error && typeof importData.error === "string") {
            message = importData.error;
          } else if (!uploadedCount && skippedCount && !failedCount) {
            message = `All ${skippedCount} assets already exist on Immich.`;
          } else if (failedCount) {
            const skippedSuffix = skippedCount ? `, ${skippedCount} skipped` : "";
            message = `Imported ${uploadedCount} assets, ${failedCount} failed${skippedSuffix}.`;
          } else if (skippedCount) {
            message = `Imported ${uploadedCount} assets, skipped ${skippedCount} already on Immich.`;
          } else {
            message = `Imported ${uploadedCount} assets successfully.`;
          }

          if (importData.albumId && uploadedCount > 0) {
            message = `${message} Added to album "${albumNameRef.current || "selected album"}".`;
          }

          setUploadBanner({ type: bannerType, message });
          refetchHistory();
        }
      } catch (err) {
        console.error("Polling error", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeJobId]);

  const resetState = () => {
    setSharedData(null);
    setShareLink("");
    setShareLinkPassword("");
    setNeedsPassword(false);
    setSubmittedLink(null);
    setError(null);
    setActiveVideoAsset(null);
    setActiveImageAsset(null);
    setPreviewLoading(false);
    setUploadBanner(null);
    setImportAllLoading(false);
    setAlbumImportMode("album");
    setAlbumNameInput("");
    setSelectedAssetIds(new Set());
    setSelectedAlbumId(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!needsPassword) {
      setSharedData(null);
      setSubmittedLink(null);
      setUploadBanner(null);
      setImportAllLoading(false);
      setAlbumImportMode("album");
      setAlbumNameInput("");
      setSelectedAssetIds(new Set());
      setSelectedAlbumId(null);
    }

    if (!shareLink.trim()) {
      setError("Please paste a shared album link.");
      return;
    }

    setLoading(true);
    try {
      const payload: IImportSharedResponse = await importShared(
        shareLink,
        needsPassword ? shareLinkPassword : undefined
      );
      setSharedData(payload);
      setSubmittedLink(payload.link);
      setUploadBanner(null);
      setImportAllLoading(false);
      setAlbumImportMode("album");
      setNeedsPassword(false);
      // Keep password for Nextcloud (needed for import job and video proxy)
      if (payload.platform !== "nextcloud") {
        setShareLinkPassword("");
      }
    } catch (err: any) {
      const errorCode = err?.error ?? err?.message ?? "Unexpected error";
      if (errorCode === "PASSWORD_REQUIRED") {
        setNeedsPassword(true);
        setError(null);
      } else {
        setError(err?.message ?? err?.error ?? "Unexpected error");
      }
    } finally {
      setLoading(false);
    }
  };

  const sharedLinkDetails = sharedData?.sharedLink;
  const albumDetails = sharedData?.album;
  const importableAssetCount =
    albumDetails?.assets.filter((asset) => asset.type === "IMAGE" || asset.type === "VIDEO").length ?? 0;

  const buildThumbnailUrl = (asset: IImportSharedAsset) => {
    if (!sharedData) return null;
    const params = new URLSearchParams({
      assetId: asset.id,
      origin: sharedData.origin,
      key: sharedData.key,
      size: "thumbnail",
      platform: sharedData.platform,
    });
    if (asset.thumbhash) params.set("thumbhash", asset.thumbhash);
    if (sharedData.platform === "ente") {
      if (asset.enteFileKey) params.set("enteFileKey", asset.enteFileKey);
      if (asset.enteThumbnailDecryptionHeader) params.set("enteThumbnailHeader", asset.enteThumbnailDecryptionHeader);
      if (sharedData.enteApiBase) params.set("apiBase", sharedData.enteApiBase);
    }
    return `/api/import-shared/thumbnail?${params.toString()}`;
  };

  const buildVideoPlaybackUrl = (asset: IImportSharedAsset) => {
    if (!sharedData) return null;
    const params = new URLSearchParams({
      assetId: asset.id,
      origin: sharedData.origin,
      key: sharedData.key,
      platform: sharedData.platform,
    });
    if (asset.thumbhash) params.set("thumbhash", asset.thumbhash);
    if (sharedData.platform === "nextcloud" && shareLinkPassword) {
      params.set("password", shareLinkPassword);
    }
    return `/api/import-shared/video?${params.toString()}`;
  };

  const buildPreviewUrl = (asset: IImportSharedAsset) => {
    if (!sharedData) return null;
    const params = new URLSearchParams({
      assetId: asset.id,
      origin: sharedData.origin,
      key: sharedData.key,
      size: "preview",
      platform: sharedData.platform,
    });
    if (asset.thumbhash) params.set("thumbhash", asset.thumbhash);
    if (sharedData.platform === "ente") {
      if (asset.enteFileKey) params.set("enteFileKey", asset.enteFileKey);
      if (asset.enteThumbnailDecryptionHeader) params.set("enteThumbnailHeader", asset.enteThumbnailDecryptionHeader);
      if (sharedData.enteApiBase) params.set("apiBase", sharedData.enteApiBase);
    }
    return `/api/import-shared/thumbnail?${params.toString()}`;
  };

  const handleImportAll = async (options: { createAlbum: boolean; albumName?: string; addToAlbumId?: string }) => {
    if (!sharedData || !albumDetails) return;
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
      const isNextcloud = sharedData.platform === "nextcloud";
      const isEnte = sharedData.platform === "ente";
      const urlConfig: Record<string, string> = { key: sharedData.key };
      if (isNextcloud && shareLinkPassword) {
        urlConfig.password = shareLinkPassword;
      }
      if (isEnte) {
        if (sharedData.enteApiBase) urlConfig.apiBase = sharedData.enteApiBase;
        if (sharedData.enteAlbumKey) urlConfig.albumKey = sharedData.enteAlbumKey;
      }

      const job = await createImportJob({
        platform: sharedData.platform,
        url: sharedData.origin,
        urlConfig,
        importData: { albumOptions, tagAssets },
        assets: uploadableAssets.map((asset) => ({
          id: asset.id,
          originalFileName: asset.originalFileName,
          type: asset.type,
          fileCreatedAt: asset.fileCreatedAt ?? null,
          localDateTime: asset.localDateTime ?? null,
          duration: asset.duration ?? null,
          isFavorite: asset.isFavorite ?? false,
          isArchived: asset.isArchived ?? false,
          ...(isNextcloud ? { relativePath: asset.id } : {}),
          ...(isEnte ? {
            enteFileKey: asset.enteFileKey ?? null,
            enteFileDecryptionHeader: asset.enteFileDecryptionHeader ?? null,
            enteThumbnailDecryptionHeader: asset.enteThumbnailDecryptionHeader ?? null,
          } : {}),
        })),
      });
      setActiveJobId(job.jobId);
      setJobProgress({ uploaded: 0, skipped: 0, failed: 0, total: uploadableAssets.length });
    } catch (err: any) {
      setUploadBanner({ type: "error", message: err.message ?? "Failed to start import" });
      setImportAllLoading(false);
    }
  };

  const progressPercent = jobProgress
    ? Math.round(((jobProgress.uploaded + jobProgress.skipped + jobProgress.failed) / Math.max(jobProgress.total, 1)) * 100)
    : 0;

  const toggleAssetSelection = (assetId: string) => {
    const newSelection = new Set(selectedAssetIds);
    if (newSelection.has(assetId)) {
      newSelection.delete(assetId);
    } else {
      newSelection.add(assetId);
    }
    setSelectedAssetIds(newSelection);
  };

  const selectAll = () => {
    if (!albumDetails) return;
    const allImportable = albumDetails.assets
      .filter((a) => a.type === "IMAGE" || a.type === "VIDEO")
      .map((a) => a.id);
    setSelectedAssetIds(new Set(allImportable));
  };

  const isAllSelected = selectedAssetIds.size === importableAssetCount && importableAssetCount > 0;

  return (
    <PageLayout className="!p-0 !mb-0 relative">
      <Header
        leftComponent={
          sharedData ? (
            <Button variant="ghost" size="sm" onClick={resetState} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          ) : (
            "Import Shared"
          )
        }
      />

      {/* ── API key gate ── */}
      {hasImportApiKey === false && (
        <ApiKeyGate
          title="Import API Key Required"
          description="Importing shared albums requires a dedicated Immich API key with upload permissions. Generate one automatically or configure it in Settings."
          permissions={IMPORT_PERMISSIONS}
          generateEndpoint="/api/settings/generate-import-api-key"
          onGenerated={() => setHasImportApiKey(true)}
        />
      )}

      {/* ── Landing state ── */}
      {hasImportApiKey !== false && !sharedData && (
        <div className="flex flex-1 justify-center px-4 py-8">
          <div className="w-full max-w-2xl space-y-6">
            {permissions?.canUpload === false && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Your API key does not have upload permission. Import will not work.
              </div>
            )}

            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">Import a shared album</h1>
              <p className="text-sm text-muted-foreground">
                Paste a public shared link from <strong className="font-medium">Immich</strong>, <strong className="font-medium">Nextcloud</strong>, or <strong className="font-medium">Ente</strong> to import its assets into your Immich instance.
              </p>
            </div>

            <form className="space-y-3" onSubmit={handleSubmit}>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={shareLink}
                    onChange={(e) => {
                      setShareLink(e.target.value);
                      if (needsPassword) {
                        setNeedsPassword(false);
                        setShareLinkPassword("");
                      }
                    }}
                    placeholder="Immich, Nextcloud, or Ente share URL"
                    type="url"
                    required
                    className="pl-9"
                  />
                </div>
                <Button type="submit" disabled={!shareLink.trim() || loading || (needsPassword && !shareLinkPassword.trim())}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fetch"}
                </Button>
              </div>
              {needsPassword && (
                <div className="flex items-center gap-2">
                  <Input
                    value={shareLinkPassword}
                    onChange={(e) => setShareLinkPassword(e.target.value)}
                    placeholder="Enter shared link password"
                    type="password"
                    autoFocus
                    className="max-w-xs"
                  />
                  <span className="text-xs text-muted-foreground">This shared link is password-protected</span>
                </div>
              )}
            </form>

            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {importHistory?.jobs && importHistory.jobs.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Previous imports
                </h2>
                <div className="space-y-1.5">
                  {importHistory.jobs.map((job) => {
                    let jobImportData: Record<string, unknown> = {};
                    try { jobImportData = JSON.parse(job.importData); } catch { /* ignore */ }
                    const albumOpts = jobImportData.albumOptions as { albumName?: string } | undefined;
                    const albumName = albumOpts?.albumName;

                    const borderColor = job.status === "completed"
                      ? "border-l-emerald-500"
                      : job.status === "failed"
                        ? "border-l-destructive"
                        : "border-l-amber-400";

                    const statusIcon = job.status === "completed" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : job.status === "failed" ? (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    ) : (
                      <Clock3 className="h-4 w-4 text-amber-400 shrink-0 animate-pulse" />
                    );

                    return (
                      <div
                        key={job.id}
                        className={`flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer border border-l-[3px] ${borderColor} bg-muted/30 hover:bg-muted/60 transition-colors`}
                        onClick={() => setDetailJobId(job.id)}
                      >
                        {statusIcon}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {albumName || job.url}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                              {job.uploadedCount} imported
                            </span>
                            {job.skippedCount > 0 && (
                              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                {job.skippedCount} skipped
                              </span>
                            )}
                            {job.failedCount > 0 && (
                              <span className="inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
                                {job.failedCount} failed
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateOnly(job.createdAt)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Album detail + gallery view ── */}
      {hasImportApiKey !== false && sharedData && albumDetails && sharedLinkDetails && (
        <>
          <div className="flex flex-col gap-4 p-4 pb-36">
            {/* Upload banner */}
            {uploadBanner && (
              <div
                className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
                  uploadBanner.type === "success"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-destructive/40 bg-destructive/10 text-destructive"
                }`}
              >
                {uploadBanner.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0" />
                )}
                {uploadBanner.message}
              </div>
            )}

            {permissions?.canUpload === false && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Your API key does not have upload permission.
              </div>
            )}

            {/* Album header */}
            <div className="space-y-2">
              <h1 className="text-xl font-bold tracking-tight">{albumDetails.albumName}</h1>
              {albumDetails.description && (
                <p className="text-sm text-muted-foreground">{albumDetails.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Images className="h-3.5 w-3.5" />
                  {albumDetails.assetCount} assets
                </span>
                {albumDetails.owner?.name && (
                  <span className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    {albumDetails.owner.name}
                  </span>
                )}
                {albumDetails.startDate && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDateOnly(albumDetails.startDate)}
                    {albumDetails.endDate && albumDetails.endDate !== albumDetails.startDate && (
                      <> — {formatDateOnly(albumDetails.endDate)}</>
                    )}
                  </span>
                )}
                {sharedLinkDetails.expiresAt && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Expires {formatDate(sharedLinkDetails.expiresAt)}
                  </span>
                )}
              </div>
            </div>

            {/* Selection bar */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => isAllSelected ? setSelectedAssetIds(new Set()) : selectAll()}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {isAllSelected ? "Deselect all" : "Select all"}
              </button>
              {selectedAssetIds.size > 0 && (
                <span className="text-xs text-muted-foreground">
                  {selectedAssetIds.size} of {importableAssetCount} selected
                </span>
              )}
            </div>

            {/* Gallery grid */}
            <div className="grid gap-1 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
              {albumDetails.assets.length === 0 && (
                <div className="col-span-full rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                  This album has no assets.
                </div>
              )}
              {albumDetails.assets.map((asset) => {
                const formattedSize = formatFileSize(asset.fileSizeInByte);
                const thumbnailUrl = buildThumbnailUrl(asset);
                const isVideoAsset = asset.type === "VIDEO";
                const isSelected = selectedAssetIds.has(asset.id);

                return (
                  <div
                    key={asset.id}
                    className={`group relative aspect-square overflow-hidden rounded-md cursor-pointer transition-all ${
                      isSelected
                        ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                        : "hover:opacity-90"
                    }`}
                    onClick={() => {
                      if (isVideoAsset && sharedData?.platform !== "ente") {
                        setActiveImageAsset(null);
                        setActiveVideoAsset(asset);
                        setPreviewLoading(false);
                      } else {
                        setActiveVideoAsset(null);
                        setPreviewLoading(true);
                        setActiveImageAsset(asset);
                      }
                    }}
                  >
                    {/* Thumbnail */}
                    {thumbnailUrl ? (
                      <img
                        src={thumbnailUrl}
                        alt={asset.originalFileName}
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-muted text-xs text-muted-foreground">
                        No preview
                      </div>
                    )}

                    {/* Checkbox overlay */}
                    <div
                      className={`absolute top-1.5 left-1.5 z-10 transition-opacity ${
                        isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAssetSelection(asset.id);
                      }}
                    >
                      <Checkbox
                        checked={isSelected}
                        className="h-4 w-4 bg-white/80 border-white/60 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground shadow-sm"
                      />
                    </div>

                    {/* Video play indicator (hidden for Ente — no video preview) */}
                    {isVideoAsset && sharedData?.platform !== "ente" && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="rounded-full bg-black/50 p-2">
                          <svg className="h-4 w-4 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    )}

                    {/* Bottom info overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 pt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[10px] text-white/90 truncate leading-tight">
                        {asset.originalFileName}
                      </p>
                    </div>

                    {/* Type + size badges */}
                    {(isVideoAsset || formattedSize) && (
                      <div className="absolute top-1.5 right-1.5 flex gap-1">
                        {formattedSize && (
                          <span className="rounded bg-black/50 px-1 py-0.5 text-[9px] text-white/90 leading-none">
                            {formattedSize}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Sticky import bar ── */}
          <div className="fixed bottom-0 left-0 right-0 z-30 md:left-[200px] lg:left-[240px]">
            {/* Progress bar */}
            {importAllLoading && jobProgress && (
              <div className="h-1 w-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}

            <div className="border-t bg-background/95 backdrop-blur-sm px-4 py-3">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Import mode toggle */}
                <div className="flex items-center rounded-lg border border-border overflow-hidden">
                  {([
                    { mode: "album" as const, icon: FolderPlus, label: "New album" },
                    { mode: "existing-album" as const, icon: Folder, label: "Existing" },
                    { mode: "no-album" as const, icon: FolderMinus, label: "No album" },
                  ]).map(({ mode, icon: Icon, label }) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setAlbumImportMode(mode)}
                      disabled={importAllLoading}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                        albumImportMode === mode
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      {label}
                    </button>
                  ))}
                </div>

                {/* Album name input */}
                {albumImportMode === "album" && (
                  <Input
                    value={albumNameInput}
                    onChange={(e) => setAlbumNameInput(e.target.value)}
                    placeholder="Album name"
                    disabled={importAllLoading}
                    className="h-8 max-w-[200px] text-sm"
                  />
                )}

                {/* Existing album select */}
                {albumImportMode === "existing-album" && (
                  <Select
                    onValueChange={setSelectedAlbumId}
                    value={selectedAlbumId || undefined}
                    disabled={importAllLoading}
                  >
                    <SelectTrigger className="h-8 max-w-[200px] text-sm">
                      <SelectValue placeholder="Select album" />
                    </SelectTrigger>
                    <SelectContent>
                      {existingAlbums.map((album) => (
                        <SelectItem key={album.id} value={album.id}>
                          {album.albumName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Tag checkbox */}
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="tag-assets-bar"
                    checked={tagAssets}
                    onCheckedChange={(checked) => setTagAssets(!!checked)}
                    disabled={importAllLoading}
                    className="h-3.5 w-3.5"
                  />
                  <Label htmlFor="tag-assets-bar" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                    <Tag className="h-3 w-3 inline mr-0.5 -mt-px" />
                    Tag
                  </Label>
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Progress text */}
                {importAllLoading && jobProgress && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {jobProgress.uploaded + jobProgress.skipped + jobProgress.failed}/{jobProgress.total}
                    {jobProgress.failed > 0 && (
                      <span className="text-destructive"> ({jobProgress.failed} failed)</span>
                    )}
                  </span>
                )}

                {/* Selection clear */}
                {selectedAssetIds.size > 0 && !importAllLoading && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedAssetIds(new Set())}
                    className="h-8 text-xs"
                  >
                    Clear ({selectedAssetIds.size})
                  </Button>
                )}

                {/* Import button */}
                <Button
                  size="sm"
                  className="h-8 gap-1.5"
                  disabled={
                    importAllLoading ||
                    importableAssetCount === 0 ||
                    (albumImportMode === "existing-album" && !selectedAlbumId) ||
                    (permissions && !permissions.canUpload)
                  }
                  onClick={() => {
                    if (importAllLoading) return;
                    const shouldCreateAlbum = albumImportMode === "album";
                    handleImportAll({
                      createAlbum: shouldCreateAlbum,
                      albumName: shouldCreateAlbum ? albumNameInput.trim() : undefined,
                      addToAlbumId:
                        albumImportMode === "existing-album" && selectedAlbumId
                          ? selectedAlbumId
                          : undefined,
                    });
                  }}
                >
                  {importAllLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {selectedAssetIds.size > 0
                    ? `Import ${selectedAssetIds.size}`
                    : `Import all (${importableAssetCount})`
                  }
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Video preview dialog ── */}
      <Dialog
        open={!!activeVideoAsset}
        onOpenChange={(open) => { if (!open) setActiveVideoAsset(null); }}
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

      {/* ── Image preview dialog ── */}
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

      {/* ── Job detail dialog ── */}
      <ImportJobDetailDialog jobId={detailJobId} onClose={() => setDetailJobId(null)} />
    </PageLayout>
  );
}
