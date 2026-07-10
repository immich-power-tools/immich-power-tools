import { Handle, Position, NodeProps } from "@xyflow/react";
import { FolderPlus, FolderInput, FolderMinus, Heart, HeartOff, Archive, Tag } from "lucide-react";

const actionIcons: Record<string, any> = {
  create_album: FolderPlus,
  add_to_album: FolderInput,
  remove_from_album: FolderMinus,
  favorite: Heart,
  unfavorite: HeartOff,
  archive: Archive,
  tag: Tag,
  remove_tag: Tag,
};

const actionLabels: Record<string, string> = {
  create_album: "Create Album",
  add_to_album: "Add to Album",
  remove_from_album: "Remove from Album",
  favorite: "Favorite",
  unfavorite: "Unfavorite",
  archive: "Archive",
  tag: "Add Tag",
  remove_tag: "Remove Tag",
};

export default function ActionNode({ data, selected }: NodeProps) {
  const subType = data.subType as string || "create_album";
  const Icon = actionIcons[subType] || FolderPlus;
  const label = actionLabels[subType] || "Action";
  const config = data.config ? (typeof data.config === "string" ? JSON.parse(data.config) : data.config) : {};

  return (
    <div className={`px-4 py-3 rounded-lg border-2 bg-background min-w-[180px] ${selected ? "border-blue-500" : "border-purple-500"}`}>
      <Handle type="target" position={Position.Top} className="!bg-purple-500 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded bg-purple-500/10">
          <Icon className="h-4 w-4 text-purple-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">{label}</p>
          {subType === "create_album" && config.nameTemplate && (
            <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">{config.nameTemplate}</p>
          )}
          {(subType === "add_to_album" || subType === "remove_from_album") && config.albumName && (
            <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">{config.albumName}</p>
          )}
          {(subType === "tag" || subType === "remove_tag") && config.tagName && (
            <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">{config.tagName}</p>
          )}
        </div>
      </div>
    </div>
  );
}
