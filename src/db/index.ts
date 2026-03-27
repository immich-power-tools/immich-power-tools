import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "path";
import * as schema from "./schema";

const DB_PATH =
  process.env.APP_DB_PATH || path.join(process.cwd(), "data", "app.db");

const client = createClient({ url: `file:${DB_PATH}` });

export const appDb = drizzle(client, { schema });

// Run pending migrations automatically on startup.
// migrate() is idempotent — safe to call on every boot.
export async function runMigrations() {
  await migrate(appDb, {
    migrationsFolder: path.join(process.cwd(), "src", "db", "migrations"),
  });
}
