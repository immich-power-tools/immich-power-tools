import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const tags = pgTable("tag", {
  id: uuid("id").notNull().primaryKey(),
  userId: uuid("userId").notNull(),
  value: varchar("value").notNull(),
  color: varchar("color"),
  parentId: uuid("parentId"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});
