import { pgTable, uuid, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';

export const assets = pgTable('asset', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  deviceAssetId: varchar('deviceAssetId').notNull(),
  ownerId: uuid('ownerId').notNull(),
  deviceId: varchar('deviceId').notNull(),
  type: varchar('type').notNull(),
  originalPath: varchar('originalPath').notNull(),
  fileCreatedAt: timestamp('fileCreatedAt', { withTimezone: true }).notNull(),
  fileModifiedAt: timestamp('fileModifiedAt', { withTimezone: true }).notNull(),
  isFavorite: boolean('isFavorite').default(false).notNull(),
  duration: varchar('duration'),
  // checksum: bytea('checksum').notNull(),
  visibility: varchar('visibility').default('timeline').notNull(),
  livePhotoVideoId: uuid('livePhotoVideoId').references((): any => assets.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  status: varchar('status').default('active').notNull(),
  originalFileName: varchar('originalFileName').notNull(),
  // thumbhash: bytea('thumbhash'),
  isOffline: boolean('isOffline').default(false).notNull(),
  // libraryId: uuid('libraryId').references(() => libraries.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  isExternal: boolean('isExternal').default(false).notNull(),
  deletedAt: timestamp('deletedAt', { withTimezone: true }),
  localDateTime: timestamp('localDateTime', { withTimezone: true }).notNull(),
  stackId: uuid('stackId'),
  duplicateId: uuid('duplicateId'),
});

// // Note: You'll need to define these referenced tables as well
// export const users = pgTable('users', {
//   id: uuid('id').primaryKey(),
//   // ... other columns
// });

// export const libraries = pgTable('libraries', {
//   id: uuid('id').primaryKey(),
//   // ... other columns
// });

// export const assetStack = pgTable('asset_stack', {
//   id: uuid('id').primaryKey(),
//   // ... other columns
// });