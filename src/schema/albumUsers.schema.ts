import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

export const albumUsers = pgTable('album_user', {
  albumId: uuid('albumId').notNull(),
  userId: uuid('userId').notNull(),
  role: varchar('role').notNull().default('editor'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
});
