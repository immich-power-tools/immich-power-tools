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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

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
    // Shared albums are included so this action can add assets to albums the
    // user has editor (upload) access to, not just ones they own.
    listAlbums({ includeShared: true })
      .then((data) => {
        setAlbums(data);
        if (value) {
          const found = data.find((a: IAlbum) => a.id === value);
          if (found) setSelectedAlbum(found);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const ownedAlbums = albums.filter((a) => a.myRole !== "editor");
  const sharedAlbums = albums.filter((a) => a.myRole === "editor");

  const renderItem = (album: IAlbum) => (
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
  );

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
            {ownedAlbums.length > 0 && (
              <CommandGroup heading="My Albums">
                {ownedAlbums.map(renderItem)}
              </CommandGroup>
            )}
            {sharedAlbums.length > 0 && (
              <CommandGroup heading="Shared Albums">
                {sharedAlbums.map(renderItem)}
              </CommandGroup>
            )}
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

  if (subType === "http_request") {
    const headers: { key: string; value: string }[] = config.headers || [];
    const setHeader = (i: number, patch: Partial<{ key: string; value: string }>) => {
      const next = headers.map((h, idx) => (idx === i ? { ...h, ...patch } : h));
      onChange({ ...config, headers: next });
    };
    return (
      <div className="space-y-2">
        <Label className="text-xs">Method &amp; URL</Label>
        <div className="flex gap-2">
          <Select value={config.method || "POST"} onValueChange={(v) => onChange({ ...config, method: v })}>
            <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input className="h-8 text-sm flex-1" placeholder="https://api.example.com/{assetId}" value={config.url || ""} onChange={(e) => onChange({ ...config, url: e.target.value })} />
        </div>

        <Label className="text-xs">Headers</Label>
        {headers.map((h, i) => (
          <div key={i} className="flex gap-1">
            <Input className="h-7 text-xs" placeholder="Header" value={h.key} onChange={(e) => setHeader(i, { key: e.target.value })} />
            <Input className="h-7 text-xs" placeholder="Value" value={h.value} onChange={(e) => setHeader(i, { value: e.target.value })} />
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onChange({ ...config, headers: headers.filter((_, idx) => idx !== i) })}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => onChange({ ...config, headers: [...headers, { key: "", value: "" }] })}>
          <Plus className="h-3 w-3 mr-1" /> Add Header
        </Button>

        <Label className="text-xs">Body</Label>
        <Textarea className="text-xs font-mono min-h-[80px]" placeholder={'{"id": "{assetId}"}'} value={config.body || ""} onChange={(e) => onChange({ ...config, body: e.target.value })} />
        <div className="flex flex-wrap gap-1">
          {["{assetId}", "{filename}", "{city}", "{dateTaken}", "{person}", "{camera}"].map((v) => (
            <Badge key={v} variant="outline" className="text-[10px] cursor-pointer hover:bg-muted" onClick={() => onChange({ ...config, body: (config.body || "") + v })}>{v}</Badge>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">Also use a saved variable as <code>{'{name.field}'}</code> in the URL, headers, or body.</p>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Save response as</Label>
            <Input className="h-7 text-xs" placeholder="e.g. resp" value={config.saveAs || ""} onChange={(e) => onChange({ ...config, saveAs: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Extract path</Label>
            <Input className="h-7 text-xs" placeholder="e.g. data.0.id" value={config.extractPath || ""} onChange={(e) => onChange({ ...config, extractPath: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Timeout (seconds)</Label>
          <Input className="h-7 text-xs w-24" type="number" min={1} placeholder="10" value={config.timeoutSeconds ?? ""} onChange={(e) => onChange({ ...config, timeoutSeconds: parseInt(e.target.value) || undefined })} />
        </div>
      </div>
    );
  }

  // favorite, unfavorite, archive — no config needed
  return <p className="text-xs text-muted-foreground">No configuration needed.</p>;
}
