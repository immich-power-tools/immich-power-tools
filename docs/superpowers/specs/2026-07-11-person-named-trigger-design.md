# Person Named Trigger — Design

## Overview

A new workflow trigger subtype, `person_named`, joining the existing `new_asset`, `asset_updated`, and `all_assets` triggers. It fires for every asset containing a face linked to a person who was freshly named (empty `name` → non-empty) since the workflow's last successful run.

This closes a real gap: naming a face in Immich does not update `asset.updatedAt`, so a workflow using `new_asset` (evaluates once, before the face is ever named) or `asset_updated` (never fires on naming) can never re-evaluate a photo once its person is identified. The existing workaround — a periodic `all_assets` full-library sweep — works but is wasteful on large libraries and was itself broken by the 10k-asset cap (fixed separately in #297). `person_named` gives a precise, incremental way to react to "a person just got a name."

Parameterless — like `all_assets`, it needs no config UI beyond the trigger-type picker itself.

## Data model constraint

Immich's `asset_face` table has no timestamp columns (confirmed: `id`, `assetId`, `personId`, and bounding-box fields only). The only timestamp available to key off is `person.updatedAt`. This shapes the whole design — see Limitations.

## Implementation

### Engine (`src/lib/workflow/engine.ts`)

New branch in `resolveAssetTrigger`, following the exact pattern `asset_updated` already uses (per-row driving timestamp, compared against `workflowProcessedAssets` to decide what's genuinely new). Uses `selectDistinctOn` — mirroring all three sibling trigger branches — with `ORDER BY assets.id, desc(person.updatedAt)` so each asset row carries the most-recent naming timestamp among its named faces:

```ts
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
  candidateIds = rows
    .filter((r) => {
      const lastProcessed = processedMap?.get(r.id);
      if (!lastProcessed) return true;
      if (!r.namedAt) return true;
      return r.namedAt > lastProcessed;
    })
    .map((r) => r.id);
  log(runId, `Trigger [person_named]: ${totalCandidates} candidates, ${totalCandidates - candidateIds.length} skipped (not renamed since processing), ${candidateIds.length} remaining`);
}
```

Also add `"person_named"` to the condition that builds `processedMap` (currently gated to `subType === "new_asset" || subType === "asset_updated"`).

The `DISTINCT ON (assets.id)` with `ORDER BY assets.id, desc(person.updatedAt)` handles assets with multiple named faces — the most recent naming event becomes the asset's `namedAt` driving timestamp for dedup purposes. Keyset pagination on `assets.id` (via `fetchAllBatches`) remains valid because `assets.id` is the leading `ORDER BY` / `DISTINCT ON` column.

### Types (`src/types/workflow.d.ts`)

```ts
export interface IPersonNamedTriggerData {}
```

Parameterless, matching `IManualTriggerData`.

### UI (4 files maintain trigger subType maps)

The trigger subtype is registered in four UI locations, each of which needs the new `person_named` entry:

1. **`src/components/workflows/NodePalette.tsx`** — one new palette entry (draggable source):
   ```ts
   { type: "trigger", subType: "person_named", label: "Person Named", icon: UserCheck, color: "text-green-500" },
   ```
   Add `UserCheck` to the `lucide-react` import.

2. **`src/components/workflows/nodes/TriggerNode.tsx`** — graph node rendering. Add `person_named` to `triggerIcons` (`UserCheck`), `triggerLabels` (`"Person Named"`), and `triggerDescriptions` (`"Since last run (or workflow creation)"`). Add `UserCheck` to the `lucide-react` import.

3. **`src/pages/workflows/[id]/runs/[runId].tsx`** — run-history node rendering. Add `person_named` to the local `icons` (`UserCheck`) and `labels` (`"Person Named"`) maps. Add `UserCheck` to the second `lucide-react` import block.

4. **`src/pages/workflows/[id].tsx`** — inspector panel description text. Add a line: `{subType === "person_named" && "Selects assets whose people were named since the last successful run. On first run, uses workflow creation time."}`. No change needed to the lookback-buffer block (`subType !== "all_assets"` already renders it for `person_named`, which is correct — this trigger is incremental and uses the lookback buffer).

### Type declaration (`src/types/workflow.d.ts`)

```ts
export interface IPersonNamedTriggerData {}
```

Parameterless, matching `IManualTriggerData`. Note: trigger subtypes are dispatched by runtime string, not a TypeScript discriminated union, so this interface is documentation-only (consistent with the existing, partly-vestigial trigger data interfaces).

### Imports needed

In `engine.ts`: `ne`, `desc`, `gt`, `gte` from `drizzle-orm` are already imported; add `person` from `@/schema/person.schema` and `assetFaces` from `@/schema/assetFaces.schema` (not currently imported in `engine.ts` — `actionExecutor.ts` already imports both with this exact path/style). No new `drizzle-orm` import needed (the `selectDistinctOn` approach avoids `max`).

## Known limitations

- **Merge events aren't reliably caught.** If Immich's person-merge operation reassigns `asset_face.personId` to a named person without touching that person's `updatedAt`, those assets won't trigger. This is a real, currently-unverified gap in Immich's own backend behavior — out of scope for this design. A future iteration could investigate this empirically once verified against a live merge.
- **`person.updatedAt` isn't naming-specific.** Editing a birthdate or Immich auto-selecting a new representative thumbnail also bumps it, which can cause `person_named` to re-fire on assets that were already correctly processed. Not incorrect — downstream actions (add-to-album, tag) are naturally idempotent — just occasionally redundant work. Accepted trade-off; Immich's schema doesn't expose anything more precise.
- **Hidden persons excluded** — filters `person.isHidden = false`, consistent with the existing `person_unnamed` condition and other person-facing queries in the codebase.
- **First run on a new workflow only catches naming events going forward** — same semantics as `new_asset`/`asset_updated` (`sinceDate` falls back to `workflow.createdAt`). To retroactively catch already-named people, chain an `all_assets` trigger once, matching the existing backfill pattern.

## Testing

No test framework exists in this repo (confirmed during an earlier PR review this session). Verification will be manual: create a workflow with `person_named` → an action (e.g., add to a test album), name a previously-unnamed person in Immich, run the workflow, confirm the person's assets get actioned and a second run without renaming processes nothing new.
