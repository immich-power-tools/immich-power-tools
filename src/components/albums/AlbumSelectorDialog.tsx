import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { listAlbums } from "@/handlers/api/album.handler";
import { IAlbum, IAlbumCreate } from "@/types/album";
import { Input } from "../ui/input";
import { usePhotoSelectionContext } from "@/contexts/PhotoSelectionContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import toast from "react-hot-toast";
import { Label } from "../ui/label";

interface IProps {
  onSelected: (album: IAlbum) => Promise<void>;
  onCreated?: (album: IAlbum) => Promise<void>;
  onSubmit?: (data: IAlbumCreate) => Promise<any>;
  /**
   * Pre-filled album name suggestion for the "Create New" tab. Useful when
   * the caller already has a sensible default (e.g. the trip suggested name
   * "20180401 - Lisboa"). The user can still edit it.
   */
  defaultName?: string;
}
export default function AlbumSelectorDialog({ onSelected, onCreated, onSubmit, defaultName }: IProps) {
  const [open, setOpen] = useState(false);
  const [albums, setAlbums] = useState<IAlbum[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { selectedIds, assets, config } = usePhotoSelectionContext();
  const [formData, setFormData] = useState({
    albumName: defaultName ?? config.suggestedAlbumName ?? "",
  });

  // Sync the pre-fill if it changes after mount (e.g., user picks another trip)
  useEffect(() => {
    const next = defaultName ?? config.suggestedAlbumName ?? "";
    setFormData((prev) => (prev.albumName ? prev : { albumName: next }));
  }, [defaultName, config.suggestedAlbumName]);

  const fetchData = () => {
    setLoading(true);
    return listAlbums()
      .then(setAlbums)
      .catch(setErrorMessage)
      .finally(() => setLoading(false));
  };

  const filteredAlbums = useMemo(() => {
    return albums.filter((album) =>
      album.albumName.toLowerCase().includes(search.toLowerCase())
    );
  }, [albums, search]);

  const handleSelect = useCallback((album: IAlbum) => () => {
    onSelected(album).then(() => {
      setOpen(false);
      setSearch("");
    });
  }, [onSelected]);


  const handleSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!onSubmit) return;
    setLoading(true);
    onSubmit(formData)
      .then(() => {
        toast.success("Album created successfully");
        setFormData({ albumName: "" });
        setOpen(false);
        fetchData();
      })
      .catch((e) => {
        toast.error("Failed to create album");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [onSubmit, formData]);


  useEffect(() => {
    if (open) fetchData();
  }, [open]);

  const renderContent = useCallback(() => {
    if (loading && !albums.length) return <p>Loading...</p>;
    if (errorMessage) return <p>{errorMessage}</p>;
    return (
      <div>
        <Input
          placeholder="Search Albums"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
        />
        <div className="max-h-[450px] min-h-[450px] overflow-y-auto flex flex-col gap-2 py-2">
          {filteredAlbums.map((album) => (
            <div
              key={album.id}
              role="button"
              onClick={handleSelect(album)}
              className={
                "flex gap-1 flex-col p-2 py-1 rounded-lg hover:dark:bg-zinc-800 hover:bg-zinc-100 px-4"
              }
            >
              <p className="font-mono text-sm">{album.albumName}</p>
            </div>
          ))}
          {filteredAlbums.length === 0 && !loading && (
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 py-4">
              No albums found matching &quot;{search}&quot;.
            </p>
          )}
        </div>
      </div>
    );
  }, [filteredAlbums, handleSelect, loading, errorMessage, search]);

  const renderCreateContent = useCallback(() => {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-h-[450px] min-h-[450px]">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Create a new album and add the selected {selectedIds.length} asset(s) to it.
        </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="albumName">Album Name</Label>
            <Input
              id="albumName"
              placeholder="Album Name"
              required
              value={formData.albumName}
              onChange={(e) => {
                setFormData({ ...formData, albumName: e.target.value });
              }}
            />
          </div>
          <div className="self-end mt-auto pt-4">
            <Button disabled={loading || !formData.albumName} type="submit">
              {loading ? "Creating Album..." : "Create Album"}
            </Button>
          </div>
        </form>
    )
  }, [loading, formData, handleSubmit, selectedIds.length]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={"sm"} disabled={selectedIds.length === 0}>Add to Album</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Select Album</DialogTitle>
          <DialogDescription>
            Add the selected {selectedIds.length} asset(s) to an existing album or create a new one.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="albums" className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="albums">Existing Album</TabsTrigger>
            <TabsTrigger value="create">Create New</TabsTrigger>
          </TabsList>
          <TabsContent value="albums">
            {renderContent()}
          </TabsContent>
          <TabsContent value="create">
            {renderCreateContent()}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
