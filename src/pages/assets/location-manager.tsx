import AssetGrid, { AssetPhoto } from "@/components/shared/AssetGrid";
import AlbumDropdown from "@/components/shared/AlbumDropdown";
import Header from "@/components/shared/Header";
import PageLayout from "@/components/layouts/PageLayout";
import FavoritesSheet from "@/components/location-manager/FavoritesSheet";
import LocationSearchBox from "@/components/location-manager/LocationSearchBox";
import { useLocationFavorites } from "@/components/location-manager/useLocationFavorites";
import { AlertDialog, IAlertDialogActions } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/components/ui/use-toast";
import PhotoSelectionContext, {
  IPhotoSelectionContext,
} from "@/contexts/PhotoSelectionContext";
import {
  ILocationManagerAssetsResponse,
  listLocationManagerAssets,
  updateAssets,
} from "@/handlers/api/asset.handler";
import { LOCATION_MANAGER_PAGE_SIZE } from "@/config/constants/location-manager";
import { ILocationFavorite } from "@/handlers/api/locationFavorite.handler";
import {
  coordsEqual,
  formatCoordinates,
  ILatLng,
  parseCoordinates,
} from "@/lib/location-manager/coordinates";
import type {
  IFlyTo,
  IImagePin,
  ISelectedPin,
} from "@/components/location-manager/LocationManagerMap";
import {
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  ClipboardPaste,
  Expand,
  Loader2,
  Plus,
  SortAsc,
  SortDesc,
  Star,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useTheme } from "next-themes";
import React, { useEffect, useMemo, useRef, useState } from "react";

const LocationManagerMap = dynamic(
  () => import("@/components/location-manager/LocationManagerMap"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
        Loading map…
      </div>
    ),
  }
);

type GpsStatus = "all" | "set" | "notSet";

interface IClipboard {
  coords: ILatLng;
  source: "image" | "map";
}

// Outline buttons default to a neutral look; when the action is actually
// available we tint the background so eligibility reads at a glance instead
// of only via the (subtler) disabled/greyed-out state.
const activeButtonClass = (active: boolean, color: "green" | "blue") => {
  if (!active) return "";
  return color === "green"
    ? "!bg-green-600 !text-white !border-green-600 hover:!bg-green-700"
    : "!bg-blue-600 !text-white !border-blue-600 hover:!bg-blue-700";
};

export default function LocationManager() {
  const router = useRouter();
  const { theme } = useTheme();
  const {
    albumId,
    gpsStatus = "all",
    sortOrder = "desc",
    dateFrom,
    dateTo,
  } = router.query as {
    albumId?: string;
    gpsStatus?: GpsStatus;
    sortOrder?: "asc" | "desc";
    dateFrom?: string;
    dateTo?: string;
  };

  const [contextState, setContextState] = useState<IPhotoSelectionContext>({
    selectedIds: [],
    assets: [],
    config: {},
    updateContext: (newState: Partial<IPhotoSelectionContext>) => {
      setContextState((prev) => ({ ...prev, ...newState }));
    },
  });
  const { assets, selectedIds, updateContext } = contextState;

  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // One page is shown at a time (replace, not append) so the DOM/marker count
  // stays bounded by the page size no matter how large the library is. The
  // next page is prefetched into this ref so paging forward — including the
  // "next without GPS" button hopping across a page boundary — feels instant.
  // Keyed by the active filter + page so a stale prefetch is never applied.
  const prefetchRef = useRef<{ key: string; page: number; data: ILocationManagerAssetsResponse } | null>(null);
  const filterKey = () => JSON.stringify({ albumId, gpsStatus, sortOrder, dateFrom, dateTo });
  const pageCount = total != null ? Math.max(1, Math.ceil(total / LOCATION_MANAGER_PAGE_SIZE)) : null;

  // Shared clipboard + pin state (unified across grid and map controls).
  const [clipboard, setClipboard] = useState<IClipboard | null>(null);
  const [droppedPin, setDroppedPin] = useState<ILatLng | null>(null);
  const [selectedPin, setSelectedPin] = useState<ISelectedPin>(null);
  const [flyTo, setFlyTo] = useState<IFlyTo | null>(null);

  const [imageCoordsDraft, setImageCoordsDraft] = useState("");
  const [imageCoordsError, setImageCoordsError] = useState(false);
  const [mapCoordsDraft, setMapCoordsDraft] = useState("");
  const [mapCoordsError, setMapCoordsError] = useState(false);

  // Confirmation before writing Image Coordinates to selected photos.
  const updateConfirmRef = useRef<IAlertDialogActions>(null);
  const [pendingUpdateCoords, setPendingUpdateCoords] = useState<ILatLng | null>(null);

  // Quick "Create Favourite" popover (right panel; saves the selected pin)
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddName, setQuickAddName] = useState("");

  // Grid ↔ map linkage
  const [showAllOnMap, setShowAllOnMap] = useState(false);
  const [hoveredAssetId, setHoveredAssetId] = useState<string | null>(null);
  const [flashedAssetId, setFlashedAssetId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const favoritesState = useLocationFavorites();
  const { favorites } = favoritesState;

  const setFilters = (patch: Record<string, string | undefined>) => {
    const next: Record<string, any> = { ...router.query, ...patch };
    Object.keys(next).forEach((k) => {
      if (next[k] === undefined || next[k] === "") delete next[k];
    });
    router.push(
      { pathname: "/assets/location-manager", query: next },
      undefined,
      { shallow: true }
    );
  };

  // Warm the next page in the background so a forward step is instant. Stored
  // under the current filter key so a filter change invalidates it. Best
  // effort — a failed prefetch just means the real load pays the round-trip.
  const prefetchPage = (pageNum: number) => {
    if (pageNum < 1) return;
    if (pageCount != null && pageNum > pageCount) {
      prefetchRef.current = null;
      return;
    }
    const key = filterKey();
    listLocationManagerAssets({ albumId, gpsStatus, page: pageNum, sortOrder, dateFrom, dateTo })
      .then((data) => {
        // Drop it if the filters changed while the request was in flight.
        if (filterKey() === key) prefetchRef.current = { key, page: pageNum, data };
      })
      .catch(() => {
        /* ignore — the on-demand load will fetch it for real */
      });
  };

  // Load one page, replacing the current set (never appending). Returns the
  // response so callers that need the freshly-loaded assets (the "next without
  // GPS" hop) can act on them without waiting for a state flush. Serves from
  // the prefetch cache when it matches, which is what makes forward paging feel
  // instant.
  const loadPage = async (
    pageNum: number,
    opts: { resetSelection?: boolean } = {}
  ): Promise<ILocationManagerAssetsResponse | null> => {
    const { resetSelection = true } = opts;
    const key = filterKey();
    const cached =
      prefetchRef.current && prefetchRef.current.key === key && prefetchRef.current.page === pageNum
        ? prefetchRef.current.data
        : null;

    const apply = (res: ILocationManagerAssetsResponse) => {
      updateContext(resetSelection ? { assets: res.assets, selectedIds: [] } : { assets: res.assets });
      setPage(pageNum);
      setHasMore(res.hasMore);
      // total only comes back on page 1; keep the cached count otherwise.
      if (res.total != null) setTotal(res.total);
      prefetchRef.current = null;
      prefetchPage(pageNum + 1);
    };

    if (cached) {
      apply(cached);
      return cached;
    }

    setLoading(true);
    try {
      const res = await listLocationManagerAssets({ albumId, gpsStatus, page: pageNum, sortOrder, dateFrom, dateTo });
      apply(res);
      return res;
    } catch {
      toast({ title: "Error", description: "Failed to load photos", variant: "destructive" });
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Filter change: reset to page 1 and drop any prefetch from the old filter.
  useEffect(() => {
    if (!router.isReady) return;
    prefetchRef.current = null;
    setTotal(null);
    updateContext({ selectedIds: [], assets: [] });
    loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, albumId, gpsStatus, sortOrder, dateFrom, dateTo]);

  const selectedAssets = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    return assets.filter((a) => selectedSet.has(a.id));
  }, [assets, selectedIds]);

  const imagePins: IImagePin[] = useMemo(
    () =>
      selectedAssets
        .filter((a) => a.latitude != null && a.longitude != null)
        .map((a) => ({ id: a.id, lat: a.latitude!, lng: a.longitude! })),
    [selectedAssets]
  );

  const allPins: IImagePin[] = useMemo(
    () =>
      showAllOnMap
        ? assets
            .filter((a) => a.latitude != null && a.longitude != null)
            .map((a) => ({ id: a.id, lat: a.latitude!, lng: a.longitude! }))
        : [],
    [showAllOnMap, assets]
  );

  // The coordinates all selected images share — or null when mixed/absent.
  const sharedCoords: ILatLng | null = useMemo(() => {
    if (selectedAssets.length === 0) return null;
    const first = selectedAssets[0];
    if (first.latitude == null || first.longitude == null) return null;
    const coords = { lat: first.latitude, lng: first.longitude };
    const allSame = selectedAssets.every(
      (a) =>
        a.latitude != null &&
        a.longitude != null &&
        coordsEqual({ lat: a.latitude, lng: a.longitude }, coords)
    );
    return allSame ? coords : null;
  }, [selectedAssets]);

  // Coordinates of whichever pin is selected (dropped pin or a clicked image pin).
  const selectedPinCoords: ILatLng | null = useMemo(() => {
    if (!selectedPin) return null;
    if (selectedPin.type === "dropped") return droppedPin;
    const pin = imagePins.find((p) => p.id === selectedPin.id);
    return pin ? { lat: pin.lat, lng: pin.lng } : null;
  }, [selectedPin, droppedPin, imagePins]);

  // A clicked image pin whose photo gets deselected is no longer a valid target.
  useEffect(() => {
    if (
      selectedPin?.type === "image" &&
      !imagePins.some((p) => p.id === selectedPin.id)
    ) {
      setSelectedPin(null);
    }
  }, [imagePins, selectedPin]);

  // Keep the Image Coordinates box in sync with the selection (a "Copy Map
  // Location" fill survives until the selection itself changes).
  const selectionSignature = selectedIds.join(",");
  const sharedCoordsKey = sharedCoords ? formatCoordinates(sharedCoords) : "";
  useEffect(() => {
    setImageCoordsDraft(sharedCoordsKey);
    setImageCoordsError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionSignature, sharedCoordsKey]);

  // Keep the Map Coordinates box in sync with the selected pin.
  const selectedPinKey = selectedPinCoords
    ? formatCoordinates(selectedPinCoords)
    : "";
  useEffect(() => {
    setMapCoordsDraft(selectedPinKey);
    setMapCoordsError(false);
  }, [selectedPinKey]);

  // Restore each photo's previous coordinates after a write. Photos that had
  // NO location before can't be reverted — Immich's API rejects null lat/lng
  // (verified against its compiled validation: latitudeSchema is a plain
  // number schema, not nullable), and clearing GPS is out of scope anyway.
  const undoApply = async (entries: Array<[string, ILatLng]>) => {
    setSaving(true);
    try {
      // One bulk call per distinct previous location.
      const groups = new Map<string, { coords: ILatLng; ids: string[] }>();
      for (const [id, coords] of entries) {
        const key = formatCoordinates(coords);
        const group = groups.get(key) ?? { coords, ids: [] };
        group.ids.push(id);
        groups.set(key, group);
      }
      for (const group of groups.values()) {
        for (let i = 0; i < group.ids.length; i += 1000) {
          await updateAssets({
            ids: group.ids.slice(i, i + 1000),
            latitude: group.coords.lat,
            longitude: group.coords.lng,
          });
        }
      }
      const restored = new Map(entries);
      setContextState((prev) => ({
        ...prev,
        assets: prev.assets.map((a) => {
          const coords = restored.get(a.id);
          return coords
            ? { ...a, latitude: coords.lat, longitude: coords.lng }
            : a;
        }),
      }));
      toast({
        title: `Restored the previous location of ${entries.length} ${entries.length === 1 ? "photo" : "photos"}`,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to undo",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const applyCoordinates = async (ids: string[], coords: ILatLng) => {
    if (ids.length === 0) return;
    setSaving(true);
    const idSet = new Set(ids);
    // Snapshot previous coordinates for Undo before overwriting.
    const previous: Array<[string, ILatLng]> = assets
      .filter(
        (a) => idSet.has(a.id) && a.latitude != null && a.longitude != null
      )
      .map((a) => [a.id, { lat: a.latitude!, lng: a.longitude! }]);
    try {
      // One bulk call per 1000 ids — same chunking convention the workflow
      // engine uses against Immich's bulk endpoints.
      for (let i = 0; i < ids.length; i += 1000) {
        await updateAssets({
          ids: ids.slice(i, i + 1000),
          latitude: coords.lat,
          longitude: coords.lng,
        });
      }
      if (gpsStatus === "notSet") {
        // The photos just geotagged no longer match this filter, so the set
        // has shrunk. Reload the current page at the same offset: the fixed
        // ones fall off and the following photos pull up into view, keeping the
        // page full and the offsets honest. The prefetch is now stale, so drop
        // it first.
        setTotal((t) => (t == null ? t : Math.max(0, t - ids.length)));
        prefetchRef.current = null;
        const reloaded = await loadPage(page);
        // If that was the last page and we just cleared it, the same offset now
        // sits past the end — step back so the grid doesn't read "No photos".
        if (reloaded && reloaded.assets.length === 0 && page > 1) {
          await loadPage(page - 1);
        }
      } else {
        setContextState((prev) => ({
          ...prev,
          assets: prev.assets.map((a) =>
            idSet.has(a.id)
              ? { ...a, latitude: coords.lat, longitude: coords.lng }
              : a
          ),
        }));
      }
      const overwritten = previous.length;
      toast({
        title: `Location saved to ${ids.length} ${ids.length === 1 ? "photo" : "photos"}`,
        description:
          overwritten > 0 && overwritten < ids.length
            ? `${formatCoordinates(coords)} — Undo restores the ${overwritten} that already had a location; the rest had none before.`
            : formatCoordinates(coords),
        action:
          overwritten > 0 ? (
            <ToastAction altText="Undo" onClick={() => undoApply(previous)}>
              Undo
            </ToastAction>
          ) : undefined,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to update location",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const canCopyImageLocation =
    selectedAssets.length === 1 &&
    selectedAssets[0].latitude != null &&
    selectedAssets[0].longitude != null;

  const copyImageLocation = () => {
    if (!canCopyImageLocation) return;
    const a = selectedAssets[0];
    const coords = { lat: a.latitude!, lng: a.longitude! };
    setClipboard({ coords, source: "image" });
    // Unified state: the copied location also becomes the candidate pin, so
    // the map (and its coordinates box) always shows what's on the clipboard.
    setDroppedPin(coords);
    setSelectedPin({ type: "dropped" });
    setFlyTo({ coords, ts: Date.now() });
    toast({ title: "Image location copied", description: formatCoordinates(coords) });
    // Copy is a one-shot action against the current selection — clear it so
    // the next click starts a fresh pick rather than reusing this one.
    updateContext({ selectedIds: [] });
  };

  const copyMapLocation = () => {
    if (!selectedPinCoords) return;
    setClipboard({ coords: selectedPinCoords, source: "map" });
    // Unified state: stage it in the Image Coordinates box too, so "Update"
    // becomes an alternative to the Paste button.
    if (selectedIds.length > 0) {
      setImageCoordsDraft(formatCoordinates(selectedPinCoords));
      setImageCoordsError(false);
    }
    toast({
      title: "Map location copied",
      description: formatCoordinates(selectedPinCoords),
    });
  };

  const pasteLocation = () => {
    if (!clipboard || selectedIds.length === 0) return;
    applyCoordinates(selectedIds, clipboard.coords);
    // Paste is a one-shot action against the current selection — clear it so
    // the next click starts a fresh pick rather than reusing this one.
    updateContext({ selectedIds: [] });
  };

  const handleUpdateClick = () => {
    const parsed = parseCoordinates(imageCoordsDraft);
    if (!parsed) {
      setImageCoordsError(true);
      return;
    }
    setImageCoordsError(false);
    setPendingUpdateCoords(parsed);
    updateConfirmRef.current?.open();
  };

  const confirmUpdate = () => {
    if (pendingUpdateCoords) applyCoordinates(selectedIds, pendingUpdateCoords);
  };

  const commitMapCoordinates = () => {
    if (!mapCoordsDraft.trim()) return;
    const parsed = parseCoordinates(mapCoordsDraft);
    if (!parsed) {
      setMapCoordsError(true);
      return;
    }
    setMapCoordsError(false);
    // Editing the box always moves the candidate (dropped) pin. If an image
    // pin was selected, the edit detaches into the dropped pin instead of
    // desyncing the image pin from what's actually stored on the photo.
    setDroppedPin(parsed);
    setSelectedPin({ type: "dropped" });
    setFlyTo({ coords: parsed, ts: Date.now() });
  };

  const handleMapClick = (coords: ILatLng) => {
    // Only one candidate pin at a time — a new drop replaces the old one.
    setDroppedPin(coords);
    setSelectedPin({ type: "dropped" });
  };

  const handleSearchSelect = (result: { name: string } & ILatLng) => {
    const coords = { lat: result.lat, lng: result.lng };
    setDroppedPin(coords);
    setSelectedPin({ type: "dropped" });
    setFlyTo({ coords, zoom: 14, ts: Date.now() });
  };

  const handleApplyFavorite = (favorite: ILocationFavorite) => {
    applyCoordinates(selectedIds, {
      lat: favorite.latitude,
      lng: favorite.longitude,
    });
  };

  const handleQuickAdd = async () => {
    const name = quickAddName.trim();
    if (!name || !selectedPinCoords) return;
    if (await favoritesState.add(name, selectedPinCoords)) {
      setQuickAddOpen(false);
      setQuickAddName("");
    }
  };

  // The quick-add form saves the selected pin — close it if that pin goes away.
  useEffect(() => {
    if (!selectedPinCoords) setQuickAddOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPinCoords === null]);

  const handleShowFavoriteOnMap = (favorite: ILocationFavorite) => {
    const coords = { lat: favorite.latitude, lng: favorite.longitude };
    setDroppedPin(coords);
    setSelectedPin({ type: "dropped" });
    setFlyTo({ coords, zoom: 14, ts: Date.now() });
  };

  // Flash a photo and scroll it into view. Used by map-pin clicks (the target
  // is already on-screen) and by the "next without GPS" stepper (the target may
  // be on a page that just loaded). The scroll is deferred two frames so it
  // runs after the new page has committed and painted — otherwise the element
  // wouldn't exist yet and the scroll would silently no-op.
  const flashPhoto = (id: string) => {
    setFlashedAssetId(id);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-asset-id="${id}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      })
    );
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashedAssetId(null), 1800);
  };

  const noGps = (a: { latitude?: number | null; longitude?: number | null }) =>
    a.latitude == null || a.longitude == null;

  // Photos without GPS on the current page, in grid order — what Back/Forward
  // step through within a page before crossing to the next one.
  const missingGpsAssets = useMemo(() => assets.filter(noGps), [assets]);

  const [jumping, setJumping] = useState(false);

  // Select a missing-GPS photo and reveal it on the map.
  const pickMissing = (target: { id: string }) => {
    updateContext({ selectedIds: [target.id] });
    flashPhoto(target.id);
  };

  // Load consecutive pages in `direction` until one contains a missing-GPS
  // photo, then select it (the first one going forward, the last going back).
  // Under "Location Not Set" every photo qualifies, so this stops on the very
  // next page; under "All" a page can be all-GPS, so it may skip a few. Bounded
  // by hasMore / page 1, so it always terminates.
  const advanceAcrossPages = async (startPage: number, direction: 1 | -1) => {
    let target = startPage;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await loadPage(target);
      if (!res) return; // load failed; toast already shown
      const missing = res.assets.filter(noGps);
      if (missing.length) {
        pickMissing(direction === 1 ? missing[0] : missing[missing.length - 1]);
        return;
      }
      if (direction === 1) {
        if (!res.hasMore) {
          toast({ title: "No more photos without GPS", description: "You've reached the end." });
          return;
        }
        target += 1;
      } else {
        if (target <= 1) {
          toast({ title: "No earlier photos without GPS", description: "You're at the start." });
          return;
        }
        target -= 1;
      }
    }
  };

  // Step to the next/previous photo without GPS. Stays on the current page when
  // it can; when the step runs off the page edge it pages the grid (forward or
  // back) to the next page that has one — so a long geotagging pass never
  // stalls at a page boundary. Does not wrap around the whole library.
  const jumpToMissingGps = async (direction: 1 | -1) => {
    if (jumping) return;
    const anchorId = selectedIds[0];
    const anchorIndex = anchorId ? missingGpsAssets.findIndex((a) => a.id === anchorId) : -1;

    // No anchor on this page: start from the near end of the current page if it
    // has any missing-GPS photos, otherwise fall through to a page hop.
    if (anchorIndex === -1 && missingGpsAssets.length > 0) {
      pickMissing(direction === 1 ? missingGpsAssets[0] : missingGpsAssets[missingGpsAssets.length - 1]);
      return;
    }

    const nextIndex = anchorIndex + direction;
    if (nextIndex >= 0 && nextIndex < missingGpsAssets.length) {
      pickMissing(missingGpsAssets[nextIndex]);
      return;
    }

    // Off the edge of this page — cross into an adjacent page.
    setJumping(true);
    try {
      if (direction === 1) {
        if (!hasMore) {
          toast({ title: "No more photos without GPS", description: "You've reached the end." });
          return;
        }
        await advanceAcrossPages(page + 1, 1);
      } else {
        if (page <= 1) {
          toast({ title: "No earlier photos without GPS", description: "You're at the start." });
          return;
        }
        await advanceAcrossPages(page - 1, -1);
      }
    } finally {
      setJumping(false);
    }
  };

  // Per-thumbnail overlays: green/red GPS chip (bottom-left) and an expand
  // button (bottom-right) that opens the large preview — clicking the photo
  // itself selects it and shows its pin on the map.
  const renderThumbnailExtras = (
    photo: AssetPhoto,
    actions: { openPreview: () => void }
  ) => {
    const hasGps = photo.latitude != null && photo.longitude != null;
    return (
      <>
        <div
          className={`absolute bottom-1 left-1 flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium text-white pointer-events-none ${
            hasGps ? "bg-green-600/85" : "bg-red-600/85"
          }`}
        >
          {hasGps ? <Check size={10} /> : <X size={10} />} GPS
        </div>
        <button
          type="button"
          title="Preview"
          className={`absolute right-1 bg-black/60 hover:bg-black/80 p-1 rounded ${
            photo.isVideo ? "bottom-8" : "bottom-1"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            actions.openPreview();
          }}
        >
          <Expand className="h-3.5 w-3.5 text-white" />
        </button>
      </>
    );
  };

  const pasteLabel = clipboard
    ? clipboard.source === "image"
      ? "Paste Image GPS"
      : "Paste Map GPS"
    : "Paste GPS";

  const hasDateFilter = !!(dateFrom || dateTo);
  const hasAnyFilter = !!(albumId || gpsStatus !== "all" || hasDateFilter);
  const canApplyFavorite = favorites.length > 0 && selectedIds.length > 0;

  return (
    <PageLayout className="!p-0 !mb-0 relative">
      <Header
        leftComponent={
          <div className="flex items-baseline gap-2">
            <span>GPS Manager</span>
            {total != null && (
              <span className="text-xs font-normal text-muted-foreground whitespace-nowrap">
                {total.toLocaleString()}{" "}
                {gpsStatus === "notSet"
                  ? "without location"
                  : gpsStatus === "set"
                    ? "with location"
                    : "photos"}
              </span>
            )}
          </div>
        }
        rightComponent={
          <div className="flex items-center gap-2">
            <AlbumDropdown
              albumIds={albumId ? [albumId] : []}
              onChange={(albumIds) => setFilters({ albumId: albumIds?.[0] })}
            />
            <Tabs
              value={gpsStatus}
              onValueChange={(value) =>
                setFilters({ gpsStatus: value === "all" ? undefined : value })
              }
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="set">
                  <Check size={14} className="mr-1 text-green-600" /> GPS
                </TabsTrigger>
                <TabsTrigger value="notSet">
                  <X size={14} className="mr-1 text-red-600" /> GPS
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={hasDateFilter ? "default" : "outline"}
                  size="sm"
                  title="Filter by date taken"
                >
                  <CalendarIcon size={16} />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">
                  Taken between
                </Label>
                <Input
                  type="date"
                  value={dateFrom ?? ""}
                  onChange={(e) =>
                    setFilters({ dateFrom: e.target.value || undefined })
                  }
                />
                <Input
                  type="date"
                  value={dateTo ?? ""}
                  onChange={(e) =>
                    setFilters({ dateTo: e.target.value || undefined })
                  }
                />
                {hasDateFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setFilters({ dateFrom: undefined, dateTo: undefined })
                    }
                  >
                    Clear dates
                  </Button>
                )}
              </PopoverContent>
            </Popover>
            <Button
              variant="default"
              size="sm"
              title={sortOrder === "asc" ? "Oldest first" : "Newest first"}
              onClick={() =>
                setFilters({ sortOrder: sortOrder === "asc" ? "desc" : "asc" })
              }
            >
              {sortOrder === "asc" ? <SortAsc size={16} /> : <SortDesc size={16} />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              title="Clear filters"
              disabled={!hasAnyFilter}
              onClick={() =>
                setFilters({
                  albumId: undefined,
                  gpsStatus: undefined,
                  dateFrom: undefined,
                  dateTo: undefined,
                })
              }
            >
              <X size={16} />
            </Button>
          </div>
        }
      />
      <PhotoSelectionContext.Provider value={contextState}>
        <div
          className="flex flex-col lg:flex-row"
          style={{ height: "calc(100vh - 60px)" }}
        >
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {/* Always visible — never hidden by selection state. */}
            <div className="shrink-0 border-b bg-background px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Next/previous photo without GPS — far left */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    title="Previous photo without GPS (steps back a page if needed)"
                    disabled={jumping || gpsStatus === "set" || (missingGpsAssets.length === 0 && page <= 1)}
                    onClick={() => jumpToMissingGps(-1)}
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    title="Next photo without GPS (advances a page if needed)"
                    disabled={jumping || gpsStatus === "set" || (missingGpsAssets.length === 0 && !hasMore)}
                    onClick={() => jumpToMissingGps(1)}
                  >
                    <ChevronRight size={16} />
                  </Button>
                </div>
                {/* Selection controls — always visible; disabled when the
                    action would be a no-op. */}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!assets.length || selectedIds.length === assets.length}
                  onClick={() =>
                    updateContext({ selectedIds: assets.map((a) => a.id) })
                  }
                >
                  Select all
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selectedIds.length}
                  onClick={() => updateContext({ selectedIds: [] })}
                >
                  Deselect all
                </Button>
                {selectedIds.length > 0 && (
                  <p className="text-sm text-muted-foreground whitespace-nowrap">
                    {selectedIds.length} Selected
                  </p>
                )}
              </div>
              {/* Show all on map — far right */}
              <div className="flex items-center gap-1.5">
                <Switch
                  id="show-all-on-map"
                  checked={showAllOnMap}
                  onCheckedChange={setShowAllOnMap}
                />
                <Label
                  htmlFor="show-all-on-map"
                  className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap"
                >
                  Show all on map
                </Label>
              </div>
            </div>
            {selectedIds.length > 0 && (
              <div className="shrink-0 border-b bg-background px-3 py-2 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canCopyImageLocation}
                      title="Copy this image's coordinates"
                      className={activeButtonClass(canCopyImageLocation, "green")}
                      onClick={copyImageLocation}
                    >
                      <ClipboardCopy size={14} className="mr-1" /> Copy Image GPS
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!clipboard || selectedIds.length === 0 || saving}
                      title="Apply the copied coordinates to all selected images"
                      className={activeButtonClass(!!clipboard, "blue")}
                      onClick={pasteLocation}
                    >
                      <ClipboardPaste size={14} className="mr-1" /> {pasteLabel}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      Image GPS
                    </span>
                    <Input
                      value={imageCoordsDraft}
                      disabled={selectedIds.length === 0}
                      placeholder={
                        selectedIds.length === 0
                          ? "Select images first"
                          : "lat, long"
                      }
                      className={`w-40 h-9 text-sm shrink-0 ${imageCoordsError ? "border-destructive" : ""}`}
                      onChange={(e) => {
                        setImageCoordsDraft(e.target.value);
                        setImageCoordsError(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleUpdateClick();
                      }}
                    />
                    <Button
                      size="sm"
                      className="shrink-0"
                      title="Update Image Coordinates"
                      disabled={
                        !imageCoordsDraft.trim() ||
                        selectedIds.length === 0 ||
                        saving
                      }
                      onClick={handleUpdateClick}
                    >
                      {saving ? "Updating..." : "Update"}
                    </Button>
                    <AlertDialog
                      ref={updateConfirmRef}
                      title="Update location?"
                      description={`Set the location of ${selectedIds.length} selected photo${selectedIds.length === 1 ? "" : "s"} to ${pendingUpdateCoords ? formatCoordinates(pendingUpdateCoords) : imageCoordsDraft}. This can't be undone automatically for photos that had no location before.`}
                      onConfirm={confirmUpdate}
                    />
                  </div>
                </div>
                {imageCoordsError && (
                  <p className="text-xs text-destructive">
                    Couldn&apos;t read those coordinates — try &quot;latitude, longitude&quot;.
                  </p>
                )}
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex h-full w-full items-center justify-center">
                  <Loader2 className="animate-spin text-muted-foreground" />
                </div>
              ) : assets.length === 0 ? (
                <div className="flex flex-col gap-2 h-full justify-center items-center w-full">
                  <p className="text-lg">No photos match these filters</p>
                  <p className="text-sm text-muted-foreground">
                    Try a different album, GPS status, or date range.
                  </p>
                </div>
              ) : (
                <>
                  <AssetGrid
                    assets={assets}
                    selectable
                    clickToSelect
                    renderExtras={renderThumbnailExtras}
                    onPhotoHover={setHoveredAssetId}
                    highlightedAssetId={flashedAssetId}
                  />
                  <div className="flex flex-wrap items-center justify-center gap-3 py-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || loading}
                      onClick={() => loadPage(page - 1)}
                    >
                      <ChevronLeft size={16} className="mr-1" /> Previous
                    </Button>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {total != null && total > 0
                        ? `${((page - 1) * LOCATION_MANAGER_PAGE_SIZE + 1).toLocaleString()}–${(
                            (page - 1) * LOCATION_MANAGER_PAGE_SIZE + assets.length
                          ).toLocaleString()} of ${total.toLocaleString()}`
                        : `${assets.length} item${assets.length === 1 ? "" : "s"}`}
                      {pageCount != null ? ` · page ${page.toLocaleString()} of ${pageCount.toLocaleString()}` : ""}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!hasMore || loading}
                      onClick={() => loadPage(page + 1)}
                    >
                      Next <ChevronRight size={16} className="ml-1" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="w-full lg:w-[440px] xl:w-[500px] shrink-0 border-t lg:border-t-0 lg:border-l flex flex-col h-[50vh] lg:h-auto">
            {/* Top section: favourites + paste */}
            <div className="flex flex-col gap-3 p-3 bg-muted/30 border-b-2 border-border">
              <div className="flex items-center gap-2 flex-wrap">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canApplyFavorite || saving}
                      title={
                        favorites.length === 0
                          ? "No favourites saved yet"
                          : selectedIds.length === 0
                            ? "Select photos first"
                            : "Apply a favourite location to the selected photos"
                      }
                      className={activeButtonClass(canApplyFavorite, "green")}
                    >
                      <Star size={14} className="mr-1" /> Apply favourite
                      <ChevronDown size={14} className="ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {favorites.map((favorite) => (
                      <DropdownMenuItem
                        key={favorite.id}
                        onSelect={() => handleApplyFavorite(favorite)}
                      >
                        {favorite.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Popover open={quickAddOpen} onOpenChange={setQuickAddOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!selectedPinCoords}
                      title={
                        selectedPinCoords
                          ? "Save the selected pin as a favourite"
                          : "Drop or select a pin on the map first"
                      }
                      className={activeButtonClass(!!selectedPinCoords, "green")}
                    >
                      <Plus size={14} className="mr-1" /> Create Favourite
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 flex flex-col gap-2">
                    <Label className="text-xs text-muted-foreground">
                      Name this location
                      {selectedPinCoords
                        ? ` (${formatCoordinates(selectedPinCoords)})`
                        : ""}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        autoFocus
                        value={quickAddName}
                        placeholder="e.g. Home"
                        className="h-9 text-sm"
                        onChange={(e) => setQuickAddName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleQuickAdd();
                          if (e.key === "Escape") setQuickAddOpen(false);
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-9 shrink-0"
                        disabled={!quickAddName.trim() || favoritesState.busy}
                        onClick={handleQuickAdd}
                      >
                        Save
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <FavoritesSheet
                  favorites={favoritesState.favorites}
                  loading={favoritesState.loading}
                  busy={favoritesState.busy}
                  selectedCount={selectedIds.length}
                  applying={saving}
                  onRename={favoritesState.rename}
                  onDelete={favoritesState.remove}
                  onReorder={favoritesState.reorder}
                  onApply={handleApplyFavorite}
                  onShowOnMap={handleShowFavoriteOnMap}
                />
              </div>
            </div>

            {/* Bottom section: search + map coordinates + map */}
            <div className="flex flex-col flex-1 min-h-0">
              <div className="p-3 flex flex-col gap-3 border-b">
                <LocationSearchBox onSelect={handleSearchSelect} />
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">
                    Map Coordinates (Selected)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={mapCoordsDraft}
                      placeholder="Click the map, search, or type lat, long"
                      className={mapCoordsError ? "border-destructive" : ""}
                      onChange={(e) => {
                        setMapCoordsDraft(e.target.value);
                        setMapCoordsError(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitMapCoordinates();
                      }}
                      onBlur={() => {
                        if (mapCoordsDraft !== selectedPinKey) commitMapCoordinates();
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className={`shrink-0 ${activeButtonClass(!!selectedPinCoords, "green")}`}
                      disabled={!selectedPinCoords}
                      title="Copy the selected pin's coordinates"
                      onClick={copyMapLocation}
                    >
                      <ClipboardCopy size={14} className="mr-1" /> Copy Map GPS
                    </Button>
                  </div>
                  {mapCoordsError && (
                    <p className="text-xs text-destructive">
                      Couldn&apos;t read those coordinates — try &quot;latitude, longitude&quot;.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <LocationManagerMap
                  imagePins={imagePins}
                  allPins={allPins}
                  droppedPin={droppedPin}
                  selectedPin={selectedPin}
                  highlightedAssetId={hoveredAssetId}
                  isDarkMode={theme === "dark"}
                  onMapClick={handleMapClick}
                  onImagePinClick={(id) => {
                    setSelectedPin({ type: "image", id });
                    flashPhoto(id);
                  }}
                  onAllPinClick={flashPhoto}
                  onDroppedPinClick={() => setSelectedPin({ type: "dropped" })}
                  flyTo={flyTo}
                />
              </div>
            </div>
          </div>
        </div>
      </PhotoSelectionContext.Provider>
    </PageLayout>
  );
}
