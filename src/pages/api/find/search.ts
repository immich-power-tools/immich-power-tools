import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { FindQuery, parseFindQuery, sanitizeFindQuery } from "@/helpers/ai.helper";
import { resolveFindQuery, runFindQuery } from "@/helpers/find.helper";
import { NextApiRequest, NextApiResponse } from "next";

export default async function search(
  req: NextApiRequest,
  res: NextApiResponse
) {
  let parsedQuery: FindQuery = {};
  try {
    // `filters` re-runs a search the user tweaked by hand (no AI involved),
    // `previous` lets a follow-up like "only videos" refine the last search.
    const { query, filters, previous } = req.body as {
      query?: string;
      filters?: FindQuery;
      previous?: FindQuery;
    };
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      res.status(403).json({ message: "Not authenticated" });
      return;
    }

    // Streamed as newline-delimited JSON so the model's thinking (when a
    // provider sends any) can reach the browser as it's produced, rather than
    // after the whole parse — some queries take tens of seconds end to end.
    res.writeHead(200, {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    });
    const send = (line: Record<string, unknown>) => res.write(JSON.stringify(line) + "\n");

    if (filters) {
      parsedQuery = sanitizeFindQuery(filters);
    } else {
      parsedQuery = await parseFindQuery(query as string, previous, (text) => send({ type: "thinking", text }));
    }

    const resolution = await resolveFindQuery(currentUser, parsedQuery);
    const { assets, total, notes } = await runFindQuery(currentUser, resolution);

    send({
      type: "result",
      assets,
      total,
      notes,
      filters: resolution.filters,
      labels: resolution.labels,
      alternatives: resolution.alternatives,
    });
    res.end();
  } catch (err: any) {
    console.error(err);
    const payload = { assets: [], filters: parsedQuery, error: err.message || "Failed to fetch assets" };
    // Headers already sent once streaming starts, so a late failure (e.g. the
    // Immich request) has to end the stream with a result line instead.
    if (res.headersSent) {
      res.write(JSON.stringify({ type: "result", ...payload }) + "\n");
      res.end();
      return;
    }
    res.status(200).json(payload);
  }
}
