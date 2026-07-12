import { Handle, Position, NodeProps } from "@xyflow/react";
import { FilePlus, FileEdit, Database, UserCheck, FolderInput, Heart, Star, Tags } from "lucide-react";

const triggerIcons: Record<string, any> = {
  new_asset: FilePlus,
  asset_updated: FileEdit,
  all_assets: Database,
  person_named: UserCheck,
  album_added: FolderInput,
  favorited: Heart,
  rating_changed: Star,
  tag_added: Tags,
};

const triggerLabels: Record<string, string> = {
  new_asset: "New Asset",
  asset_updated: "Asset Updated",
  all_assets: "All Assets",
  person_named: "Person Named",
  album_added: "Added to Album",
  favorited: "Favorited",
  rating_changed: "Rating Changed",
  tag_added: "Tag Added",
};

const triggerDescriptions: Record<string, string> = {
  new_asset: "Since last run (or workflow creation)",
  asset_updated: "Since last run (or workflow creation)",
  all_assets: "Full library scan",
  person_named: "Since last run (or workflow creation)",
  album_added: "Since last run (or workflow creation)",
  favorited: "Since last run (or workflow creation)",
  rating_changed: "Since last run (or workflow creation)",
  tag_added: "First run scans all tagged assets",
};

export default function TriggerNode({ data, selected }: NodeProps) {
  const subType = data.subType as string || "new_asset";
  const Icon = triggerIcons[subType] || FilePlus;
  const label = triggerLabels[subType] || "Asset Trigger";
  const description = triggerDescriptions[subType] || "";
  const config = data.config ? (typeof data.config === "string" ? JSON.parse(data.config) : data.config) : {};
  const lookbackMin = config.lookbackMinutes;

  return (
    <div className={`px-4 py-3 rounded-lg border-2 bg-background min-w-[180px] ${selected ? "border-blue-500" : "border-green-500"}`}>
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded bg-green-500/10">
          <Icon className="h-4 w-4 text-green-500" />
        </div>
        <div>
          <p className="text-xs font-medium text-foreground">{label}</p>
          <p className="text-[10px] text-muted-foreground">
            {description}
            {lookbackMin && subType !== "all_assets" ? ` + ${lookbackMin}m buffer` : ""}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-green-500 !w-3 !h-3" />
    </div>
  );
}
