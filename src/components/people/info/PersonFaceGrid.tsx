import { ASSET_THUMBNAIL_PATH } from "@/config/routes";
import { listPersonFaceClusters, searchPeople, unmergeFaces } from "@/handlers/api/people.handler";
import { IFace, IFaceCluster, IFaceClustersResponse, IPerson } from "@/types/person";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import React, { useEffect, useState } from "react";
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

function FaceCropThumb({ face }: { face: IFace }) {
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
    <div className="relative w-full aspect-square rounded-md overflow-hidden">
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
  index: number;
}

function ClusterCard({ cluster, selected, onToggle, index }: ClusterCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border-2 p-3 cursor-pointer transition-all",
        selected
          ? "border-blue-500 ring-2 ring-blue-500/30 bg-blue-500/5"
          : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500"
      )}
      onClick={() => onToggle(cluster)}
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
      <div className="grid grid-cols-3 gap-1">
        {cluster.previewFaces.map((face) => (
          <FaceCropThumb key={face.id} face={face} />
        ))}
      </div>
      {cluster.count > cluster.previewFaces.length && (
        <p className="text-[11px] text-gray-500 mt-1 text-center">
          +{cluster.count - cluster.previewFaces.length} more
        </p>
      )}
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
  const [searchResults, setSearchResults] = useState<IPerson[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [threshold, setThreshold] = useState(0.65);
  const { toast } = useToast();

  const fetchClusters = () => {
    setLoading(true);
    listPersonFaceClusters(personId, threshold)
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
  }, [personId, threshold]);

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

  const handleUnmerge = (targetPersonId?: string) => {
    setUnmerging(true);
    unmergeFaces(personId, selectedFaceIds, targetPersonId)
      .then((result) => {
        toast({
          title: "Success",
          description: `Moved ${result.moved} face(s) to ${targetPersonId ? "selected" : "a new"} person`,
        });
        setDialogOpen(false);
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

  if (loading) return <Loader />;

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
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="w-20 h-7 text-xs"
            />
          </div>
          {selectedClusters.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDialogOpen(true)}
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
          />
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unmerge Faces</DialogTitle>
            <DialogDescription>
              Move {selectedFaceCount} face{selectedFaceCount !== 1 ? "s" : ""} from{" "}
              {selectedClusters.size} cluster{selectedClusters.size !== 1 ? "s" : ""} away
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
    </div>
  );
}
