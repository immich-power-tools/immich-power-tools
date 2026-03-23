import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";
import { randomUUID } from "crypto";

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  userId: text("user_id").notNull(),
  purpose: text("purpose").notNull(),
  keyName: text("key_name").notNull(),
  secret: text("secret").notNull(),
  immichKeyId: text("immich_key_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (t) => [
  unique().on(t.userId, t.purpose),
]);
