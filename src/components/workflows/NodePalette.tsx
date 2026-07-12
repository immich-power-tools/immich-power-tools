import { FilePlus, FileEdit, Database, GitBranch, GitFork, FolderPlus, FolderInput, FolderMinus, Heart, HeartOff, Archive, Tag, Tags, Star, UserCheck } from "lucide-react";

interface PaletteItem {
  type: string;
  subType: string;
  label: string;
  icon: any;
  color: string;
}

const assetTriggerItems: PaletteItem[] = [
  { type: "trigger", subType: "new_asset", label: "New Asset", icon: FilePlus, color: "text-green-500" },
  { type: "trigger", subType: "asset_updated", label: "Asset Updated", icon: FileEdit, color: "text-green-500" },
  { type: "trigger", subType: "all_assets", label: "All Assets", icon: Database, color: "text-green-500" },
  { type: "trigger", subType: "person_named", label: "Person Named", icon: UserCheck, color: "text-green-500" },
  { type: "trigger", subType: "album_added", label: "Added to Album", icon: FolderInput, color: "text-green-500" },
  { type: "trigger", subType: "favorited", label: "Favorited", icon: Heart, color: "text-green-500" },
  { type: "trigger", subType: "rating_changed", label: "Rating Changed", icon: Star, color: "text-green-500" },
  { type: "trigger", subType: "tag_added", label: "Tag Added", icon: Tags, color: "text-green-500" },
];

const logicItems: PaletteItem[] = [
  { type: "logic_if", subType: "if", label: "If", icon: GitBranch, color: "text-yellow-500" },
  { type: "logic_switch", subType: "switch", label: "Switch", icon: GitFork, color: "text-orange-500" },
];

const actionItems: PaletteItem[] = [
  { type: "action", subType: "create_album", label: "Create Album", icon: FolderPlus, color: "text-purple-500" },
  { type: "action", subType: "add_to_album", label: "Add to Album", icon: FolderInput, color: "text-purple-500" },
  { type: "action", subType: "remove_from_album", label: "Remove from Album", icon: FolderMinus, color: "text-purple-500" },
  { type: "action", subType: "favorite", label: "Favorite", icon: Heart, color: "text-purple-500" },
  { type: "action", subType: "unfavorite", label: "Unfavorite", icon: HeartOff, color: "text-purple-500" },
  { type: "action", subType: "archive", label: "Archive", icon: Archive, color: "text-purple-500" },
  { type: "action", subType: "tag", label: "Add Tag", icon: Tag, color: "text-purple-500" },
  { type: "action", subType: "remove_tag", label: "Remove Tag", icon: Tag, color: "text-purple-500" },
];

function PaletteGroup({ title, items }: { title: string; items: PaletteItem[] }) {
  const onDragStart = (event: React.DragEvent, item: PaletteItem) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify({
      type: item.type,
      subType: item.subType,
    }));
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">{title}</h3>
      <div className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={`${item.type}-${item.subType}`}
              draggable
              onDragStart={(e) => onDragStart(e, item)}
              className="flex items-center gap-2 px-2 py-1.5 rounded cursor-grab active:cursor-grabbing hover:bg-muted transition-colors"
            >
              <Icon className={`h-3.5 w-3.5 ${item.color}`} />
              <span className="text-xs text-foreground">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function NodePalette() {
  return (
    <div className="w-48 border-r bg-background p-3 overflow-y-auto">
      <h2 className="text-sm font-semibold mb-3">Nodes</h2>
      <PaletteGroup title="Asset Triggers" items={assetTriggerItems} />
      <PaletteGroup title="Logic" items={logicItems} />
      <PaletteGroup title="Actions" items={actionItems} />
    </div>
  );
}
