import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { randomUUID } from "crypto";

export const importJobs = sqliteTable("import_jobs", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),       // 'immich' | 'nextcloud' | 'ente' | 'photoprism'
  status: text("status").notNull().default("pending"), // pending | processing | completed | failed
  url: text("url").notNull(),                 // base URL of source
  urlConfig: text("url_config").notNull().default("{}"),   // JSON: auth/connection (key, token, etc.)
  importData: text("import_data").notNull().default("{}"), // JSON: album options, resolved albumId, etc.
  totalCount: integer("total_count").notNull().default(0),
  uploadedCount: integer("uploaded_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

export const importJobItems = sqliteTable("import_job_items", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  jobId: text("job_id").notNull().references(() => importJobs.id),
  assetId: text("asset_id").notNull(),        // source platform's asset ID
  status: text("status").notNull().default("pending"), // pending | processing | uploaded | skipped | failed
  itemData: text("item_data").notNull().default("{}"),  // JSON: filename, type, dates, isFavorite, etc.
  immichId: text("immich_id"),                // Immich asset ID after successful upload
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});
