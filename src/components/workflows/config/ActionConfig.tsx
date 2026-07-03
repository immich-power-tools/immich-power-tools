import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { listAlbums } from "@/handlers/api/album.handler";
import { IAlbum } from "@/types/album";
import { useEffect, useState } from "react";

interface ActionConfigProps {
  subType: string;
  config: any;
  onChange: (config: any) => void;
}

const templateVars = ["{city}", "{date}", "{person}", "{camera}", "{state}", "{country}"];

function AlbumPicker({ value, onChange }: { value: string | undefined; onChange: (albumId: string, albumName: string) => void }) {
  const [open, setOpen] = useState(false);
  const [albums, setAlbums] = useState<IAlbum[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<IAlbum | null>(null);

  useEffect(() => {
    setLoading(true);
    listAlbums()
      .then((data) => {
        setAlbums(data);
        if (value) {
          const found = data.find((a: IAlbum) => a.id === value);
          if (found) setSelectedAlbum(found);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-center gap-2 h-8 px-3 w-full border rounded text-sm bg-background hover:bg-muted transition-colors text-left">
          {selectedAlbum ? (
            <span className="truncate">{selectedAlbum.albumName}</span>
          ) : (
            <span className="text-muted-foreground">Select album...</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0 z-[10000]" align="start">
        <Command>
          <CommandInput placeholder="Search albums..." className="text-xs" />
          <CommandList>
            <CommandEmpty>{loading ? "Loading..." : "No albums found."}</CommandEmpty>
            <CommandGroup>
              {albums.map((album) => (
                <CommandItem
                  key={album.id}
                  value={album.albumName}
                  onSelect={() => {
                    setSelectedAlbum(album);
                    onChange(album.id, album.albumName);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <span className="text-xs truncate flex-1">{album.albumName}</span>
                  <Check className={cn("h-3 w-3", value === album.id ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function ActionConfig({ subType, config, onChange }: ActionConfigProps) {
  if (subType === "create_album") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">Album Name Template</Label>
        <Input
          className="h-8 text-sm"
          placeholder="Trip to {city} - {date}"
          value={config.nameTemplate || ""}
          onChange={(e) => onChange({ ...config, nameTemplate: e.target.value })}
        />
        <div className="flex flex-wrap gap-1">
          {templateVars.map((v) => (
            <Badge
              key={v}
              variant="outline"
              className="text-[10px] cursor-pointer hover:bg-muted"
              onClick={() => onChange({ ...config, nameTemplate: (config.nameTemplate || "") + v })}
            >
              {v}
            </Badge>
          ))}
        </div>
      </div>
    );
  }

  if (subType === "add_to_album" || subType === "remove_from_album") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">Album</Label>
        <AlbumPicker
          value={config.albumId}
          onChange={(albumId, albumName) => onChange({ ...config, albumId, albumName })}
        />
      </div>
    );
  }

  if (subType === "tag" || subType === "remove_tag") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">Tag Name</Label>
        <Input
          className="h-8 text-sm"
          placeholder="e.g. Vacation"
          value={config.tagName || ""}
          onChange={(e) => onChange({ ...config, tagName: e.target.value })}
        />
        {subType === "remove_tag" && (
          <p className="text-[10px] text-muted-foreground">Removes this tag from matched assets. If the tag doesn&apos;t exist, nothing happens.</p>
        )}
      </div>
    );
  }

  // favorite, unfavorite, archive — no config needed
  return <p className="text-xs text-muted-foreground">No configuration needed.</p>;
}
