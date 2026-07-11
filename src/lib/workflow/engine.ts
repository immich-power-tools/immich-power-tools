import { appDb } from "@/db";
import { db } from "@/config/db";
import { workflows, workflowNodes, workflowEdges, workflowRuns, workflowProcessedAssets } from "@/db/schema/workflows.schema";
import { assets } from "@/schema/assets.schema";
import { exif } from "@/schema";
import { person } from "@/schema/person.schema";
import { assetFaces } from "@/schema/assetFaces.schema";
import { eq, and, desc, gt, gte, isNull, inArray, sql, ne, SQL } from "drizzle-orm";
import { buildConditions } from "./conditionBuilder";
import { executeAction } from "./actionExecutor";
import { IUser } from "@/types/user";
import { randomUUID } from "crypto";

const PREFIX = "[Workflow]";

function log(runId: string, ...args: any[]) {
  console.log(`${PREFIX} [run:${runId.slice(0, 8)}]`, ...args);
}

function logError(runId: string, ...args: any[]) {
  console.error(`${PREFIX} [run:${runId.slice(0, 8)}]`, ...args);
}

const QUERY_BATCH_SIZE = 5000;

// Keyset-paginate an asset query so large libraries aren't silently truncated.
// fetchBatch must ORDER BY assets.id and apply gt(assets.id, afterId) when given.
async function fetchAllBatches<T extends { id: string }>(
  fetchBatch: (afterId: string | null, limit: number) => Promise<T[]>,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    const batch = await fetchBatch(cursor, QUERY_BATCH_SIZE);
    all.push(...batch);
    if (batch.length < QUERY_BATCH_SIZE) break;
    cursor = batch[batch.length - 1].id;
  }
  return all;
}

// Evaluate condition clauses against an incoming asset set (chunked to keep
// IN-lists bounded), or against the whole library when scopeIds is null.
async function queryConditionMatches(whereClauses: SQL[], scopeIds: string[] | null): Promise<string[]> {
  if (scopeIds !== null) {
    const matched: string[] = [];
    for (let i = 0; i < scopeIds.length; i += QUERY_BATCH_SIZE) {
      const chunk = scopeIds.slice(i, i + QUERY_BATCH_SIZE);
      const rows = await db
        .selectDistinctOn([assets.id], { id: assets.id })
        .from(assets)
        .leftJoin(exif, eq(assets.id, exif.assetId))
        .where(and(...whereClauses, inArray(assets.id, chunk)));
      matched.push(...rows.map((r) => r.id));
    }
    return matched;
  }

  const rows = await fetchAllBatches((afterId, limit) =>
    db
      .selectDistinctOn([assets.id], { id: assets.id })
      .from(assets)
      .leftJoin(exif, eq(assets.id, exif.assetId))
      .where(and(...whereClauses, ...(afterId ? [gt(assets.id, afterId)] : [])))
      .orderBy(assets.id)
      .limit(limit)
  );
  return rows.map((r) => r.id);
}

async function resolveAssetTrigger(
  subType: string,
  workflowId: string,
  userId: string,
  lookbackMinutes: number = 0,
  runId: string = "",
): Promise<string[]> {
  // Get last successful non-debug run time
  const [lastRun] = await appDb
    .select({ completedAt: workflowRuns.completedAt })
    .from(workflowRuns)
    .where(and(
      eq(workflowRuns.workflowId, workflowId),
      eq(workflowRuns.status, "completed"),
      ne(workflowRuns.trigger, "debug"),
    ))
    .orderBy(desc(workflowRuns.completedAt))
    .limit(1);

  // Fall back to workflow creation time if no previous run
  let sinceDate = lastRun?.completedAt;
  if (!sinceDate) {
    const [wf] = await appDb
      .select({ createdAt: workflows.createdAt })
      .from(workflows)
      .where(eq(workflows.id, workflowId))
      .limit(1);
    sinceDate = wf?.createdAt || new Date();
    log(runId, `No previous run found, using workflow creation time: ${sinceDate.toISOString()}`);
  } else {
    log(runId, `Last completed run at: ${sinceDate.toISOString()}`);
  }

  // Apply lookback buffer
  if (lookbackMinutes > 0) {
    const original = sinceDate;
    sinceDate = new Date(sinceDate.getTime() - lookbackMinutes * 60 * 1000);
    log(runId, `Lookback buffer: ${lookbackMinutes}m, adjusted sinceDate from ${original.toISOString()} to ${sinceDate.toISOString()}`);
  }

  const baseConditions = [
    eq(assets.ownerId, userId),
    eq(assets.visibility, "timeline"),
    eq(assets.status, "active"),
    isNull(assets.deletedAt),
  ];

  // Get already-processed assets for this workflow
  let processedMap: Map<string, Date> | null = null;
  if (subType === "new_asset" || subType === "asset_updated" || subType === "person_named") {
    const processed = await appDb
      .select({ assetId: workflowProcessedAssets.assetId, processedAt: workflowProcessedAssets.processedAt })
      .from(workflowProcessedAssets)
      .where(eq(workflowProcessedAssets.workflowId, workflowId));
    processedMap = new Map(processed.map((r) => [r.assetId, r.processedAt || new Date(0)]));
    log(runId, `Previously processed assets: ${processedMap.size}`);
  }

  let candidateIds: string[];

  if (subType === "new_asset") {
    const rows = await fetchAllBatches((afterId, limit) =>
      db
        .selectDistinctOn([assets.id], { id: assets.id })
        .from(assets)
        .where(and(...baseConditions, gte(assets.createdAt, sinceDate), ...(afterId ? [gt(assets.id, afterId)] : [])))
        .orderBy(assets.id)
        .limit(limit)
    );
    const totalCandidates = rows.length;
    // For new_asset: skip any asset we've ever processed
    candidateIds = rows.map((r) => r.id).filter((id) => !processedMap?.has(id));
    log(runId, `Trigger [new_asset]: ${totalCandidates} candidates, ${totalCandidates - candidateIds.length} already processed, ${candidateIds.length} remaining`);
  } else if (subType === "asset_updated") {
    const rows = await fetchAllBatches((afterId, limit) =>
      db
        .selectDistinctOn([assets.id], { id: assets.id, updatedAt: assets.updatedAt })
        .from(assets)
        .where(and(...baseConditions, gte(assets.updatedAt, sinceDate), ...(afterId ? [gt(assets.id, afterId)] : [])))
        .orderBy(assets.id)
        .limit(limit)
    );
    const totalCandidates = rows.length;
    // For asset_updated: only skip if we processed it AFTER its current updatedAt
    candidateIds = rows
      .filter((r) => {
        const lastProcessed = processedMap?.get(r.id);
        if (!lastProcessed) return true; // never processed
        return r.updatedAt > lastProcessed; // updated since last processing
      })
      .map((r) => r.id);
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
    // all_assets — no dedup
    const rows = await fetchAllBatches((afterId, limit) =>
      db
        .selectDistinctOn([assets.id], { id: assets.id })
        .from(assets)
        .where(and(...baseConditions, ...(afterId ? [gt(assets.id, afterId)] : [])))
        .orderBy(assets.id)
        .limit(limit)
    );
    log(runId, `Trigger [all_assets]: ${rows.length} assets found`);
    return rows.map((r) => r.id);
  }

  return candidateIds;
}

interface DebugStep {
  nodeId: string;
  nodeType: string;
  subType: string;
  label: string;
  inputAssets: number;
  outputAssets: Record<string, number>;
  assetIds?: string[];
  detail?: string;
}

interface RunResult {
  matchedAssets: number;
  assetIds: string[];
  actions: any[];
  debug?: DebugStep[];
}

export async function executeWorkflow(
  workflowId: string,
  trigger: "manual" | "schedule" | "webhook" | "debug",
  user: IUser
): Promise<string> {
  const isDebug = trigger === "debug";

  // Create run record
  const runId = randomUUID();
  await appDb.insert(workflowRuns).values({
    id: runId,
    workflowId,
    trigger,
    status: "running",
  });

  log(runId, `=== Workflow execution started ===`);
  log(runId, `Workflow: ${workflowId}`);
  log(runId, `Trigger: ${trigger}${isDebug ? " (DRY RUN)" : ""}`);
  log(runId, `User: ${user.id}`);

  try {
    // Load graph
    const nodes = await appDb.select().from(workflowNodes).where(eq(workflowNodes.workflowId, workflowId));
    const edges = await appDb.select().from(workflowEdges).where(eq(workflowEdges.workflowId, workflowId));

    log(runId, `Graph loaded: ${nodes.length} nodes, ${edges.length} edges`);

    // Build adjacency map: nodeId -> { handle -> targetNodeId[] }
    const adjacency = new Map<string, Map<string | null, string[]>>();
    for (const edge of edges) {
      if (!adjacency.has(edge.sourceNodeId)) adjacency.set(edge.sourceNodeId, new Map());
      const handles = adjacency.get(edge.sourceNodeId)!;
      const handle = edge.sourceHandle || null;
      if (!handles.has(handle)) handles.set(handle, []);
      handles.get(handle)!.push(edge.targetNodeId);
    }

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // Find asset trigger nodes
    const triggerNodes = nodes.filter((n) => n.type === "trigger");
    if (triggerNodes.length === 0) {
      throw new Error("No asset trigger nodes found in the workflow");
    }

    log(runId, `Found ${triggerNodes.length} trigger node(s): ${triggerNodes.map(n => n.subType).join(", ")}`);

    const result: RunResult = { matchedAssets: 0, assetIds: [], actions: [] };
    const debugSteps: DebugStep[] = [];
    const allProcessedAssetIds = new Set<string>();

    // BFS: process nodes with their incoming asset sets
    const queue: { nodeId: string; assetIds: string[] | null }[] = [];

    // Resolve each asset trigger to get the initial asset set
    for (const triggerNode of triggerNodes) {
      const triggerConfig = JSON.parse(triggerNode.data || "{}");
      const lookback = triggerConfig.lookbackMinutes || 0;

      log(runId, `--- Resolving trigger: ${triggerNode.subType} (node: ${triggerNode.id.slice(0, 8)}) ---`);

      const assetIds = await resolveAssetTrigger(triggerNode.subType, workflowId, user.id, lookback, runId);
      result.matchedAssets += assetIds.length;

      log(runId, `Trigger resolved: ${assetIds.length} assets`);

      debugSteps.push({
        nodeId: triggerNode.id,
        nodeType: "trigger",
        subType: triggerNode.subType,
        label: `Asset Trigger: ${triggerNode.subType}`,
        inputAssets: 0,
        outputAssets: { out: assetIds.length },
        assetIds: assetIds.slice(0, 100),
        detail: `Lookback: ${lookback}m, Found ${assetIds.length} assets`,
      });

      const targets = adjacency.get(triggerNode.id)?.get(null) || [];
      for (const targetId of targets) {
        queue.push({ nodeId: targetId, assetIds });
      }
    }

    // Process queue
    let step = 0;
    while (queue.length > 0) {
      step++;
      const { nodeId, assetIds } = queue.shift()!;
      const node = nodeMap.get(nodeId);
      if (!node) {
        log(runId, `Step ${step}: Node ${nodeId.slice(0, 8)} not found, skipping`);
        continue;
      }

      const config = JSON.parse(node.data || "{}");

      log(runId, `--- Step ${step}: ${node.type}/${node.subType} (node: ${nodeId.slice(0, 8)}) | Input: ${assetIds?.length ?? "null"} assets ---`);

      if (node.type === "logic") {
        if (node.subType === "if") {
          // Query assets matching conditions, scoped to incoming set
          const conditions = config.conditions || [];
          log(runId, `IF: ${conditions.length} conditions: ${conditions.map((c: any) => c.type).join(", ")}`);

          const whereClauses = buildConditions(conditions, user.id);

          // Scoped to incoming assets (chunked) when available
          const matchedIds = await queryConditionMatches(whereClauses, assetIds);
          const matchedSet = new Set(matchedIds);

          let trueIds = matchedIds;
          let falseIds: string[] = [];

          if (assetIds !== null) {
            trueIds = assetIds.filter((id) => matchedSet.has(id));
            falseIds = assetIds.filter((id) => !matchedSet.has(id));
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
          for (const t of trueTargets) queue.push({ nodeId: t, assetIds: trueIds });
          for (const t of falseTargets) queue.push({ nodeId: t, assetIds: falseIds });

        } else if (node.subType === "switch") {
          const cases = config.cases || [];
          let remaining = assetIds;

          log(runId, `SWITCH: ${cases.length} cases`);

          for (let ci = 0; ci < cases.length; ci++) {
            const c = cases[ci];
            log(runId, `  Case "${c.label || ci}": ${(c.conditions || []).length} conditions, checking against ${remaining?.length ?? "all"} assets`);

            const whereClauses = buildConditions(c.conditions || [], user.id);

            // Scoped to remaining assets (chunked) when available
            const matchedIds = await queryConditionMatches(whereClauses, remaining);
            const matchedSet = new Set(matchedIds);
            let caseIds: string[];

            if (remaining !== null) {
              caseIds = remaining.filter((id) => matchedSet.has(id));
              remaining = remaining.filter((id) => !matchedSet.has(id));
            } else {
              caseIds = matchedIds;
              remaining = [];
            }

            log(runId, `  Case "${c.label || ci}" matched: ${caseIds.length} assets, ${remaining?.length ?? 0} remaining`);

            result.matchedAssets = Math.max(result.matchedAssets, caseIds.length);

            const caseTargets = adjacency.get(nodeId)?.get(c.handle) || [];
            for (const t of caseTargets) queue.push({ nodeId: t, assetIds: caseIds });
          }

          const caseOutput: Record<string, number> = {};
          cases.forEach((c: any, i: number) => { caseOutput[c.label || `case_${i}`] = 0; });
          debugSteps.push({
            nodeId: node.id,
            nodeType: "logic",
            subType: "switch",
            label: `SWITCH (${cases.length} cases)`,
            inputAssets: assetIds?.length || 0,
            outputAssets: { ...caseOutput, default: (remaining || []).length },
          });

          log(runId, `SWITCH default: ${(remaining || []).length} assets`);

          // Default branch gets remaining
          const defaultTargets = adjacency.get(nodeId)?.get("default") || [];
          for (const t of defaultTargets) queue.push({ nodeId: t, assetIds: remaining || [] });
        }

      } else if (node.type === "action") {
        // Execute action on the asset set
        const actionAssetIds = assetIds || [];
        actionAssetIds.forEach((id) => allProcessedAssetIds.add(id));

        log(runId, `ACTION [${node.subType}]: ${actionAssetIds.length} assets${isDebug ? " (DRY RUN)" : ""}`);

        debugSteps.push({
          nodeId: node.id,
          nodeType: "action",
          subType: node.subType,
          label: `Action: ${node.subType}`,
          inputAssets: actionAssetIds.length,
          outputAssets: {},
          assetIds: actionAssetIds.slice(0, 100),
          detail: isDebug ? `DRY RUN — would process ${actionAssetIds.length} assets` : `Processing ${actionAssetIds.length} assets`,
        });

        if (!isDebug && actionAssetIds.length > 0) {
          const actionResult = await executeAction(node.subType, config, actionAssetIds, user);
          log(runId, `ACTION [${node.subType}] completed: ${actionResult.assetsProcessed} processed${actionResult.albumName ? ` → "${actionResult.albumName}"` : ""}${actionResult.error ? ` ERROR: ${actionResult.error}` : ""}`);
          result.actions.push({ ...actionResult, assetIds: actionAssetIds });

          // Record processed assets to prevent reprocessing
          if (actionAssetIds.length > 0) {
            const batchSize = 100;
            for (let i = 0; i < actionAssetIds.length; i += batchSize) {
              const batch = actionAssetIds.slice(i, i + batchSize);
              await appDb.insert(workflowProcessedAssets).values(
                batch.map((assetId) => ({
                  workflowId,
                  assetId,
                  runId,
                }))
              );
            }
            log(runId, `Recorded ${actionAssetIds.length} assets as processed`);
          }
        }
      }
    }

    // Finalize result
    result.assetIds = Array.from(allProcessedAssetIds);
    result.matchedAssets = result.assetIds.length;
    result.debug = debugSteps;

    // Update run record
    await appDb.update(workflowRuns).set({
      status: "completed",
      result: JSON.stringify(result),
      completedAt: new Date(),
    }).where(eq(workflowRuns.id, runId));

    log(runId, `=== Workflow completed: ${result.matchedAssets} assets, ${result.actions.length} actions ===`);

    return runId;

  } catch (error: any) {
    logError(runId, `=== Workflow FAILED: ${error.message} ===`);

    await appDb.update(workflowRuns).set({
      status: "failed",
      error: error.message || "Unknown error",
      completedAt: new Date(),
    }).where(eq(workflowRuns.id, runId));

    throw error;
  }
}
