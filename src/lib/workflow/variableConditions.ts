import { getPath } from "./templating";
import type { ICondition } from "@/types/workflow";

// Evaluate a single `variable` condition against one asset's context bag.
// A missing variable/path makes `exists` false and every comparison false.
export function evaluateVariableCondition(c: ICondition, ctx: Record<string, any> | undefined): boolean {
  const v = getPath(ctx?.[c.name], c.path);
  switch (c.operator) {
    case "exists": return v !== undefined && v !== null;
    case "not_exists": return v === undefined || v === null;
    case "equals": return v != null && String(v) === String(c.value);
    case "not_equals": return String(v) !== String(c.value);
    case "contains": return v != null && String(v).includes(String(c.value ?? ""));
    case "greater_than": return v != null && Number(v) > Number(c.value);
    case "less_than": return v != null && Number(v) < Number(c.value);
    default: return false;
  }
}
