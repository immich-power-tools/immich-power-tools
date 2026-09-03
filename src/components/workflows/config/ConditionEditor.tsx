import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ICondition, ConditionType, IConditionMatch } from "@/types/workflow";
import { Plus, X, Check, Tag } from "lucide-react";
import { listPeople } from "@/handlers/api/people.handler";
import { listTags, ITag } from "@/handlers/api/tag.handler";
import { listAlbums } from "@/handlers/api/album.handler";
import { IAlbum } from "@/types/album";
import { IPerson } from "@/types/person";
import { PERSON_THUBNAIL_PATH } from "@/config/routes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const conditionTypeLabels: Record<ConditionType, string> = {
  person: "Person",
  person_unnamed: "Unnamed People",
  tag: "Tag",
  city: "City",
  state: "State",
  country: "Country",
  geo_radius: "Geo Radius",
  date_range: "Date Range",
  date_relative: "Relative Date",
  day_of_week: "Day of Week",
  camera_make: "Camera Make",
  camera_model: "Camera Model",
  lens: "Lens",
  asset_type: "Asset Type",
  iso_range: "ISO Range",
  focal_length: "Focal Length",
  resolution: "Resolution",
  rating: "Rating",
  is_favorited: "Favorited",
  file_size: "File Size",
  filename: "File Name / Path",
  file_extension: "File Extension",
  face_count: "Face Count",
  time_of_day: "Time of Day",
  album: "Album",
  not_in_album: "Not in Any Album",
  not_in_specific_album: "Not in Specific Album",
};

// Superseded by the "Album" condition, which covers both directions and picks
// the album from a list instead of asking for a raw id. Still evaluated so
// workflows saved before it existed keep working — it's just no longer offered
// for new conditions (see conditionTypesFor).
const LEGACY_CONDITION_TYPES: ConditionType[] = ["not_in_specific_album"];

const conditionTypes = (Object.keys(conditionTypeLabels) as ConditionType[])
  .filter((t) => !LEGACY_CONDITION_TYPES.includes(t))
  .sort((a, b) => conditionTypeLabels[a].localeCompare(conditionTypeLabels[b]));

/** The dropdown list, plus the current value when it's a legacy type — without
 *  this the Select would render blank for an existing legacy condition. */
const conditionTypesFor = (current: ConditionType): ConditionType[] =>
  LEGACY_CONDITION_TYPES.includes(current) ? [...conditionTypes, current] : conditionTypes;

/** Single-album chooser — albums are listed by name rather than asking the
 *  user to paste an album id (which is what the legacy condition did). The
 *  name is stored alongside the id so the node summary can read back
 *  "Album in: Holidays" without re-fetching, same as the person/tag pickers. */
function AlbumSelect({
  value,
  onChange,
}: {
  value?: string;
  onChange: (albumId: string, albumName: string) => void;
}) {
  const [albums, setAlbums] = useState<IAlbum[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    listAlbums()
      .then((res) => setAlbums(res || []))
      .catch(() => setAlbums([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Select
      value={value || ""}
      onValueChange={(id) => onChange(id, albums.find((a) => a.id === id)?.albumName || "")}
    >
      <SelectTrigger className="h-7 text-xs">
        <SelectValue placeholder={loading ? "Loading albums…" : "Choose an album…"} />
      </SelectTrigger>
      <SelectContent>
        {albums.map((a) => (
          <SelectItem key={a.id} value={a.id} className="text-xs">
            {a.albumName}
            {typeof a.assetCount === "number" ? ` (${a.assetCount})` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface PersonPickerProps {
  selectedIds: string[];
  onChange: (personIds: string[], personNames: string[]) => void;
}

function PersonPicker({ selectedIds, onChange }: PersonPickerProps) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<IPerson[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    listPeople({ page: 1, perPage: 500, sort: "createdAt", sortOrder: "desc", visibility: "visible", type: "named" })
      .then((res) => setPeople(res.people))
      .finally(() => setLoading(false));
  }, []);

  const selectedSet = new Set(selectedIds || []);
  const selectedPeople = people.filter((p) => selectedSet.has(p.id));

  const togglePerson = (person: IPerson) => {
    let nextIds: string[];
    let nextNames: string[];
    if (selectedSet.has(person.id)) {
      nextIds = selectedIds.filter((id) => id !== person.id);
      nextNames = selectedPeople.filter((p) => p.id !== person.id).map((p) => p.name);
    } else {
      nextIds = [...selectedIds, person.id];
      nextNames = [...selectedPeople.map((p) => p.name), person.name];
    }
    onChange(nextIds, nextNames);
  };

  return (
    <div className="space-y-2">
      {/* Selected people chips */}
      {selectedPeople.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedPeople.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => togglePerson(p)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted hover:bg-destructive/10 transition-colors group"
            >
              <img src={PERSON_THUBNAIL_PATH(p.id)} alt="" className="h-4 w-4 rounded-full object-cover" />
              <span className="text-[10px] font-medium">{p.name || "Unknown"}</span>
              <X className="h-2.5 w-2.5 text-muted-foreground group-hover:text-destructive" />
            </button>
          ))}
        </div>
      )}

      {/* Picker */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="flex items-center gap-2 h-7 px-2 w-full border rounded text-xs bg-background hover:bg-muted transition-colors">
            <span className="text-muted-foreground">
              {selectedIds.length === 0 ? "Select people..." : "Add more..."}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0 z-[10000]" align="start">
          <Command>
            <CommandInput placeholder="Search people..." className="text-xs" />
            <CommandList>
              <CommandEmpty>{loading ? "Loading..." : "No people found."}</CommandEmpty>
              <CommandGroup>
                {people.map((person) => (
                  <CommandItem
                    key={person.id}
                    value={person.name || person.id}
                    onSelect={() => togglePerson(person)}
                    className="flex items-center gap-2"
                  >
                    <img src={PERSON_THUBNAIL_PATH(person.id)} alt="" className="h-6 w-6 rounded-full object-cover" />
                    <span className="text-xs truncate flex-1">{person.name || "Unknown"}</span>
                    <Check className={cn("h-3 w-3", selectedSet.has(person.id) ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface TagPickerProps {
  selectedIds: string[];
  onChange: (tagIds: string[], tagValues: string[]) => void;
}

function TagPicker({ selectedIds, onChange }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<ITag[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    listTags()
      .then((res) => setTags(res.tags))
      .finally(() => setLoading(false));
  }, []);

  const selectedSet = new Set(selectedIds || []);
  const selectedTags = tags.filter((t) => selectedSet.has(t.id));

  const toggleTag = (tag: ITag) => {
    let nextIds: string[];
    let nextValues: string[];
    if (selectedSet.has(tag.id)) {
      nextIds = selectedIds.filter((id) => id !== tag.id);
      nextValues = selectedTags.filter((t) => t.id !== tag.id).map((t) => t.value);
    } else {
      nextIds = [...selectedIds, tag.id];
      nextValues = [...selectedTags.map((t) => t.value), tag.value];
    }
    onChange(nextIds, nextValues);
  };

  return (
    <div className="space-y-2">
      {/* Selected tag chips */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTags.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleTag(t)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted hover:bg-destructive/10 transition-colors group"
            >
              <Tag className="h-2.5 w-2.5" style={t.color ? { color: t.color } : undefined} />
              <span className="text-[10px] font-medium">{t.value}</span>
              <X className="h-2.5 w-2.5 text-muted-foreground group-hover:text-destructive" />
            </button>
          ))}
        </div>
      )}

      {/* Picker */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="flex items-center gap-2 h-7 px-2 w-full border rounded text-xs bg-background hover:bg-muted transition-colors">
            <span className="text-muted-foreground">
              {selectedIds.length === 0 ? "Select tags..." : "Add more..."}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0 z-[10000]" align="start">
          <Command>
            <CommandInput placeholder="Search tags..." className="text-xs" />
            <CommandList>
              <CommandEmpty>{loading ? "Loading..." : "No tags found."}</CommandEmpty>
              <CommandGroup>
                {tags.map((tag) => (
                  <CommandItem
                    key={tag.id}
                    value={tag.value}
                    onSelect={() => toggleTag(tag)}
                    className="flex items-center gap-2"
                  >
                    <Tag className="h-3 w-3" style={tag.color ? { color: tag.color } : undefined} />
                    <span className="text-xs truncate flex-1">{tag.value}</span>
                    <Check className={cn("h-3 w-3", selectedSet.has(tag.id) ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface ConditionEditorProps {
  conditions: ICondition[];
  onChange: (conditions: ICondition[]) => void;
  /** ALL (AND, the default) or ANY (OR). Omit onMatchChange to keep the
   *  control hidden and the behavior pinned to ALL. */
  match?: IConditionMatch;
  onMatchChange?: (match: IConditionMatch) => void;
}

function ConditionFields({ condition, onChange }: { condition: ICondition; onChange: (c: ICondition) => void }) {
  switch (condition.type) {
    case "city":
    case "state":
    case "country":
      return (
        <div className="flex gap-2">
          <Select value={condition.match || "equals"} onValueChange={(v) => onChange({ ...condition, match: v })}>
            <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="equals">Equals</SelectItem>
              <SelectItem value="not_equals">Not Equals</SelectItem>
            </SelectContent>
          </Select>
          <Input className="h-7 text-xs" placeholder={condition.type} value={condition[condition.type] || ""} onChange={(e) => onChange({ ...condition, [condition.type]: e.target.value })} />
        </div>
      );
    case "camera_make":
      return <Input className="h-7 text-xs" placeholder="e.g. Apple" value={condition.make || ""} onChange={(e) => onChange({ ...condition, make: e.target.value })} />;
    case "camera_model":
      return <Input className="h-7 text-xs" placeholder="e.g. iPhone 16 Pro" value={condition.model || ""} onChange={(e) => onChange({ ...condition, model: e.target.value })} />;
    case "lens":
      return <Input className="h-7 text-xs" placeholder="Lens model" value={condition.lensModel || ""} onChange={(e) => onChange({ ...condition, lensModel: e.target.value })} />;
    case "asset_type":
      return (
        <Select value={condition.assetType || "IMAGE"} onValueChange={(v) => onChange({ ...condition, assetType: v })}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="IMAGE">Image</SelectItem>
            <SelectItem value="VIDEO">Video</SelectItem>
          </SelectContent>
        </Select>
      );
    case "date_range":
      return (
        <div className="flex gap-2">
          <Input className="h-7 text-xs" type="date" value={condition.after || ""} onChange={(e) => onChange({ ...condition, after: e.target.value })} />
          <Input className="h-7 text-xs" type="date" value={condition.before || ""} onChange={(e) => onChange({ ...condition, before: e.target.value })} />
        </div>
      );
    case "date_relative":
      return (
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Last</span>
          <Input className="h-7 text-xs w-16" type="number" min={1} value={condition.lastDays || ""} onChange={(e) => onChange({ ...condition, lastDays: parseInt(e.target.value) || 0 })} />
          <span className="text-xs text-muted-foreground">days</span>
        </div>
      );
    case "iso_range":
    case "focal_length":
      return (
        <div className="flex gap-2">
          <Input className="h-7 text-xs" type="number" placeholder="Min" value={condition.min ?? ""} onChange={(e) => onChange({ ...condition, min: parseFloat(e.target.value) || undefined })} />
          <Input className="h-7 text-xs" type="number" placeholder="Max" value={condition.max ?? ""} onChange={(e) => onChange({ ...condition, max: parseFloat(e.target.value) || undefined })} />
        </div>
      );
    case "rating":
      return (
        <div className="flex gap-2">
          <Input className="h-7 text-xs w-16" type="number" min={1} max={5} placeholder="Min" value={condition.min ?? ""} onChange={(e) => onChange({ ...condition, min: parseInt(e.target.value) || undefined })} />
          <Input className="h-7 text-xs w-16" type="number" min={1} max={5} placeholder="Max" value={condition.max ?? ""} onChange={(e) => onChange({ ...condition, max: parseInt(e.target.value) || undefined })} />
        </div>
      );
    case "resolution": {
      const unit = (condition.metric || "megapixels") === "megapixels" ? "MP" : "px";
      return (
        <div className="space-y-2">
          <Select value={condition.metric || "megapixels"} onValueChange={(v) => onChange({ ...condition, metric: v })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="megapixels">Megapixels</SelectItem>
              <SelectItem value="short_edge">Short Edge (px)</SelectItem>
              <SelectItem value="long_edge">Long Edge (px)</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input className="h-7 text-xs" type="number" min={0} step="any" placeholder={`Min ${unit}`} value={condition.min ?? ""} onChange={(e) => onChange({ ...condition, min: e.target.value === "" ? undefined : parseFloat(e.target.value) })} />
            <Input className="h-7 text-xs" type="number" min={0} step="any" placeholder={`Max ${unit}`} value={condition.max ?? ""} onChange={(e) => onChange({ ...condition, max: e.target.value === "" ? undefined : parseFloat(e.target.value) })} />
          </div>
        </div>
      );
    }
    case "is_favorited":
      return (
        <Select value={condition.value === false ? "false" : "true"} onValueChange={(v) => onChange({ ...condition, value: v === "true" })}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Is Favorited</SelectItem>
            <SelectItem value="false">Not Favorited</SelectItem>
          </SelectContent>
        </Select>
      );
    case "file_size":
      return (
        <div className="flex items-center gap-2">
          <Input className="h-7 text-xs" type="number" min={0} step="any" placeholder="Min MB" value={condition.min ?? ""} onChange={(e) => onChange({ ...condition, min: e.target.value === "" ? undefined : parseFloat(e.target.value) })} />
          <Input className="h-7 text-xs" type="number" min={0} step="any" placeholder="Max MB" value={condition.max ?? ""} onChange={(e) => onChange({ ...condition, max: e.target.value === "" ? undefined : parseFloat(e.target.value) })} />
        </div>
      );
    case "filename":
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Select value={condition.field || "name"} onValueChange={(v) => onChange({ ...condition, field: v })}>
              <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="name">File Name</SelectItem>
                <SelectItem value="path">File Path</SelectItem>
              </SelectContent>
            </Select>
            <Select value={condition.match || "contains"} onValueChange={(v) => onChange({ ...condition, match: v })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contains">Contains</SelectItem>
                <SelectItem value="not_contains">Does not contain</SelectItem>
                <SelectItem value="starts_with">Starts with</SelectItem>
                <SelectItem value="ends_with">Ends with</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input className="h-7 text-xs" placeholder="e.g. Screenshot" value={condition.text || ""} onChange={(e) => onChange({ ...condition, text: e.target.value })} />
        </div>
      );
    case "file_extension":
      return (
        <div className="space-y-2">
          <Select value={condition.match || "in"} onValueChange={(v) => onChange({ ...condition, match: v })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="in">Is any of</SelectItem>
              <SelectItem value="not_in">Is none of</SelectItem>
            </SelectContent>
          </Select>
          <Input className="h-7 text-xs" placeholder="e.g. png, gif, heic" value={condition.extensions || ""} onChange={(e) => onChange({ ...condition, extensions: e.target.value })} />
        </div>
      );
    case "face_count":
      return (
        <div className="flex items-center gap-2">
          <Input className="h-7 text-xs w-20" type="number" min={0} placeholder="Min" value={condition.min ?? ""} onChange={(e) => onChange({ ...condition, min: e.target.value === "" ? undefined : parseInt(e.target.value) })} />
          <Input className="h-7 text-xs w-20" type="number" min={0} placeholder="Max" value={condition.max ?? ""} onChange={(e) => onChange({ ...condition, max: e.target.value === "" ? undefined : parseInt(e.target.value) })} />
          <span className="text-xs text-muted-foreground">faces</span>
        </div>
      );
    case "time_of_day":
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">From</span>
            <Input className="h-7 text-xs w-16" type="number" min={0} max={23} placeholder="0" value={condition.fromHour ?? ""} onChange={(e) => onChange({ ...condition, fromHour: e.target.value === "" ? undefined : parseInt(e.target.value) })} />
            <span className="text-xs text-muted-foreground">to</span>
            <Input className="h-7 text-xs w-16" type="number" min={0} max={23} placeholder="23" value={condition.toHour ?? ""} onChange={(e) => onChange({ ...condition, toHour: e.target.value === "" ? undefined : parseInt(e.target.value) })} />
            <span className="text-xs text-muted-foreground">h</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Hours 0–23; From &gt; To wraps past midnight (e.g. 22 to 5).</p>
        </div>
      );
    case "person":
      return (
        <div className="space-y-2">
          <Select value={condition.match || "contains_any"} onValueChange={(v) => onChange({ ...condition, match: v })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="contains_any">Contains any of</SelectItem>
              <SelectItem value="contains_all">Contains all of</SelectItem>
              <SelectItem value="not_contains">Does not contain</SelectItem>
            </SelectContent>
          </Select>
          <PersonPicker
            selectedIds={condition.personIds || (condition.personId ? [condition.personId] : [])}
            onChange={(personIds, personNames) => onChange({ ...condition, personIds, personNames })}
          />
        </div>
      );
    case "tag":
      return (
        <div className="space-y-2">
          <Select value={condition.match || "contains_any"} onValueChange={(v) => onChange({ ...condition, match: v })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="contains_any">Has any of</SelectItem>
              <SelectItem value="contains_all">Has all of</SelectItem>
              <SelectItem value="not_contains">Has none of</SelectItem>
            </SelectContent>
          </Select>
          <TagPicker
            selectedIds={condition.tagIds || []}
            onChange={(tagIds, tagValues) => onChange({ ...condition, tagIds, tagValues })}
          />
          <p className="text-[10px] text-muted-foreground">Selected tags also match their child tags.</p>
        </div>
      );
    case "geo_radius":
      return (
        <div className="space-y-1">
          <Select value={condition.match || "inside"} onValueChange={(v) => onChange({ ...condition, match: v })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inside">Inside radius</SelectItem>
              <SelectItem value="outside">Outside radius</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input className="h-7 text-xs" type="number" step="any" placeholder="Latitude" value={condition.lat ?? ""} onChange={(e) => onChange({ ...condition, lat: parseFloat(e.target.value) || 0 })} />
            <Input className="h-7 text-xs" type="number" step="any" placeholder="Longitude" value={condition.lng ?? ""} onChange={(e) => onChange({ ...condition, lng: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="flex items-center gap-1">
            <Input className="h-7 text-xs w-20" type="number" min={1} placeholder="Radius" value={condition.radiusKm ?? ""} onChange={(e) => onChange({ ...condition, radiusKm: parseFloat(e.target.value) || 0 })} />
            <span className="text-xs text-muted-foreground">km</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            True distance from the point. Photos without GPS match neither direction.
          </p>
        </div>
      );
    case "album":
      return (
        <div className="space-y-1">
          <Select value={condition.match || "in"} onValueChange={(v) => onChange({ ...condition, match: v })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="in">Is in album</SelectItem>
              <SelectItem value="not_in">Is not in album</SelectItem>
            </SelectContent>
          </Select>
          <AlbumSelect value={condition.albumId} onChange={(albumId, albumName) => onChange({ ...condition, albumId, albumName })} />
        </div>
      );
    case "day_of_week":
      return (
        <div className="flex gap-1 flex-wrap">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => {
            const days: number[] = condition.days || [];
            const active = days.includes(i);
            return (
              <button
                key={day}
                type="button"
                className={`text-[10px] px-1.5 py-0.5 rounded border ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                onClick={() => {
                  const next = active ? days.filter((d: number) => d !== i) : [...days, i];
                  onChange({ ...condition, days: next });
                }}
              >
                {day}
              </button>
            );
          })}
        </div>
      );
    case "not_in_album":
    case "person_unnamed":
      return null;
    case "not_in_specific_album":
      return <AlbumSelect value={condition.albumId} onChange={(albumId, albumName) => onChange({ ...condition, albumId, albumName })} />;
    default:
      return null;
  }
}

export default function ConditionEditor({ conditions, onChange, match = "all", onMatchChange }: ConditionEditorProps) {
  const addCondition = () => {
    onChange([...conditions, { type: "city" }]);
  };

  const removeCondition = (index: number) => {
    onChange(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, condition: ICondition) => {
    const next = [...conditions];
    next[index] = condition;
    onChange(next);
  };

  const changeType = (index: number, type: ConditionType) => {
    const next = [...conditions];
    next[index] = { type };
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {conditions.length > 1 && onMatchChange && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Match</span>
          <Select value={match} onValueChange={(v) => onMatchChange(v as IConditionMatch)}>
            <SelectTrigger className="h-6 w-[68px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">ALL</SelectItem>
              <SelectItem value="any" className="text-xs">ANY</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">of these</span>
        </div>
      )}
      {conditions.map((condition, i) => (
        <div key={i} className="p-2 border rounded space-y-2 bg-muted/30">
          <div className="flex items-center gap-1">
            <Select value={condition.type} onValueChange={(v) => changeType(i, v as ConditionType)}>
              <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {conditionTypesFor(condition.type).map((t) => (
                  <SelectItem key={t} value={t}>{conditionTypeLabels[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeCondition(i)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <ConditionFields condition={condition} onChange={(c) => updateCondition(i, c)} />
          {i < conditions.length - 1 && (
            <div className="text-center">
              <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {match === "any" ? "OR" : "AND"}
              </span>
            </div>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={addCondition}>
        <Plus className="h-3 w-3 mr-1" />
        Add Condition
      </Button>
    </div>
  );
}
