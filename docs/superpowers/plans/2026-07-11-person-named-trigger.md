# Person Named Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `person_named` workflow trigger that fires for assets whose people were freshly named since the workflow's last run.

**Architecture:** One new branch in `resolveAssetTrigger` (engine) mirroring the existing `asset_updated` incremental-dedup pattern, plus registering the new subtype string across the four UI maps that render trigger nodes. No schema changes, no new dependencies.

**Tech Stack:** Next.js (pages router), Drizzle ORM (Postgres), React Flow (`@xyflow/react`), lucide-react icons, TypeScript.

## Global Constraints

- **No third-party network calls** — reads only the local Immich Postgres DB (`asset`, `asset_face`, `person` tables). No cloud AI.
- **No test framework exists in this repo** — verification is via `npx tsc --noEmit` for type safety plus a throwaway Node script that runs the real query against the live DB (delete it after). Do not add a test framework as part of this plan.
- **Branch:** work on `feat-workflow-improvements` (already checked out).
- **Immich v3 schema** — `asset_face` has no timestamp columns; `person.updatedAt` is the only naming-event timestamp available.

---

### Task 1: Engine — `person_named` trigger resolution

**Files:**
- Modify: `src/lib/workflow/engine.ts` (imports at line 4-6; `processedMap` gate at line 118; new branch after line 160)

**Interfaces:**
- Consumes: existing `resolveAssetTrigger(subType, workflowId, userId, lookbackMinutes, runId)` locals — `sinceDate: Date`, `baseConditions: SQL[]`, `processedMap: Map<string, Date> | null`, `candidateIds: string[]`, and the `fetchAllBatches` helper.
- Produces: when `resolveAssetTrigger` is called with `subType === "person_named"` (dispatched unchanged at line 258), returns `string[]` of asset ids to feed the workflow graph — same contract as the other trigger branches.

- [ ] **Step 1: Add schema imports**

In `src/lib/workflow/engine.ts`, after line 5 (`import { exif } from "@/schema";`), add:

```ts
import { person } from "@/schema/person.schema";
import { assetFaces } from "@/schema/assetFaces.schema";
```

(`ne`, `desc`, `gt`, `gte`, `and`, `eq`, `isNull` are already imported on line 6 — no change to the drizzle-orm import.)

- [ ] **Step 2: Include `person_named` in the processed-map gate**

At line 118, change:

```ts
  if (subType === "new_asset" || subType === "asset_updated") {
```

to:

```ts
  if (subType === "new_asset" || subType === "asset_updated" || subType === "person_named") {
```

- [ ] **Step 3: Add the `person_named` branch**

In the trigger `if/else` chain, insert a new `else if` between the end of the `asset_updated` branch (current line 160, the `log(...)` call) and the `} else {` that begins the `all_assets` branch (current line 161). The result reads:

```ts
    log(runId, `Trigger [asset_updated]: ${totalCandidates} candidates, ${totalCandidates - candidateIds.length} skipped (not updated since processing), ${candidateIds.length} remaining`);
  } else if (subType === "person_named") {
    const rows = await fetchAllBatches((afterId, limit) =>
      db
        .selectDistinctOn([assets.id], { id: assets.id, namedAt: person.updatedAt })
        .from(assets)
        .innerJoin(assetFaces, eq(assets.id, assetFaces.assetId))
        .innerJoin(person, eq(assetFaces.personId, person.id))
        .where(and(
          ...baseConditions,
          eq(person.ownerId, userId),
          eq(person.isHidden, false),
          ne(person.name, ""),
          gte(person.updatedAt, sinceDate),
          ...(afterId ? [gt(assets.id, afterId)] : [])
        ))
        .orderBy(assets.id, desc(person.updatedAt))
        .limit(limit)
    );
    const totalCandidates = rows.length;
    // For person_named: reprocess only if a face was (re)named after we last processed this asset
    candidateIds = rows
      .filter((r) => {
        const lastProcessed = processedMap?.get(r.id);
        if (!lastProcessed) return true; // never processed
        if (!r.namedAt) return true;     // no timestamp (shouldn't happen given WHERE), be permissive
        return r.namedAt > lastProcessed;
      })
      .map((r) => r.id);
    log(runId, `Trigger [person_named]: ${totalCandidates} candidates, ${totalCandidates - candidateIds.length} skipped (not renamed since processing), ${candidateIds.length} remaining`);
  } else {
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: exit 0, no errors. (If drizzle complains that `namedAt` is possibly `null`, the `if (!r.namedAt) return true;` guard already handles it — the comparison is only reached when `namedAt` is a `Date`.)

- [ ] **Step 5: Verify the query against the live DB**

Create `scratch-verify-person-named.mjs` in the repo root:

```js
import { Client } from "pg";
import "dotenv/config";

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_DATABASE_NAME,
});
await client.connect();

// Replicates the person_named branch SQL, sinceDate = epoch (catch everything).
const res = await client.query(`
  SELECT DISTINCT ON (a."id") a."id", p."updatedAt" AS "namedAt", p."name"
  FROM "asset" a
  INNER JOIN "asset_face" af ON a."id" = af."assetId"
  INNER JOIN "person" p ON af."personId" = p."id"
  WHERE a."visibility" = 'timeline'
    AND a."status" = 'active'
    AND a."deletedAt" IS NULL
    AND p."ownerId" = (SELECT id FROM "user" LIMIT 1)
    AND p."isHidden" = false
    AND p."name" <> ''
    AND p."updatedAt" >= '1970-01-01'
  ORDER BY a."id", p."updatedAt" DESC
  LIMIT 10
`);
console.log("Named-person assets found:", res.rowCount);
console.log(res.rows.slice(0, 3));
await client.end();
```

Run: `node scratch-verify-person-named.mjs`
Expected: prints a non-zero count and rows each with a non-null `namedAt` and non-empty `name` (confirms the join + filters return named-person assets). Then delete it: `rm scratch-verify-person-named.mjs`

- [ ] **Step 6: Commit**

```bash
git add src/lib/workflow/engine.ts
git commit -m "feat: add person_named workflow trigger resolution"
```

---

### Task 2: UI registration + type declaration

**Files:**
- Modify: `src/components/workflows/NodePalette.tsx` (import line 1; `assetTriggerItems` line 11-15)
- Modify: `src/components/workflows/nodes/TriggerNode.tsx` (import line 2; three maps line 4-20)
- Modify: `src/pages/workflows/[id]/runs/[runId].tsx` (import block line 23-26; `icons`/`labels` maps line 33-34)
- Modify: `src/pages/workflows/[id].tsx` (description block line 404-406)
- Modify: `src/types/workflow.d.ts` (after line 69)

**Interfaces:**
- Consumes: the `subType: "person_named"` string produced by Task 1's engine branch and dragged from the palette.
- Produces: a draggable "Person Named" trigger in the palette, and correct icon/label/description rendering of that node in the editor graph, the inspector panel, and the run-history view.

- [ ] **Step 1: Palette entry (`NodePalette.tsx`)**

Change the import on line 1 to add `UserCheck`:

```ts
import { FilePlus, FileEdit, Database, GitBranch, GitFork, FolderPlus, FolderInput, FolderMinus, Heart, HeartOff, Archive, Tag, UserCheck } from "lucide-react";
```

Add a fourth entry to `assetTriggerItems` (after the `all_assets` line):

```ts
  { type: "trigger", subType: "person_named", label: "Person Named", icon: UserCheck, color: "text-green-500" },
```

- [ ] **Step 2: Graph node rendering (`TriggerNode.tsx`)**

Change the import on line 2 to add `UserCheck`:

```ts
import { FilePlus, FileEdit, Database, UserCheck } from "lucide-react";
```

Add `person_named` to each of the three maps:

```ts
const triggerIcons: Record<string, any> = {
  new_asset: FilePlus,
  asset_updated: FileEdit,
  all_assets: Database,
  person_named: UserCheck,
};

const triggerLabels: Record<string, string> = {
  new_asset: "New Asset",
  asset_updated: "Asset Updated",
  all_assets: "All Assets",
  person_named: "Person Named",
};

const triggerDescriptions: Record<string, string> = {
  new_asset: "Since last run (or workflow creation)",
  asset_updated: "Since last run (or workflow creation)",
  all_assets: "Full library scan",
  person_named: "Since last run (or workflow creation)",
};
```

- [ ] **Step 3: Run-history rendering (`runs/[runId].tsx`)**

Add `UserCheck` to the second lucide-react import block (line 23-26):

```ts
import {
  FilePlus, FileEdit, Database, GitBranch, GitFork,
  FolderPlus, FolderInput, FolderMinus, Heart, HeartOff, Archive, Tag, UserCheck,
} from "lucide-react";
```

Add `person_named` to the local `icons` and `labels` maps (line 33-34):

```ts
  const icons: Record<string, any> = { new_asset: FilePlus, asset_updated: FileEdit, all_assets: Database, person_named: UserCheck };
  const labels: Record<string, string> = { new_asset: "New Asset", asset_updated: "Asset Updated", all_assets: "All Assets", person_named: "Person Named" };
```

- [ ] **Step 4: Inspector description (`[id].tsx`)**

In the trigger description block (line 404-406), add a fourth line after the `all_assets` line:

```tsx
              {subType === "all_assets" && "Selects all assets in your library. Use with caution on large libraries."}
              {subType === "person_named" && "Selects assets whose people were named since the last successful run. On first run, uses workflow creation time."}
```

(No change to the lookback-buffer block — its `subType !== "all_assets"` guard already renders the buffer input for `person_named`, which is correct: this trigger is incremental and honors the lookback window.)

- [ ] **Step 5: Type declaration (`workflow.d.ts`)**

After line 69 (`export interface IWebhookTriggerData { token: string; }`), add:

```ts
export interface IPersonNamedTriggerData {}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: exit 0, no errors across all five modified files.

- [ ] **Step 7: Manual UI confirmation**

With the dev server running (`bun run dev`), open a workflow editor. Expected: the trigger palette shows a "Person Named" item with the UserCheck icon; dragging it onto the canvas renders a green trigger node labelled "Person Named" with the description "Since last run (or workflow creation)" and a Lookback Buffer input in the inspector.

- [ ] **Step 8: Commit**

```bash
git add src/components/workflows/NodePalette.tsx src/components/workflows/nodes/TriggerNode.tsx "src/pages/workflows/[id]/runs/[runId].tsx" "src/pages/workflows/[id].tsx" src/types/workflow.d.ts
git commit -m "feat: register person_named trigger across workflow UI"
```

---

## End-to-end verification (after both tasks)

With the dev server running: build a workflow `Person Named → Add to Album (a test album)`, save and enable it. In Immich, name a previously-unnamed person. Run the workflow (manual run). Expected: the named person's assets are added to the test album, and the run log shows `Trigger [person_named]: N candidates ... M remaining`. Run again without renaming anyone — expected: `0 remaining` (dedup working).
