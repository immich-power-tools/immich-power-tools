import { ENV } from "@/config/environment";
import { appDb } from "@/db";
import { settings } from "@/db/schema/settings.schema";
import { and, eq } from "drizzle-orm";
import { IUser } from "@/types/user";
import { getUserHeaders } from "@/helpers/user.helper";
import { IJobQueueStatus, JobCommand } from "@/types/job";

export const JOB_API_KEY_SETTING = "job_api_key";

/**
 * Immich's job endpoints are admin-only. A scheduled run has no user session,
 * so it needs a stored API key. Same approach as the workflow engine
 * (see src/lib/workflow/actionExecutor.ts).
 */
export async function getJobApiKey(ownerId: string): Promise<string | null> {
  const [row] = await appDb
    .select()
    .from(settings)
    .where(and(eq(settings.key, JOB_API_KEY_SETTING), eq(settings.ownerId, ownerId)));
  return row?.value || null;
}

/**
 * Call the Immich API for jobs.
 *
 * Prefers the stored job API key; falls back to the caller's session headers
 * when one is supplied (manual runs from the UI). `user` is optional so the
 * scheduler can call this with only an ownerId.
 */
async function immichJobFetch(
  path: string,
  method: string,
  body: any,
  ownerId: string,
  user?: IUser
): Promise<any> {
  const apiKey = await getJobApiKey(ownerId);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  } else if (user) {
    Object.assign(headers, getUserHeaders(user));
  } else {
    throw new Error(
      "No job API key configured. Add one in Settings so scheduled runs can authenticate."
    );
  }

  const res = await fetch(`${ENV.IMMICH_URL}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();

    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Immich rejected the request (${res.status}). Job endpoints require an admin API key with job.read and job.create.`
      );
    }

    // Immich deprecated /api/jobs in v2.4.0. It is still the only way to queue
    // work (PUT /api/queues/{name} only toggles isPaused), so we depend on it.
    // If a future release finally removes it, say so plainly rather than
    // surfacing a bare 404.
    if (res.status === 404 || res.status === 410) {
      throw new Error(
        `Immich no longer exposes ${path}. The deprecated /api/jobs API has likely been removed in your Immich version — Power Tools' job runner needs updating to the replacement endpoint.`
      );
    }

    throw new Error(`Immich API error ${res.status}: ${text}`);
  }

  const contentType = res.headers.get("content-type");
  return contentType?.includes("application/json") ? res.json() : null;
}

/**
 * GET /api/jobs — current counts and paused state for every queue.
 * Returns Immich's raw shape keyed by queue name.
 */
export async function getQueueStatus(
  ownerId: string,
  user?: IUser
): Promise<Record<string, IJobQueueStatus>> {
  return immichJobFetch("/jobs", "GET", null, ownerId, user);
}

/**
 * PUT /api/jobs/{queueName} — run a command against one queue.
 *
 * `command: "start"` with `force: false` queues only assets that have never
 * been processed ("missing"); `force: true` reprocesses everything.
 */
export async function runQueueCommand(
  queueName: string,
  command: JobCommand,
  force: boolean,
  ownerId: string,
  user?: IUser
): Promise<any> {
  return immichJobFetch(
    `/jobs/${encodeURIComponent(queueName)}`,
    "PUT",
    { command, force },
    ownerId,
    user
  );
}
