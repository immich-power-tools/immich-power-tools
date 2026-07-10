import { pgTable, uuid, varchar, timestamp, boolean, text } from 'drizzle-orm/pg-core';

export const albums = pgTable('album', {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    albumName: varchar('albumName').notNull().default('Untitled Album'),
    createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
    albumThumbnailAssetId: uuid('albumThumbnailAssetId'),
    updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
    description: text('description').notNull().default(''),
    deletedAt: timestamp('deletedAt', { withTimezone: true }),
    isActivityEnabled: boolean('isActivityEnabled').notNull().default(true),
    order: varchar('order').notNull().default('desc'),
});
