import { pgTable, uuid, varchar, integer, bigint, timestamp, doublePrecision, text } from 'drizzle-orm/pg-core';
import { assets } from './assets.schema'; // Assuming you have an assets table defined

export const exif = pgTable('asset_exif', {
  assetId: uuid('assetId').primaryKey().notNull().references(() => assets.id, { onDelete: 'cascade' }),
  make: varchar('make'),
  model: varchar('model'),
  exifImageWidth: integer('exifImageWidth'),
  exifImageHeight: integer('exifImageHeight'),
  fileSizeInByte: bigint('fileSizeInByte', { mode: 'number' }),
  orientation: varchar('orientation'),
  dateTimeOriginal: timestamp('dateTimeOriginal', { withTimezone: true }),
  modifyDate: timestamp('modifyDate', { withTimezone: true }),
  lensModel: varchar('lensModel'),
  fNumber: doublePrecision('fNumber'),
  focalLength: doublePrecision('focalLength'),
  iso: integer('iso'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  city: varchar('city'),
  state: varchar('state'),
  country: varchar('country'),
  description: text('description').notNull().default(''),
  fps: doublePrecision('fps'),
  exposureTime: varchar('exposureTime'),
  livePhotoCID: varchar('livePhotoCID'),
  timeZone: varchar('timeZone'),
  projectionType: varchar('projectionType'),
  profileDescription: varchar('profileDescription'),
  colorspace: varchar('colorspace'),
  bitsPerSample: integer('bitsPerSample'),
  autoStackId: varchar('autoStackId'),
  rating: integer('rating'),
  updatedAt: timestamp('updatedAt', { withTimezone: true }),
});

export type IExifColumns = keyof typeof exif.$inferSelect