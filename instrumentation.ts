export async function register() {
  // Only run on the Node.js server, not in the Edge runtime or client
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("./src/db");
    await runMigrations();
  }
}
