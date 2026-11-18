import { appDb } from "@/db";
import { workflows, workflowNodes, workflowRuns } from "@/db/schema/workflows.schema";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { eq, desc, count, sql } from "drizzle-orm";
import { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

  if (req.method === "GET") {
    const rows = await appDb
      .select()
      .from(workflows)
      .where(eq(workflows.ownerId, currentUser.id))
      .orderBy(desc(workflows.updatedAt));

    // Enrich with node counts and last run info
    const enriched = await Promise.all(rows.map(async (w) => {
      const nodes = await appDb
        .select({ type: workflowNodes.type })
        .from(workflowNodes)
        .where(eq(workflowNodes.workflowId, w.id));

      const [lastRunRow] = await appDb
        .select({
          id: workflowRuns.id,
          workflowId: workflowRuns.workflowId,
          trigger: workflowRuns.trigger,
          status: workflowRuns.status,
          error: workflowRuns.error,
          startedAt: workflowRuns.startedAt,
          completedAt: workflowRuns.completedAt,
          result: workflowRuns.result,
        })
        .from(workflowRuns)
        .where(eq(workflowRuns.workflowId, w.id))
        .orderBy(desc(workflowRuns.startedAt))
        .limit(1);

      // The list view only shows the processed-asset count, so strip the rest
      // of the result JSON before sending it to the client.
      let lastRun = lastRunRow || null;
      if (lastRun?.result) {
        let matchedAssets = 0;
        try { matchedAssets = JSON.parse(lastRun.result)?.matchedAssets ?? 0; } catch {}
        lastRun = { ...lastRun, result: JSON.stringify({ matchedAssets }) };
      }

      const [runCountRow] = await appDb
        .select({ count: count() })
        .from(workflowRuns)
        .where(eq(workflowRuns.workflowId, w.id));

      return {
        ...w,
        nodeCount: nodes.length,
        triggerCount: nodes.filter(n => n.type === "trigger").length,
        actionCount: nodes.filter(n => n.type === "action").length,
        totalRuns: runCountRow?.count || 0,
        lastRun: lastRun || null,
      };
    }));

    return res.status(200).json(enriched);
  }

  if (req.method === "POST") {
    const { name, description } = req.body;
    const id = randomUUID();
    const webhookToken = randomUUID();
    await appDb.insert(workflows).values({
      id,
      ownerId: currentUser.id,
      name: name || "Untitled Workflow",
      description: description || null,
      webhookToken,
    });
    const [row] = await appDb.select().from(workflows).where(eq(workflows.id, id));
    return res.status(201).json(row);
  }

  return res.status(405).json({ message: "Method not allowed" });
}
