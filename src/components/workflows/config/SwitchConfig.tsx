import { ICondition, IConditionMatch } from "@/types/workflow";
import ConditionEditor from "./ConditionEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";

interface SwitchCase {
  label: string;
  conditions: ICondition[];
  handle: string;
  match?: IConditionMatch;
}

interface SwitchConfigProps {
  config: { cases?: SwitchCase[] };
  onChange: (config: any) => void;
}

export default function SwitchConfig({ config, onChange }: SwitchConfigProps) {
  const cases = config.cases || [];

  const addCase = () => {
    const handle = `case_${cases.length}`;
    onChange({
      ...config,
      cases: [...cases, { label: `Case ${cases.length + 1}`, conditions: [], handle }],
    });
  };

  const removeCase = (index: number) => {
    onChange({ ...config, cases: cases.filter((_: any, i: number) => i !== index) });
  };

  const updateCase = (index: number, updates: Partial<SwitchCase>) => {
    const next = [...cases];
    next[index] = { ...next[index], ...updates };
    onChange({ ...config, cases: next });
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Cases</Label>
        <p className="text-[10px] text-muted-foreground mb-2">First matching case wins. Non-matching assets go to Default.</p>
      </div>
      {cases.map((c: SwitchCase, i: number) => (
        <div key={c.handle} className="border rounded p-2 space-y-2">
          <div className="flex items-center gap-1">
            <Input
              className="h-7 text-xs flex-1"
              value={c.label}
              onChange={(e) => updateCase(i, { label: e.target.value })}
              placeholder="Case label"
            />
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeCase(i)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <ConditionEditor
            conditions={c.conditions}
            onChange={(conditions) => updateCase(i, { conditions })}
            match={c.match ?? "all"}
            onMatchChange={(m) => updateCase(i, { match: m })}
          />
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={addCase}>
        <Plus className="h-3 w-3 mr-1" />
        Add Case
      </Button>
    </div>
  );
}
