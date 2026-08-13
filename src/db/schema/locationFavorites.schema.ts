import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { randomUUID } from "crypto";

// Per-user saved locations for the GPS Manager ("Home", "Cottage", …).
// Stored server-side so they follow the user across browsers/devices.
export const locationFavorites = sqliteTable("location_favorites", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  // Manual ordering (drag to reorder); new favourites append at the end.
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});
