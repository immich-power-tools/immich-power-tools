import "yet-another-react-lightbox/styles.css";

import { ASSET_THUMBNAIL_PATH, ASSET_PREVIEW_PATH } from "@/config/routes";
import { listPersonFaceClusters, searchPeople, unmergeFaces } from "@/handlers/api/people.handler";
import { IFace, IFaceCluster, IFaceClustersResponse, IPerson } from "@/types/person";
import { cn } from "@/lib/utils";
import { ArrowLeft, Check, ExternalLink, Eye } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import Loader from "@/components/ui/loader";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { useConfig } from "@/contexts/ConfigContext";
import Lightbox from "yet-another-react-lightbox";

function FaceCropThumb({ face, onClick }: { face: IFace; onClick?: () => void }) {
  const thumbUrl = ASSET_THUMBNAIL_PATH(face.assetId);

  const faceW = face.boundingBoxX2 - face.boundingBoxX1;
  const faceH = face.boundingBoxY2 - face.boundingBoxY1;
  const faceCX = face.boundingBoxX1 + faceW / 2;
  const faceCY = face.boundingBoxY1 + faceH / 2;

  const pad = 0.3;
  const cropW = faceW * (1 + pad * 2);
  const cropH = faceH * (1 + pad * 2);

  const scaleX = face.imageWidth / cropW;
  const scaleY = face.imageHeight / cropH;
  const scale = Math.min(scaleX, scaleY);

  const objPosX = (faceCX / face.imageWidth) * 100;
  const objPosY = (faceCY / face.imageHeight) * 100;

  return (
    <div
      className={cn(
        "relative w-full aspect-square rounded-md overflow-hidden",
        onClick && "cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all"
      )}
      onClick={onClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbUrl}
        alt={face.originalFileName}
        className="absolute inset-0 w-full h-full"
        style={{
          objectFit: "cover",
          objectPosition: `${objPosX}% ${objPosY}%`,
          transform: `scale(${scale})`,
          transformOrigin: `${objPosX}% ${objPosY}%`,
        }}
      />
    </div>
  );
}

interface ClusterCardProps {
  cluster: IFaceCluster;
  selected: boolean;
  onToggle: (cluster: IFaceCluster) => void;
  onOpen: (cluster: IFaceCluster) => void;
  index: number;
}

function ClusterCard({ cluster, selected, onToggle, onOpen, index }: ClusterCardProps) {
  const previewFaces = cluster.faces.slice(0, 6);

  return (
    <div
      className={cn(
        "rounded-lg border-2 p-3 transition-all",
        selected
          ? "border-blue-500 ring-2 ring-blue-500/30 bg-blue-500/5"
          : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">
          Cluster {index + 1}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {cluster.count} face{cluster.count !== 1 ? "s" : ""}
          </span>
          {selected && (
            <div className="bg-blue-500 rounded-full p-0.5">
              <Check className="w-3 h-3 text-white" />
            </div>
          )}
        </div>
      </div>
      <div
        className="grid grid-cols-3 gap-1 cursor-pointer"
        onClick={() => onOpen(cluster)}
      >
        {previewFaces.map((face) => (
          <FaceCropThumb key={face.id} face={face} />
        ))}
      </div>
      <div className="flex items-center justify-between mt-2">
        {cluster.count > previewFaces.length ? (
          <button
            className="text-[11px] text-blue-500 hover:text-blue-600 hover:underline"
            onClick={() => onOpen(cluster)}
          >
            +{cluster.count - previewFaces.length} more
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1">
          <button
            className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            onClick={() => onOpen(cluster)}
            title="Explore cluster"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            className={cn(
              "p-1 rounded transition-colors",
              selected
                ? "bg-blue-500 text-white hover:bg-blue-600"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            )}
            onClick={() => onToggle(cluster)}
            title={selected ? "Deselect cluster" : "Select cluster"}
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface ClusterDetailViewProps {
  cluster: IFaceCluster;
  index: number;
  onBack: () => void;
  onRequestUnmerge: (faceIds: string[]) => void;
  exImmichUrl: string;
  personName: string;
}

function ClusterDetailView({ cluster, index, onBack, onRequestUnmerge, exImmichUrl, personName }: ClusterDetailViewProps) {
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [selectedFaces, setSelectedFaces] = useState<Set<string>>(new Set());

  const slides = useMemo(() => {
    return cluster.faces.map((face) => ({
      src: ASSET_PREVIEW_PATH(face.assetId),
      width: face.imageWidth,
      height: face.imageHeight,
    }));
  }, [cluster.faces]);

  const toggleFace = (faceId: string) => {
    setSelectedFaces((prev) => {
      const next = new Set(prev);
      if (next.has(faceId)) {
        next.delete(faceId);
      } else {
        next.add(faceId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedFaces(new Set(cluster.faceIds));
  };

  const selectNone = () => {
    setSelectedFaces(new Set());
  };

  const allSelected = selectedFaces.size === cluster.faceIds.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <span className="text-lg font-medium">Cluster {index + 1}</span>
          <span className="text-sm text-gray-500">
            {cluster.count} face{cluster.count !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={allSelected ? selectNone : selectAll}
          >
            {allSelected ? "Deselect All" : "Select All"}
          </Button>
          {selectedFaces.size > 0 ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onRequestUnmerge(Array.from(selectedFaces))}
            >
              Unmerge {selectedFaces.size} Face{selectedFaces.size !== 1 ? "s" : ""}
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onRequestUnmerge(cluster.faceIds)}
            >
              Unmerge All
            </Button>
          )}
        </div>
      </div>

      {selectedFaces.size > 0 && (
        <p className="text-sm text-gray-500">
          {selectedFaces.size} of {cluster.count} faces selected.
          Click faces to toggle selection, or use the buttons above.
        </p>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
        {cluster.faces.map((face, faceIdx) => {
          const isSelected = selectedFaces.has(face.id);
          return (
            <div
              key={face.id}
              className={cn(
                "group relative rounded-md overflow-hidden transition-all",
                isSelected && "ring-2 ring-blue-500 ring-offset-1"
              )}
            >
              <FaceCropThumb
                face={face}
                onClick={() => {
                  if (selectedFaces.size > 0) {
                    toggleFace(face.id);
                  } else {
                    setLightboxIndex(faceIdx);
                  }
                }}
              />
              {/* Selection checkbox overlay */}
              <button
                className={cn(
                  "absolute top-1 left-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                  isSelected
                    ? "bg-blue-500 border-blue-500"
                    : "border-white/70 bg-black/20 opacity-0 group-hover:opacity-100"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFace(face.id);
                }}
              >
                {isSelected && <Check className="w-3 h-3 text-white" />}
              </button>
              {/* Action buttons overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex justify-center gap-1">
                  <button
                    className="p-1 rounded bg-white/20 hover:bg-white/40 text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex(faceIdx);
                    }}
                    title="View full photo"
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                  {exImmichUrl && (
                    <a
                      href={`${exImmichUrl}/photos/${face.assetId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded bg-white/20 hover:bg-white/40 text-white"
                      onClick={(e) => e.stopPropagation()}
                      title="Open in Immich"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Lightbox
        slides={slides}
        open={lightboxIndex >= 0}
        index={lightboxIndex}
        close={() => setLightboxIndex(-1)}
      />
    </div>
  );
}

interface PersonFaceGridProps {
  personId: string;
  personName: string;
}

export default function PersonFaceGrid({ personId, personName }: PersonFaceGridProps) {
  const [data, setData] = useState<IFaceClustersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedClusters, setSelectedClusters] = useState<Set<number>>(new Set());
  const [unmerging, setUnmerging] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogFaceIds, setDialogFaceIds] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<IPerson[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [threshold, setThreshold] = useState(0.65);
  const [debouncedThreshold, setDebouncedThreshold] = useState(0.65);
  const [openClusterId, setOpenClusterId] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();
  const { exImmichUrl } = useConfig();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleThresholdChange = useCallback((value: number) => {
    setThreshold(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedThreshold(value), 500);
  }, []);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const fetchClusters = () => {
    setLoading(true);
    listPersonFaceClusters(personId, debouncedThreshold)
      .then((result) => {
        setData(result);
        setSelectedClusters(new Set());
      })
      .catch(() => {
        toast({ title: "Error", description: "Failed to load face clusters" });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchClusters();
  }, [personId, debouncedThreshold]);

  const clusters = data?.clusters || [];

  const toggleCluster = (cluster: IFaceCluster) => {
    setSelectedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(cluster.clusterId)) {
        next.delete(cluster.clusterId);
      } else {
        next.add(cluster.clusterId);
      }
      return next;
    });
  };

  const selectedFaceIds = clusters
    .filter((c) => selectedClusters.has(c.clusterId))
    .flatMap((c) => c.faceIds);

  const selectedFaceCount = selectedFaceIds.length;

  const openUnmergeDialog = (faceIds: string[]) => {
    setDialogFaceIds(faceIds);
    if (faceIds.length > 1) {
      setConfirmOpen(true);
    } else {
      setDialogOpen(true);
    }
  };

  const confirmAndProceed = () => {
    setConfirmOpen(false);
    setDialogOpen(true);
  };

  const handleUnmerge = (targetPersonId?: string) => {
    setUnmerging(true);
    unmergeFaces(personId, dialogFaceIds, targetPersonId)
      .then((result) => {
        toast({
          title: "Success",
          description: `Moved ${result.moved} face(s) to ${targetPersonId ? "selected" : "a new"} person`,
        });
        setDialogOpen(false);
        setOpenClusterId(null);
        fetchClusters();
      })
      .catch(() => {
        toast({
          title: "Error",
          description: "Failed to unmerge faces",
          variant: "destructive",
        });
      })
      .finally(() => setUnmerging(false));
  };

  const handleSearch = (value: string) => {
    if (!value.trim()) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    searchPeople(value)
      .then(setSearchResults)
      .finally(() => setSearchLoading(false));
  };

  const confirmDialog = (
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Unmerge</DialogTitle>
          <DialogDescription>
            You are about to unmerge {dialogFaceIds.length} faces from {personName || "this person"}.
            This will reassign them to a different person.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmAndProceed}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const unmergeDialog = (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unmerge Faces</DialogTitle>
          <DialogDescription>
            Move {dialogFaceIds.length} face{dialogFaceIds.length !== 1 ? "s" : ""} away
            from {personName || "this person"}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Move to an existing person (search below) or create a new one:</p>
          <Input
            placeholder="Search for a person..."
            onChange={(e) => handleSearch(e.target.value)}
          />
          {searchLoading && <Loader />}
          {searchResults && searchResults.length > 0 && (
            <div className="max-h-[200px] overflow-y-auto flex flex-col gap-1">
              {searchResults
                .filter((p) => p.id !== personId)
                .map((p) => (
                  <button
                    key={p.id}
                    className="flex items-center gap-2 p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
                    onClick={() => handleUnmerge(p.id)}
                    disabled={unmerging}
                  >
                    <Avatar
                      src={p.thumbnailPath}
                      alt={p.name || "Unknown"}
                      className="w-8 h-8"
                    />
                    <span className="text-sm">{p.name || "Unnamed person"}</span>
                  </button>
                ))}
            </div>
          )}
          {searchResults && searchResults.length === 0 && (
            <p className="text-sm text-gray-500">No people found.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => handleUnmerge()}
            disabled={unmerging}
          >
            {unmerging ? "Moving..." : "Create New Person"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (loading) return <Loader />;

  // Show cluster detail view when a cluster is opened
  if (openClusterId !== null) {
    const clusterIdx = clusters.findIndex((c) => c.clusterId === openClusterId);
    const cluster = clusters[clusterIdx];
    if (cluster) {
      return (
        <>
          <ClusterDetailView
            cluster={cluster}
            index={clusterIdx}
            onBack={() => setOpenClusterId(null)}
            onRequestUnmerge={openUnmergeDialog}
            exImmichUrl={exImmichUrl}
            personName={personName}
          />
          {confirmDialog}
          {unmergeDialog}
        </>
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="text-lg font-medium">Face Clusters</span>
          <span className="text-sm text-gray-500">
            {data?.totalFaces} faces in {clusters.length} cluster{clusters.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-gray-500">Threshold</Label>
            <Input
              type="number"
              step="0.05"
              min="0.3"
              max="0.95"
              value={threshold}
              onChange={(e) => handleThresholdChange(parseFloat(e.target.value))}
              className="w-20 h-7 text-xs"
            />
          </div>
          {selectedClusters.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => openUnmergeDialog(selectedFaceIds)}
              disabled={unmerging}
            >
              Unmerge {selectedFaceCount} Face{selectedFaceCount !== 1 ? "s" : ""}
            </Button>
          )}
        </div>
      </div>

      {clusters.length <= 1 ? (
        <p className="text-sm text-gray-500">
          {clusters.length === 0
            ? "No faces found for this person."
            : "All faces belong to a single cluster. Try lowering the threshold to split them."}
        </p>
      ) : (
        <p className="text-sm text-gray-500">
          Select the cluster(s) that don&apos;t belong to {personName || "this person"}, then click Unmerge.
          Click a cluster to explore all photos within it.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {clusters.map((cluster, i) => (
          <ClusterCard
            key={cluster.clusterId}
            cluster={cluster}
            index={i}
            selected={selectedClusters.has(cluster.clusterId)}
            onToggle={toggleCluster}
            onOpen={(c) => setOpenClusterId(c.clusterId)}
          />
        ))}
      </div>

      {confirmDialog}
      {unmergeDialog}
    </div>
  );
}
