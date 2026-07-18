import { ICondition, IConditionMatch } from "@/types/workflow";
import ConditionEditor from "./ConditionEditor";
import { Label } from "@/components/ui/label";

interface IfConfigProps {
  config: { conditions?: ICondition[]; match?: IConditionMatch };
  onChange: (config: any) => void;
}

export default function IfConfig({ config, onChange }: IfConfigProps) {
  const match = config.match ?? "all";
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Conditions</Label>
        <p className="text-[10px] text-muted-foreground mb-2">
          {match === "any"
            ? "Assets matching ANY condition take the TRUE branch."
            : "Assets matching ALL conditions take the TRUE branch."}
        </p>
      </div>
      <ConditionEditor
        conditions={config.conditions || []}
        onChange={(conditions) => onChange({ ...config, conditions })}
        match={match}
        onMatchChange={(m) => onChange({ ...config, match: m })}
      />
    </div>
  );
}
