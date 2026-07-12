// Per-asset template + JSON-path helpers shared by the HTTP action and the
// variable-condition evaluator. Pure, no DB or network access.

// Walk a dotted path (e.g. "data.0.id") into an object/array. Empty/undefined
// path returns the object itself. Any miss returns undefined.
export function getPath(obj: any, path?: string): any {
  if (path === undefined || path === "") return obj;
  let cur = obj;
  for (const key of path.split(".")) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

// Replace {name} and {name.a.b.0} tokens in a template using a flat value bag
// (asset metadata merged with run variables). Unknown tokens / misses render
// as "". Objects are JSON-stringified.
export function resolveTemplateString(template: string, valueBag: Record<string, any>): string {
  if (!template) return template;
  return template.replace(/\{([^}]+)\}/g, (_match, token) => {
    const trimmed = String(token).trim();
    const dot = trimmed.indexOf(".");
    const name = dot === -1 ? trimmed : trimmed.slice(0, dot);
    const path = dot === -1 ? undefined : trimmed.slice(dot + 1);
    if (!(name in valueBag)) return "";
    const v = getPath(valueBag[name], path);
    if (v === undefined || v === null) return "";
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  });
}
