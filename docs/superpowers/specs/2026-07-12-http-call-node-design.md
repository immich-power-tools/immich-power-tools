# HTTP Call Node + Per-Asset Variables — Design

## Overview

A new workflow action node, **`http_request`**, that sends an HTTP request **per matched asset** to an external API, optionally **stores the response as a per-asset variable**, and **passes the asset set through** to downstream nodes. Variables can then be interpolated into downstream HTTP-node templates and branched on in `If`/`Switch` conditions.

This introduces a **per-asset context** to the workflow engine — the first time the engine carries data (not just asset IDs) between nodes. It's a coherent single feature (the HTTP node is the variable producer; the variable system is its payoff), but a sizable one — roughly six implementation tasks.

## Decisions locked during brainstorming

- **Per-asset fan-out** — one HTTP request per matched asset (not one batched request per run).
- **Custom template body** — user writes URL / headers / body with `{variable}` interpolation.
- **Pass-through** — the node forwards its incoming asset set to downstream nodes (existing actions are terminal leaves; this one is not).
- **Variables usable in BOTH downstream templates AND `If`/`Switch` conditions** (full scope, not a fast-follow).
- **Export secrets redacted** — header values are stripped on workflow export.
- **Defaults:** request timeout 10s, fan-out concurrency 5.

## Architecture

### 1. Per-asset context (engine foundation — `src/lib/workflow/engine.ts`)

The BFS queue item currently carries `{ nodeId, assetIds: string[] | null }`. It gains a context map:

```ts
type AssetContext = Map<string, Record<string, any>>; // assetId -> { varName: value }
interface QueueItem { nodeId: string; assetIds: string[] | null; context: AssetContext; }
```

- **Triggers** seed an **empty** context (`new Map()`) when pushing to their targets.
- **`If`/`Switch`** carry the **same context reference** forward to every branch (an asset's entry is only read when that asset flows down a branch, so passing the whole map is safe and cheap; no per-branch copy needed).
- **`http_request`** produces a **new** context (clone of incoming, with each asset's variable set) and forwards it to downstream targets.
- Context is **per-run and ephemeral** — never persisted to the DB, never carried across runs.

Assets with no variables set simply have no map entry; readers treat a missing entry / missing key as "undefined."

### 2. `http_request` action (`src/lib/workflow/actionExecutor.ts`)

A new `case "http_request"` in `executeAction`. Because it needs per-asset metadata for templating, it:

1. **Batch-loads per-asset data once** for the incoming asset set: exif (`city`, `state`, `country`, `make`, `model`, `dateTimeOriginal`, `latitude`, `longitude`, `rating`), `originalFileName`/`type` from `assets`, and named-face names from `assetFaces`→`person`. Builds `assetData: Map<assetId, Record<string, any>>`.
2. **Fans out per asset** with bounded concurrency (5) and a per-request timeout (default 10s, configurable). For each asset it resolves the URL, each header value, and the body (see §3), issues the request (`fetch`, `redirect: "manual"`), and if a **Save-response-as** name is configured, parses the response (JSON, falling back to text), applies the optional **extract path**, and returns the extracted value keyed by asset ID.
3. **Never aborts the run on a single failure** — per-asset errors (network, timeout, non-2xx) are caught and counted. Returns `{ action: "http_request", assetsProcessed, succeeded, failed, sampleErrors: string[] }` (a few sample `status/message` strings for the run log).

The engine (not `executeAction`) owns writing results into the context and forwarding — see §4 — so `executeAction` returns the per-asset extracted values to the engine. Signature extension: for `http_request`, `executeAction` additionally returns `variables?: Map<string, any>` (assetId → extracted value) alongside the `ActionResult`.

> **Note:** the existing per-set `resolveTemplate` (most-common-across-the-set) is unchanged and still used by `create_album`. The HTTP node uses the new **per-asset** resolver in §3. Set-wide action name templates do NOT gain variable support (see §6).

### 3. Unified per-asset template resolver (`actionExecutor.ts`)

`resolvePerAsset(template: string, assetId: string, assetData: Map<...>, context: AssetContext): string`

Builds a value bag = `{ ...assetData.get(assetId), ...context.get(assetId) }` (variables override metadata on name collision) and replaces every `{token}` and dotted `{token.a.b.0}` via a shared path walker `getPath(obj, "a.b.0")` (splits on `.`, indexes objects and arrays; returns `undefined` on any miss). Unresolved tokens render as empty string. Metadata tokens exposed: `{assetId}`, `{filename}`, `{type}`, `{city}`, `{state}`, `{country}`, `{camera}` (make + model), `{dateTaken}`, `{latitude}`, `{longitude}`, `{rating}`, `{person}` (first named face). `getPath` is shared with §5.

### 4. Pass-through wiring + dedup-insert fix (`engine.ts`, action branch)

The action branch currently executes and does **not** enqueue downstream targets (terminal). For `http_request` specifically:

- After `executeAction` returns, build `newContext` = clone of incoming context; for each `(assetId, value)` in the returned `variables`, set `newContext.get-or-create(assetId)[saveAs] = value`.
- Enqueue the node's downstream targets (handle `null`) with `{ assetIds: incomingAssetIds, context: newContext }` — **all** incoming assets forwarded (failures included; they're logged, not dropped).
- Other action subtypes remain terminal (unchanged).

Because pass-through lets an asset reach both the HTTP node and a downstream action, both insert into `workflowProcessedAssets` for the same `(workflowId, assetId)`. Add **`.onConflictDoNothing()`** to that insert (the `workflowProcessedAssets` insert in the action branch, ~`engine.ts:490`; anchor on the `appDb.insert(workflowProcessedAssets)` call, not the line number). This also closes the latent duplicate-insert bug flagged in the state-entered-triggers final review.

### 5. Variable conditions (`If`/`Switch`)

New `ConditionType` member **`variable`**: `{ type: "variable"; name: string; path?: string; operator: VariableOperator; value?: string }`, where `VariableOperator = "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "exists" | "not_exists"`.

- **`conditionBuilder.ts`**: `variable` is not a SQL condition. `buildSingleCondition`'s `default` already returns `undefined` (dropped by the `if (clause)` guard), so SQL evaluation ignores it. The engine also **explicitly partitions** conditions before calling `buildConditions` (belt-and-suspenders): `sqlConds = conditions.filter(c => c.type !== "variable")`, `varConds = conditions.filter(c => c.type === "variable")`.
- **New evaluator** `evaluateVariableCondition(cond, assetCtx: Record<string, any> | undefined): boolean` (new file `src/lib/workflow/variableConditions.ts`): extracts `v = getPath(assetCtx?.[cond.name], cond.path)` and applies the operator (`exists`/`not_exists` test presence; numeric operators coerce with `Number()`; `contains` uses string `includes`; `equals`/`not_equals` compare as strings). Missing variable → `exists`=false, all comparisons false.
- **Engine `If`**: an asset takes the TRUE branch iff it is in the SQL-matched set **AND** every `varCond` passes for `context.get(assetId)`. `trueIds = incoming.filter(id => sqlMatched.has(id) && varConds.every(c => evaluateVariableCondition(c, context.get(id))))`; the rest go FALSE. (When there are no variable conditions this reduces to today's behavior exactly.)
- **Engine `Switch`**: same partition per case; an asset matches a case iff SQL-matched **AND** all the case's var-conditions pass; matched assets leave the remaining pool as today.

### 6. Scope boundary (explicit)

Per-asset variables flow to: **downstream `http_request` templates** (URL/headers/body) and **`If`/`Switch` routing**. They do **not** flow into set-wide action name templates (`create_album.nameTemplate`, `tag.tagName`) — a single batch action cannot take a per-asset value. The high-value pattern still works via routing: `HTTP (classify) → If variable.category == "x" → Add to album "X"`; the variable drives which assets route to the set-wide action, which then runs on that subset.

### 7. UI

- **`NodePalette.tsx`** — new Actions entry: `{ type: "action", subType: "http_request", label: "HTTP Call", icon: Webhook, color: "text-purple-500" }`.
- **`ActionConfig.tsx`** — new `http_request` branch: URL input, Method select, dynamic Headers key/value rows, Body textarea, Save-response-as input, Extract-path input, Timeout input, plus clickable template-var badges (metadata vars + a hint that `{yourVar}` works).
- **`ConditionEditor.tsx`** — new `variable` condition editor: name, path, operator select, value. Add `variable: "Variable"` to `conditionTypeLabels` in **`conditionSummary.ts`** (required — it's a `Record<ConditionType, string>`, so omitting it is a type error) and a `case "variable"` summary.
- **`nodes/ActionNode.tsx`** and **`runs/[runId].tsx`** — register `http_request` icon/label so the node and run history render it.
- **`types/workflow.d.ts`** — add `variable` to `ConditionType`, the `VariableOperator` type, and an `IHttpRequestActionData` interface.

### 8. Security & limits

- **SSRF is inherent** (arbitrary URLs, incl. internal hosts) and accepted — only the workflow **owner** configures the node. Mitigations: enforced timeout, `redirect: "manual"` (no auto-follow).
- **Secrets:** header values are redacted on **export** (`api/workflows/[id]/export.ts`) — replaced with `""` and the import UI notes secrets must be refilled. Verify the export path serializes node `data`; redact header values within `http_request` nodes there.
- **No hard asset cap** in v1 — concurrency + timeout bound the blast radius, and run history shows `succeeded/failed`. (Flag for future if large libraries cause issues.)

## Known limitations & accepted trade-offs

- Variables are **per-asset and per-run**; there is no run-level/global variable and no cross-run persistence.
- Set-wide action name templates do not see variables (§6).
- `greater_than`/`less_than` coerce via `Number()`; non-numeric operands compare false. `equals` is string comparison.
- Export redaction covers header values only; if a user embeds a secret directly in the URL or body template, it is exported as-is (documented; header is the supported place for secrets).
- Pass-through forwards **all** incoming assets (including failed requests), by design — downstream logic can branch on a saved status variable if it wants to exclude failures.

## Testing

No automated framework exists in this repo. Verification:
1. `npx tsc --noEmit -p .` clean.
2. Throwaway script exercising `resolvePerAsset` + `getPath` (token/path resolution incl. array indices and misses) and `evaluateVariableCondition` (operator truth table incl. missing-variable cases).
3. Throwaway fan-out against a local echo server (or `https://webhook.site`) confirming per-asset URL/body interpolation and concurrency/timeout behavior.
4. Manual E2E: `New Asset → HTTP Call (save response as R) → If R.status equals "ok" → Tag`. Confirm per-asset calls fire, the variable routes assets correctly, the tag applies to the routed subset, and a second run dedups.
