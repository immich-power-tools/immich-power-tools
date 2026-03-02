import { ASSET_THUMBNAIL_PATH } from "@/config/routes";
import { listPersonFaces, searchPeople, unmergeFaces } from "@/handlers/api/people.handler";
import { IFace, IPerson } from "@/types/person";
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

interface FaceCropProps {
  face: IFace;
  selected: boolean;
  onToggle: (face: IFace) => void;
}

function FaceCrop({ face, selected, onToggle }: FaceCropProps) {
  const thumbUrl = ASSET_THUMBNAIL_PATH(face.assetId);

  // Calculate cropping percentages from bounding box
  const faceW = face.boundingBoxX2 - face.boundingBoxX1;
  const faceH = face.boundingBoxY2 - face.boundingBoxY1;
  const faceCX = face.boundingBoxX1 + faceW / 2;
  const faceCY = face.boundingBoxY1 + faceH / 2;

  // Add padding around the face (30% extra on each side)
  const pad = 0.3;
  const cropW = faceW * (1 + pad * 2);
  const cropH = faceH * (1 + pad * 2);

  // Scale: how much to enlarge the image so the crop fills the container
  const scaleX = face.imageWidth / cropW;
  const scaleY = face.imageHeight / cropH;
  const scale = Math.min(scaleX, scaleY);

  // Object position: center the face in the container
  const objPosX = (faceCX / face.imageWidth) * 100;
  const objPosY = (faceCY / face.imageHeight) * 100;

  return (
    <div
      className={cn(
        "relative w-full aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all",
        selected
          ? "border-blue-500 ring-2 ring-blue-500/30"
          : "border-transparent hover:border-zinc-400"
      )}
      onClick={() => onToggle(face)}
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
      {selected && (
        <div className="absolute top-1 right-1 bg-blue-500 rounded-full p-0.5">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1 py-0.5 truncate">
        {face.originalFileName}
      </div>
    </div>
  );
}

interface PersonFaceGridProps {
  personId: string;
  personName: string;
}

export default function PersonFaceGrid({ personId, personName }: PersonFaceGridProps) {
  const [faces, setFaces] = useState<IFace[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFaces, setSelectedFaces] = useState<Set<string>>(new Set());
  const [unmerging, setUnmerging] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<IPerson[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const { toast } = useToast();

  const fetchFaces = () => {
    setLoading(true);
    listPersonFaces(personId)
      .then((data) => {
        setFaces(data);
        setSelectedFaces(new Set());
      })
      .catch(() => {
        toast({ title: "Error", description: "Failed to load faces" });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFaces();
  }, [personId]);

  const toggleFace = (face: IFace) => {
    setSelectedFaces((prev) => {
      const next = new Set(prev);
      if (next.has(face.id)) {
        next.delete(face.id);
      } else {
        next.add(face.id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedFaces.size === faces.length) {
      setSelectedFaces(new Set());
    } else {
      setSelectedFaces(new Set(faces.map((f) => f.id)));
    }
  };

  const handleUnmerge = (targetPersonId?: string) => {
    const faceIds = Array.from(selectedFaces);
    setUnmerging(true);
    unmergeFaces(personId, faceIds, targetPersonId)
      .then((result) => {
        toast({
          title: "Success",
          description: `Moved ${result.moved} face(s) to ${targetPersonId ? "selected" : "a new"} person`,
        });
        setDialogOpen(false);
        fetchFaces();
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
          <span className="text-lg font-medium">Faces</span>
          <span className="text-sm text-gray-500">{faces.length} total</span>
        </div>
        <div className="flex items-center gap-2">
          {faces.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              {selectedFaces.size === faces.length ? "Deselect All" : "Select All"}
            </Button>
          )}
          {selectedFaces.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDialogOpen(true)}
              disabled={unmerging}
            >
              Unmerge {selectedFaces.size} Face{selectedFaces.size !== 1 ? "s" : ""}
            </Button>
          )}
        </div>
      </div>

      {faces.length === 0 ? (
        <p className="text-sm text-gray-500">No faces found for this person.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
          {faces.map((face) => (
            <FaceCrop
              key={face.id}
              face={face}
              selected={selectedFaces.has(face.id)}
              onToggle={toggleFace}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unmerge Faces</DialogTitle>
            <DialogDescription>
              Move {selectedFaces.size} selected face{selectedFaces.size !== 1 ? "s" : ""} away
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
