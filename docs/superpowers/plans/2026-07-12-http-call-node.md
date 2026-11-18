# HTTP Call Node + Per-Asset Variables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `http_request` workflow action node that sends one HTTP request per matched asset to an external API, optionally stores each response as a per-asset variable, passes the asset set through to downstream nodes, and lets those variables be interpolated into downstream HTTP templates and branched on via a new `variable` condition in `If`/`Switch`.

**Architecture:** Introduce a per-asset **context** map (`Map<assetId, Record<varName, any>>`) threaded through the engine BFS alongside asset IDs. Pure primitives (`getPath`, template resolver, variable-condition evaluator) live in new files and are used by both `actionExecutor.ts` (HTTP execution) and `engine.ts` (condition routing + pass-through). No new dependencies, no DB migration.

**Tech Stack:** Next.js (pages router), Drizzle ORM (Postgres for Immich data via `db`, SQLite for app data via `appDb`), React Flow (`@xyflow/react`), lucide-react, TypeScript, native `fetch`.

## Global Constraints

- **No test framework exists in this repo.** Verification = `npx tsc --noEmit -p .` (exit 0) + throwaway Node scripts run then deleted. Do NOT add a test framework.
- **`workflowProcessedAssets` has no unique constraint** on `(workflowId, assetId)` (SQLite table keyed by UUID `id`). Dedup recording via a run-level `Set`, NOT `onConflictDoNothing`.
- **Variables are per-asset and per-run only** — never persisted, never cross-run.
- **Set-wide action name templates (`create_album`, `tag`) do NOT get variable support** — variables flow to `http_request` templates and `If`/`Switch` routing only.
- **Security:** `fetch` uses `redirect: "manual"` and an `AbortController` timeout (default 10s). Fan-out concurrency = 5. Header values are redacted on export.
- **Branch:** `feat-workflow-improvements` (already checked out). Work from `/home/varun/Projects/immich-power-tools`.
- **Existing behavior must be preserved:** with no `variable` conditions and no `http_request` node, engine output must be identical to today (empty context threaded everywhere).

---

### Task 1: Types + pure primitives (templating, variable conditions)

**Files:**
- Modify: `src/types/workflow.d.ts` (add `variable` to `ConditionType` at line 60; add new types after line 88)
- Create: `src/lib/workflow/templating.ts`
- Create: `src/lib/workflow/variableConditions.ts`

**Interfaces:**
- Produces: `getPath(obj, path?) => any`, `resolveTemplateString(template, valueBag) => string` (from `templating.ts`); `evaluateVariableCondition(cond, ctx) => boolean` (from `variableConditions.ts`); `VariableOperator`, `IHttpRequestActionData` types.

- [ ] **Step 1: Add types to `workflow.d.ts`**

Change the `ConditionType` union (ends at line 60 `| "not_in_album" | "not_in_specific_album";`) to add `| "variable"`:

```ts
  | "not_in_album" | "not_in_specific_album"
  | "variable";
```

After line 88 (end of file, after `IWorkflowExport`), add:

```ts
export type VariableOperator =
  | "equals" | "not_equals" | "contains"
  | "greater_than" | "less_than" | "exists" | "not_exists";

export interface IHttpHeader { key: string; value: string; }

export interface IHttpRequestActionData {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers: IHttpHeader[];
  body: string;
  saveAs?: string;
  extractPath?: string;
  timeoutSeconds?: number;
}
```

- [ ] **Step 2: Create `src/lib/workflow/templating.ts`**

```ts
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
```

- [ ] **Step 3: Create `src/lib/workflow/variableConditions.ts`**

```ts
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
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: exit 0.

- [ ] **Step 5: Verify primitives with a throwaway script**

`tsx` is installed and honors the tsconfig `@/*` → `./src/*` path alias, so a throwaway TS script can import the real source. Create `scratch-verify-primitives.ts` in the repo root:

```ts
import { getPath, resolveTemplateString } from "@/lib/workflow/templating";
import { evaluateVariableCondition } from "@/lib/workflow/variableConditions";

// getPath
console.assert(getPath({ a: { b: [10, 20] } }, "a.b.1") === 20, "path index");
console.assert(getPath({ a: 1 }, "") && getPath({ a: 1 }, "")!.a === 1, "empty path returns obj");
console.assert(getPath({ a: 1 }, "x.y") === undefined, "miss");

// resolveTemplateString
console.assert(resolveTemplateString("id={assetId}", { assetId: "A1" }) === "id=A1", "simple");
console.assert(resolveTemplateString("v={r.status}", { r: { status: "ok" } }) === "v=ok", "nested");
console.assert(resolveTemplateString("x={missing}", {}) === "x=", "missing empty");

// evaluateVariableCondition
const ctx = { r: { status: "ok", score: 7 } };
console.assert(evaluateVariableCondition({ type: "variable", name: "r", path: "status", operator: "equals", value: "ok" } as any, ctx) === true, "eq");
console.assert(evaluateVariableCondition({ type: "variable", name: "r", path: "score", operator: "greater_than", value: "5" } as any, ctx) === true, "gt");
console.assert(evaluateVariableCondition({ type: "variable", name: "missing", operator: "exists" } as any, ctx) === false, "missing exists");
console.assert(evaluateVariableCondition({ type: "variable", name: "r", path: "status", operator: "contains", value: "k" } as any, ctx) === true, "contains");
console.log("ALL PRIMITIVE CHECKS PASSED");
```

Run: `npx tsx scratch-verify-primitives.ts`
Expected: prints `ALL PRIMITIVE CHECKS PASSED` with no `Assertion failed` warnings. Then delete it: `rm scratch-verify-primitives.ts`

- [ ] **Step 6: Commit**

```bash
git add src/types/workflow.d.ts src/lib/workflow/templating.ts src/lib/workflow/variableConditions.ts
git commit -m "feat: workflow templating + variable-condition primitives and types"
```

---

### Task 2: HTTP execution in actionExecutor

**Files:**
- Modify: `src/lib/workflow/actionExecutor.ts` (extend `ActionResult` at line 15-21; add helpers + `executeHttpRequest` near the bottom, before `executeAction` or after it)

**Interfaces:**
- Consumes: `resolveTemplateString`, `getPath` from `./templating`; existing `db`, `assets`, `exif`, `person`, `assetFaces`, `eq`, `inArray`, `IUser` (all already imported in this file).
- Produces: `executeHttpRequest(config, assetIds, context, user) => Promise<{ result: ActionResult; variables: Map<string, any> }>`.

- [ ] **Step 1: Import the templating helpers**

At the top of `src/lib/workflow/actionExecutor.ts`, after the existing imports (after line 11 `import { getUserHeaders } from "@/helpers/user.helper";`), add:

```ts
import { resolveTemplateString, getPath } from "./templating";
```

- [ ] **Step 2: Extend `ActionResult`**

Change the `ActionResult` interface (lines 15-21) to add HTTP fields:

```ts
interface ActionResult {
  action: string;
  assetsProcessed: number;
  albumId?: string;
  albumName?: string;
  error?: string;
  succeeded?: number;
  failed?: number;
  sampleErrors?: string[];
}
```

- [ ] **Step 3: Add `loadAssetData` + `executeHttpRequest`**

Add near the bottom of the file, after the `executeAction` function's closing brace:

```ts
// Batch-load per-asset metadata for template interpolation. Keys mirror the
// tokens documented for the HTTP node: assetId, filename, type, city, state,
// country, camera, dateTaken, latitude, longitude, rating, person.
async function loadAssetData(assetIds: string[]): Promise<Map<string, Record<string, any>>> {
  const map = new Map<string, Record<string, any>>();
  if (assetIds.length === 0) return map;
  const BATCH = 5000;
  for (let i = 0; i < assetIds.length; i += BATCH) {
    const chunk = assetIds.slice(i, i + BATCH);
    const rows = await db
      .select({
        id: assets.id,
        filename: assets.originalFileName,
        type: assets.type,
        rating: exif.rating,
        city: exif.city,
        state: exif.state,
        country: exif.country,
        make: exif.make,
        model: exif.model,
        dateTaken: exif.dateTimeOriginal,
        latitude: exif.latitude,
        longitude: exif.longitude,
      })
      .from(assets)
      .leftJoin(exif, eq(assets.id, exif.assetId))
      .where(inArray(assets.id, chunk));
    for (const r of rows) {
      map.set(r.id, {
        assetId: r.id,
        filename: r.filename,
        type: r.type,
        city: r.city ?? "",
        state: r.state ?? "",
        country: r.country ?? "",
        camera: [r.make, r.model].filter(Boolean).join(" "),
        dateTaken: r.dateTaken ? new Date(r.dateTaken).toISOString() : "",
        latitude: r.latitude ?? "",
        longitude: r.longitude ?? "",
        rating: r.rating ?? "",
        person: "",
      });
    }
    const faces = await db
      .select({ assetId: assetFaces.assetId, name: person.name })
      .from(assetFaces)
      .innerJoin(person, eq(assetFaces.personId, person.id))
      .where(inArray(assetFaces.assetId, chunk));
    for (const f of faces) {
      const entry = map.get(f.assetId);
      if (entry && f.name && !entry.person) entry.person = f.name;
    }
  }
  return map;
}

// One HTTP request per asset, bounded concurrency + per-request timeout. Never
// throws on a single asset's failure; collects succeeded/failed counts. When
// config.saveAs is set, stores the (optionally path-extracted) response per
// asset in the returned `variables` map.
export async function executeHttpRequest(
  config: any,
  assetIds: string[],
  context: Map<string, Record<string, any>>,
  _user: IUser
): Promise<{ result: ActionResult; variables: Map<string, any> }> {
  const variables = new Map<string, any>();
  const timeoutMs = (config.timeoutSeconds && config.timeoutSeconds > 0 ? config.timeoutSeconds : 10) * 1000;
  const concurrency = 5;
  const headers: { key: string; value: string }[] = Array.isArray(config.headers) ? config.headers : [];
  const method = String(config.method || "GET").toUpperCase();
  const assetData = await loadAssetData(assetIds);

  let succeeded = 0;
  let failed = 0;
  const sampleErrors: string[] = [];

  const runOne = async (assetId: string) => {
    const bag = { ...(assetData.get(assetId) || {}), ...(context.get(assetId) || {}) };
    const url = resolveTemplateString(config.url || "", bag);
    const hdrs: Record<string, string> = {};
    for (const h of headers) {
      if (h && h.key) hdrs[h.key] = resolveTemplateString(h.value || "", bag);
    }
    const body = method === "GET" || method === "DELETE" ? undefined : resolveTemplateString(config.body || "", bag);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, headers: hdrs, body, redirect: "manual", signal: controller.signal });
      if (config.saveAs) {
        const text = await res.text();
        let parsed: any = text;
        try { parsed = JSON.parse(text); } catch { /* keep as text */ }
        variables.set(assetId, getPath(parsed, config.extractPath));
      }
      if (res.ok) {
        succeeded++;
      } else {
        failed++;
        if (sampleErrors.length < 5) sampleErrors.push(`${assetId.slice(0, 8)}: HTTP ${res.status}`);
      }
    } catch (e: any) {
      failed++;
      if (sampleErrors.length < 5) sampleErrors.push(`${assetId.slice(0, 8)}: ${e?.name === "AbortError" ? "timeout" : (e?.message || "error")}`);
    } finally {
      clearTimeout(timer);
    }
  };

  for (let i = 0; i < assetIds.length; i += concurrency) {
    await Promise.all(assetIds.slice(i, i + concurrency).map(runOne));
  }

  return {
    result: { action: "http_request", assetsProcessed: assetIds.length, succeeded, failed, sampleErrors },
    variables,
  };
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: exit 0.

- [ ] **Step 5: Verify fan-out against a local echo server**

Create `scratch-echo.mjs` in the repo root:

```js
import http from "node:http";
const received = [];
const server = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    received.push({ url: req.url, method: req.method, body: b });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ status: "ok", echoedUrl: req.url }));
  });
});
server.listen(4599, () => console.log("echo on :4599"));
setTimeout(() => { console.log("RECEIVED", JSON.stringify(received, null, 2)); server.close(); }, 4000);
```

Create `scratch-verify-http.ts` in the repo root (`dotenv/config` first so `executeHttpRequest`'s DB import has `DATABASE_URL`):

```ts
import "dotenv/config";
import { executeHttpRequest } from "@/lib/workflow/actionExecutor";

// NOTE: executeHttpRequest calls loadAssetData which hits the DB; use two real
// asset ids from your library, or accept empty metadata (tokens resolve to "").
const assetIds = ["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002"];
const config = {
  url: "http://localhost:4599/photo/{assetId}",
  method: "POST",
  headers: [{ key: "X-Test", value: "1" }],
  body: JSON.stringify({ id: "{assetId}" }),
  saveAs: "resp",
  extractPath: "status",
};
const { result, variables } = await executeHttpRequest(config, assetIds, new Map(), {} as any);
console.log("RESULT", result);
console.log("VARIABLES", [...variables.entries()]);
console.assert(result.succeeded === 2, "both succeeded");
console.assert([...variables.values()].every((v) => v === "ok"), "extracted status ok");
console.log("HTTP FAN-OUT CHECK PASSED");
```

Run in two terminals (or background the echo): `node scratch-echo.mjs &` then `npx tsx scratch-verify-http.ts`.
Expected: `result.succeeded === 2`, each variable is `"ok"`, echo server logs two POSTs to `/photo/…` with per-asset bodies, prints `HTTP FAN-OUT CHECK PASSED`. Then delete both: `rm scratch-echo.mjs scratch-verify-http.ts`

- [ ] **Step 6: Commit**

```bash
git add src/lib/workflow/actionExecutor.ts
git commit -m "feat: per-asset HTTP request execution with response capture"
```

---

### Task 3: Engine — context threading, variable conditions, HTTP pass-through, dedup fix

**Files:**
- Modify: `src/lib/workflow/engine.ts` (imports line 10; queue type + all push sites; IF branch 376-413; SWITCH branch 415-464; action branch 466-505)

**Interfaces:**
- Consumes: `executeHttpRequest` from `./actionExecutor`, `evaluateVariableCondition` from `./variableConditions`.
- Produces: unchanged public contract (`executeWorkflow`); internally threads `context: Map<string, Record<string, any>>` through the BFS.

- [ ] **Step 1: Add imports**

Change line 10 `import { executeAction } from "./actionExecutor";` to:

```ts
import { executeAction, executeHttpRequest } from "./actionExecutor";
import { evaluateVariableCondition } from "./variableConditions";
```

- [ ] **Step 2: Add a run-level recorded-assets set + type the context**

In `executeWorkflow`, after line 327 (`const allProcessedAssetIds = new Set<string>();`), add:

```ts
    const recordedAssetIds = new Set<string>();
```

Change the queue declaration (line 330) from:

```ts
    const queue: { nodeId: string; assetIds: string[] | null }[] = [];
```

to:

```ts
    type AssetContext = Map<string, Record<string, any>>;
    const queue: { nodeId: string; assetIds: string[] | null; context: AssetContext }[] = [];
```

- [ ] **Step 3: Seed empty context from triggers**

Change the trigger push (lines 355-358) from:

```ts
      const targets = adjacency.get(triggerNode.id)?.get(null) || [];
      for (const targetId of targets) {
        queue.push({ nodeId: targetId, assetIds });
      }
```

to:

```ts
      const targets = adjacency.get(triggerNode.id)?.get(null) || [];
      for (const targetId of targets) {
        queue.push({ nodeId: targetId, assetIds, context: new Map() });
      }
```

- [ ] **Step 4: Destructure context in the loop**

Change line 365 from:

```ts
      const { nodeId, assetIds } = queue.shift()!;
```

to:

```ts
      const { nodeId, assetIds, context } = queue.shift()!;
```

- [ ] **Step 5: IF branch — partition conditions, evaluate variables, carry context**

Replace the IF block body (lines 378-413, from `// Query assets matching conditions` through the two `for` push loops) with:

```ts
          // Query assets matching conditions, scoped to incoming set
          const conditions = config.conditions || [];
          const sqlConds = conditions.filter((c: any) => c.type !== "variable");
          const varConds = conditions.filter((c: any) => c.type === "variable");
          log(runId, `IF: ${conditions.length} conditions (${varConds.length} variable): ${conditions.map((c: any) => c.type).join(", ")}`);

          const whereClauses = buildConditions(sqlConds, user.id);

          // Scoped to incoming assets (chunked) when available
          const matchedIds = await queryConditionMatches(whereClauses, assetIds);
          const matchedSet = new Set(matchedIds);

          const passes = (id: string) =>
            matchedSet.has(id) && varConds.every((c: any) => evaluateVariableCondition(c, context.get(id)));

          let trueIds = matchedIds;
          let falseIds: string[] = [];

          if (assetIds !== null) {
            trueIds = assetIds.filter(passes);
            falseIds = assetIds.filter((id) => !passes(id));
          }

          log(runId, `IF result: ${trueIds.length} → TRUE, ${falseIds.length} → FALSE`);

          debugSteps.push({
            nodeId: node.id,
            nodeType: "logic",
            subType: "if",
            label: `IF (${conditions.length} conditions)`,
            inputAssets: assetIds?.length || 0,
            outputAssets: { true: trueIds.length, false: falseIds.length },
            assetIds: trueIds.slice(0, 100),
            detail: `Matched: ${trueIds.length} true, ${falseIds.length} false`,
          });

          // Route to true/false branches
          const trueTargets = adjacency.get(nodeId)?.get("true") || [];
          const falseTargets = adjacency.get(nodeId)?.get("false") || [];
          for (const t of trueTargets) queue.push({ nodeId: t, assetIds: trueIds, context });
          for (const t of falseTargets) queue.push({ nodeId: t, assetIds: falseIds, context });
```

- [ ] **Step 6: SWITCH branch — partition per case, carry context**

Replace the SWITCH `for (let ci …)` case loop body (lines 421-446) with:

```ts
          for (let ci = 0; ci < cases.length; ci++) {
            const c = cases[ci];
            const caseConds = c.conditions || [];
            const sqlConds = caseConds.filter((cc: any) => cc.type !== "variable");
            const varConds = caseConds.filter((cc: any) => cc.type === "variable");
            log(runId, `  Case "${c.label || ci}": ${caseConds.length} conditions (${varConds.length} variable), checking against ${remaining?.length ?? "all"} assets`);

            const whereClauses = buildConditions(sqlConds, user.id);

            // Scoped to remaining assets (chunked) when available
            const matchedIds = await queryConditionMatches(whereClauses, remaining);
            const matchedSet = new Set(matchedIds);
            const passes = (id: string) =>
              matchedSet.has(id) && varConds.every((cc: any) => evaluateVariableCondition(cc, context.get(id)));
            let caseIds: string[];

            if (remaining !== null) {
              caseIds = remaining.filter(passes);
              remaining = remaining.filter((id) => !passes(id));
            } else {
              caseIds = matchedIds;
              remaining = [];
            }

            log(runId, `  Case "${c.label || ci}" matched: ${caseIds.length} assets, ${remaining?.length ?? 0} remaining`);

            result.matchedAssets = Math.max(result.matchedAssets, caseIds.length);

            const caseTargets = adjacency.get(nodeId)?.get(c.handle) || [];
            for (const t of caseTargets) queue.push({ nodeId: t, assetIds: caseIds, context });
          }
```

Change the SWITCH default push (lines 462-463) from:

```ts
          const defaultTargets = adjacency.get(nodeId)?.get("default") || [];
          for (const t of defaultTargets) queue.push({ nodeId: t, assetIds: remaining || [] });
```

to:

```ts
          const defaultTargets = adjacency.get(nodeId)?.get("default") || [];
          for (const t of defaultTargets) queue.push({ nodeId: t, assetIds: remaining || [], context });
```

- [ ] **Step 7: Action branch — http_request dispatch, pass-through, deduped recording**

Replace the action-execution block (lines 484-504, the `if (!isDebug && actionAssetIds.length > 0) { … }`) with:

```ts
        if (!isDebug && actionAssetIds.length > 0) {
          let actionResult: any;
          let httpVariables: Map<string, any> | null = null;

          if (node.subType === "http_request") {
            const out = await executeHttpRequest(config, actionAssetIds, context, user);
            actionResult = out.result;
            httpVariables = out.variables;
            log(runId, `ACTION [http_request] completed: ${actionResult.succeeded}/${actionAssetIds.length} ok, ${actionResult.failed} failed`);
          } else {
            actionResult = await executeAction(node.subType, config, actionAssetIds, user);
            log(runId, `ACTION [${node.subType}] completed: ${actionResult.assetsProcessed} processed${actionResult.albumName ? ` → "${actionResult.albumName}"` : ""}${actionResult.error ? ` ERROR: ${actionResult.error}` : ""}`);
          }
          result.actions.push({ ...actionResult, assetIds: actionAssetIds });

          // Record processed assets to prevent reprocessing. Deduped per-run
          // because a pass-through node can send an asset to multiple actions
          // and this table has no unique constraint.
          const toRecord = actionAssetIds.filter((id) => !recordedAssetIds.has(id));
          if (toRecord.length > 0) {
            const batchSize = 100;
            for (let i = 0; i < toRecord.length; i += batchSize) {
              const batch = toRecord.slice(i, i + batchSize);
              await appDb.insert(workflowProcessedAssets).values(
                batch.map((assetId) => ({ workflowId, assetId, runId }))
              );
            }
            toRecord.forEach((id) => recordedAssetIds.add(id));
            log(runId, `Recorded ${toRecord.length} assets as processed`);
          }

          // http_request is pass-through: forward the incoming set (with any
          // saved variable merged into the per-asset context) to downstream nodes.
          if (node.subType === "http_request") {
            const newContext: AssetContext = new Map(context);
            if (config.saveAs && httpVariables) {
              for (const [aid, val] of httpVariables) {
                newContext.set(aid, { ...(newContext.get(aid) || {}), [config.saveAs]: val });
              }
            }
            const targets = adjacency.get(nodeId)?.get(null) || [];
            for (const t of targets) queue.push({ nodeId: t, assetIds: actionAssetIds, context: newContext });
          }
        }
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: exit 0. (`AssetContext` is in scope for the action branch because it's declared at the top of `executeWorkflow` in Step 2.)

- [ ] **Step 9: Verify existing behavior is unchanged (no variables/http)**

Because there is no automated test harness, confirm by reading: with `varConds` empty, `passes(id)` reduces to `matchedSet.has(id)` — identical to the previous `matchedSet.has(id)` filter. Confirm the diff shows no other logic change to the non-variable path. Then run a manual smoke via the dev server if available: run an existing workflow with an `If` (no variable conditions) and confirm the run log shows the same true/false split as before this change.

- [ ] **Step 10: Commit**

```bash
git add src/lib/workflow/engine.ts
git commit -m "feat: thread per-asset context, evaluate variable conditions, HTTP pass-through"
```

---

### Task 4: Action UI — palette, config form, node + run-history rendering

**Files:**
- Create: `src/components/ui/textarea.tsx` (the `Body` field needs it; it does not exist yet)
- Modify: `src/components/workflows/NodePalette.tsx` (import line 1; `actionItems` line 23-32)
- Modify: `src/components/workflows/config/ActionConfig.tsx` (add `http_request` branch before the fallback return at line 149)
- Modify: `src/components/workflows/nodes/ActionNode.tsx` (import line 2; maps line 4-24; preview line 40-49)
- Modify: `src/pages/workflows/[id]/runs/[runId].tsx` (action `icons`/`labels` at lines 136-143; import line 25)

**Interfaces:**
- Consumes: `subType: "http_request"` and its config shape (`IHttpRequestActionData`) from Tasks 1-3.
- Produces: a draggable "HTTP Call" action, its config form, and correct node/run rendering.

- [ ] **Step 0: Create the missing `Textarea` component (`src/components/ui/textarea.tsx`)**

The repo has `input.tsx` but no `textarea.tsx`. Create it following the same shadcn pattern:

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
```

- [ ] **Step 1: Palette entry (`NodePalette.tsx`)**

Add `Webhook` to the line-1 lucide import (append before the closing `}`):

```ts
import { FilePlus, FileEdit, Database, GitBranch, GitFork, FolderPlus, FolderInput, FolderMinus, Heart, HeartOff, Archive, Tag, UserCheck, Webhook } from "lucide-react";
```

Add to `actionItems` (after the `remove_tag` entry, before `];`):

```ts
  { type: "action", subType: "http_request", label: "HTTP Call", icon: Webhook, color: "text-purple-500" },
```

- [ ] **Step 2: Config form (`ActionConfig.tsx`)**

Add these imports at the top (after line 10 `import { useEffect, useState } from "react";`):

```ts
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
```

Immediately before the final `// favorite, unfavorite, archive — no config needed` return (line 149), add a new branch:

```tsx
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

```

- [ ] **Step 3: Graph node rendering (`ActionNode.tsx`)**

Add `Webhook` to the line-2 import:

```ts
import { FolderPlus, FolderInput, FolderMinus, Heart, HeartOff, Archive, Tag, Webhook } from "lucide-react";
```

Add to `actionIcons` (after `remove_tag: Tag,`): `http_request: Webhook,`
Add to `actionLabels` (after `remove_tag: "Remove Tag",`): `http_request: "HTTP Call",`

Add a config preview after the existing tag preview (after line 49, before the closing `</div>` of the text block):

```tsx
          {subType === "http_request" && config.url && (
            <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">{config.method || "POST"} {config.url}</p>
          )}
```

- [ ] **Step 4: Run-history rendering (`runs/[runId].tsx`)**

Add `Webhook` to the lucide import block (line 25 area — the block currently ends `…Tags, Star, UserCheck,`):

```ts
  FolderPlus, FolderInput, FolderMinus, Heart, HeartOff, Archive, Tag, Tags, Star, UserCheck, Webhook,
```

Add `http_request` to the action `icons` map (lines 136-139) and `labels` map (lines 140-143):

```ts
  const icons: Record<string, any> = {
    create_album: FolderPlus, add_to_album: FolderInput, remove_from_album: FolderMinus,
    favorite: Heart, unfavorite: HeartOff, archive: Archive, tag: Tag, remove_tag: Tag, http_request: Webhook,
  };
  const labels: Record<string, string> = {
    create_album: "Create Album", add_to_album: "Add to Album", remove_from_album: "Remove from Album",
    favorite: "Favorite", unfavorite: "Unfavorite", archive: "Archive", tag: "Add Tag", remove_tag: "Remove Tag", http_request: "HTTP Call",
  };
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: exit 0. (`@/components/ui/textarea` resolves because Step 0 created it.)

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/textarea.tsx src/components/workflows/NodePalette.tsx src/components/workflows/config/ActionConfig.tsx src/components/workflows/nodes/ActionNode.tsx "src/pages/workflows/[id]/runs/[runId].tsx"
git commit -m "feat: HTTP Call node UI (palette, config form, rendering)"
```

---

### Task 5: Variable condition UI (ConditionEditor + summary)

**Files:**
- Modify: `src/components/workflows/config/ConditionEditor.tsx` (add `variable: "Variable"` to `conditionTypeLabels` line 15-42; add a `case "variable"` in `ConditionFields` before `default` at line 461)
- Modify: `src/components/workflows/nodes/conditionSummary.ts` (add `variable: "Variable"` to `conditionTypeLabels` line 3-30; add a `case "variable"` before `default` at line 154)

**Interfaces:**
- Consumes: the `variable` `ConditionType` and `VariableOperator` from Task 1.
- Produces: a "Variable" option in the condition-type dropdown with name/path/operator/value inputs, and a readable summary string.

- [ ] **Step 1: Add label in `ConditionEditor.tsx`**

In `conditionTypeLabels` (line 15-42), add before the closing `}`:

```ts
  variable: "Variable",
```

- [ ] **Step 2: Add the editor fields in `ConditionEditor.tsx`**

In `ConditionFields`, immediately before the final `default:` (line 461), add:

```tsx
    case "variable":
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input className="h-7 text-xs" placeholder="Variable name" value={condition.name || ""} onChange={(e) => onChange({ ...condition, name: e.target.value })} />
            <Input className="h-7 text-xs" placeholder="Path (e.g. data.0.id)" value={condition.path || ""} onChange={(e) => onChange({ ...condition, path: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Select value={condition.operator || "equals"} onValueChange={(v) => onChange({ ...condition, operator: v })}>
              <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="equals">Equals</SelectItem>
                <SelectItem value="not_equals">Not equals</SelectItem>
                <SelectItem value="contains">Contains</SelectItem>
                <SelectItem value="greater_than">Greater than</SelectItem>
                <SelectItem value="less_than">Less than</SelectItem>
                <SelectItem value="exists">Exists</SelectItem>
                <SelectItem value="not_exists">Does not exist</SelectItem>
              </SelectContent>
            </Select>
            {condition.operator !== "exists" && condition.operator !== "not_exists" && (
              <Input className="h-7 text-xs" placeholder="Value" value={condition.value ?? ""} onChange={(e) => onChange({ ...condition, value: e.target.value })} />
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">Matches against a variable saved by an upstream HTTP Call node.</p>
        </div>
      );
```

- [ ] **Step 3: Add label + summary in `conditionSummary.ts`**

In `conditionTypeLabels` (line 3-30), add before the closing `}`:

```ts
  variable: "Variable",
```

In `formatConditionSummary`, before the final `default:` (line 154), add:

```ts
    case "variable": {
      const target = c.path ? `${c.name}.${c.path}` : (c.name || "?");
      if (c.operator === "exists" || c.operator === "not_exists") {
        return `${target} ${c.operator === "exists" ? "exists" : "missing"}`;
      }
      const ops: Record<string, string> = { equals: "=", not_equals: "≠", contains: "⊇", greater_than: ">", less_than: "<" };
      return `${target} ${ops[c.operator] || c.operator || "?"} ${c.value ?? ""}`;
    }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: exit 0. (Both `conditionTypeLabels` maps are `Record<ConditionType, string>`; omitting `variable` from either is a type error, so a clean typecheck confirms both were updated.)

- [ ] **Step 5: Commit**

```bash
git add src/components/workflows/config/ConditionEditor.tsx src/components/workflows/nodes/conditionSummary.ts
git commit -m "feat: variable condition editor + summary"
```

---

### Task 6: Redact HTTP header secrets on export

**Files:**
- Modify: `src/pages/api/workflows/[id]/export.ts` (the `nodes.map(...)` at line 29-36)

**Interfaces:**
- Consumes: node `data` JSON for `http_request` action nodes.
- Produces: exported workflow JSON with `http_request` header values blanked.

- [ ] **Step 1: Add a redaction helper + apply it**

In `src/pages/api/workflows/[id]/export.ts`, add this helper above the `handler` function (after the imports, line 5):

```ts
// HTTP Call nodes store header values (often API keys) in their data JSON.
// Blank those values on export so secrets don't leak into shared workflows.
function redactNodeData(type: string, subType: string, data: string | null): string | null {
  if (type !== "action" || subType !== "http_request" || !data) return data;
  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed.headers)) {
      parsed.headers = parsed.headers.map((h: any) => ({ ...h, value: "" }));
    }
    return JSON.stringify(parsed);
  } catch {
    return data;
  }
}
```

Change the `nodes.map(...)` (line 29-36) to use it:

```ts
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      subType: n.subType,
      data: redactNodeData(n.type, n.subType, n.data),
      positionX: n.positionX,
      positionY: n.positionY,
    })),
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: exit 0.

- [ ] **Step 3: Verify redaction**

With the dev server running and a saved workflow containing an HTTP Call node with a header value (e.g. `Authorization: Bearer secret123`), fetch its export:

Run: `curl -s "http://localhost:3000/api/workflows/<workflow-id>/export" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const h=j.nodes.find(n=>n.subType==='http_request');console.log(JSON.parse(h.data).headers)})"`
Expected: header objects print with `value: ""` (keys preserved, secret gone).

- [ ] **Step 4: Commit**

```bash
git add "src/pages/api/workflows/[id]/export.ts"
git commit -m "feat: redact HTTP Call header secrets on workflow export"
```

---

## End-to-end verification (after all tasks)

With the dev server running, build: `New Asset → HTTP Call → If → Tag`.
- **HTTP Call:** POST to a `https://webhook.site` URL (or the local echo), body `{"id":"{assetId}"}`, Save response as `resp`, Extract path `status`.
- **If:** one `variable` condition — name `resp`, operator `equals`, value `ok` — true branch → **Tag** (test tag).

Add/import a new asset, run the workflow. Expected: webhook receives one call per matched asset with the per-asset body; assets whose response `status == "ok"` get the tag; the run log shows `ACTION [http_request] completed: N/N ok` and the `IF` split. Run again with no new assets → `0 remaining` (dedup holds, and `workflowProcessedAssets` has no duplicate rows for assets that passed through both the HTTP node and the Tag).
