export async function register() {
  // Only run on the Node.js server, not in the Edge runtime or client
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("./db");
    await runMigrations();

    const { resumePendingJobs } = await import("./workers/import/runner");
    await resumePendingJobs();

    const { loadAllScheduledWorkflows } = await import("./lib/workflow/scheduler");
    await loadAllScheduledWorkflows();

    const { loadAllJobSchedules } = await import("./lib/jobs/scheduler");
    await loadAllJobSchedules();
  }
}
