import { sqliteTable, text, integer, real, unique } from "drizzle-orm/sqlite-core";
import { randomUUID } from "crypto";

export const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  cronSchedule: text("cron_schedule"),
  webhookToken: text("webhook_token").unique(),
  viewport: text("viewport").notNull().default('{"x":0,"y":0,"zoom":1}'),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

export const workflowNodes = sqliteTable("workflow_nodes", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  workflowId: text("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  subType: text("sub_type").notNull(),
  data: text("data").notNull().default("{}"),
  positionX: real("position_x").notNull().default(0),
  positionY: real("position_y").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const workflowEdges = sqliteTable("workflow_edges", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  workflowId: text("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  sourceNodeId: text("source_node_id").notNull().references(() => workflowNodes.id, { onDelete: "cascade" }),
  targetNodeId: text("target_node_id").notNull().references(() => workflowNodes.id, { onDelete: "cascade" }),
  sourceHandle: text("source_handle"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const workflowRuns = sqliteTable("workflow_runs", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  workflowId: text("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  trigger: text("trigger").notNull(),
  status: text("status").notNull().default("running"),
  result: text("result").default("{}"),
  error: text("error"),
  startedAt: integer("started_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

export const workflowProcessedAssets = sqliteTable("workflow_processed_assets", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  workflowId: text("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  assetId: text("asset_id").notNull(),
  runId: text("run_id").notNull().references(() => workflowRuns.id, { onDelete: "cascade" }),
  processedAt: integer("processed_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (t) => [
  // One row per workflow/asset: runs upsert this rather than appending, so the
  // table stays bounded by library size instead of growing with every run.
  unique().on(t.workflowId, t.assetId),
]);
