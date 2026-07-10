import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';

import { Client, Pool } from "pg";
import { ENV } from "./environment";
import * as schema from "@/schema";
import { sql } from 'drizzle-orm';
import { findMissingKeys } from '@/helpers/data.helper';
import { APIError } from '@/lib/api';

const pool = ENV.DATABASE_URL ? new Pool({
  connectionString: ENV.DATABASE_URL,
  keepAlive: true,
}) : new Pool({
  user: ENV.DB_USERNAME,
  password: ENV.DB_PASSWORD,
  host: ENV.DB_HOST,
  port: parseInt(ENV.DB_PORT),
  database: ENV.DB_DATABASE_NAME,
});

class DatabaseConnectionError extends Error {
  error: string;
  constructor(message: string, error: string) {
    super(message);
    this.name = "DatabaseConnectionError";
    this.error = error;
  }
}

const getRootCause = (error: any): any => {
  let current = error;
  while (current?.cause) current = current.cause;
  return current;
};

const describePgError = (error: any): string => {
  const root = getRootCause(error);
  const target = `${ENV.DB_HOST || '?'}:${ENV.DB_PORT || '?'}`;
  const code = root?.code as string | undefined;

  switch (code) {
    case 'ENOTFOUND':
      return `Cannot resolve database host "${ENV.DB_HOST}". Check DB_HOST and that the power-tools container is on the same Docker network as the Immich Postgres container (use the container name, e.g. "immich_postgres").`;
    case 'ECONNREFUSED':
      return `Connection refused at ${target}. The host is reachable but nothing is listening on that port — check DB_PORT and that Postgres is running.`;
    case 'ETIMEDOUT':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return `Cannot reach ${target} (${code}). Likely a network/firewall issue or the wrong DB_HOST for this container.`;
    case '28P01':
      return `Password authentication failed for user "${ENV.DB_USERNAME}". Check DB_PASSWORD (and ensure no extra quotes/spaces in .env).`;
    case '28000':
      return `Authentication failed for user "${ENV.DB_USERNAME}" at ${target}. Check DB_USERNAME and pg_hba rules.`;
    case '3D000':
      return `Database "${ENV.DB_DATABASE_NAME}" does not exist on ${target}. Check DB_DATABASE_NAME.`;
    case '57P03':
      return `Postgres at ${target} is starting up and not yet ready to accept connections.`;
    default:
      return `${root?.message || error?.message || 'Unknown error'}${code ? ` (code: ${code})` : ''} — target ${target}, user "${ENV.DB_USERNAME}", db "${ENV.DB_DATABASE_NAME}".`;
  }
};

export const connectDB = async (db: NodePgDatabase<typeof schema>) => {
  try {
    const missingKeys = findMissingKeys(ENV, ['DB_USERNAME', 'DB_PASSWORD', 'DB_HOST', 'DB_PORT', 'DB_DATABASE_NAME']);
    if (!ENV.DATABASE_URL && missingKeys.length > 0) {
      throw new APIError({
        message: `Some database credentials are missing: ${missingKeys.join(', ')}. Please add them to the .env file`,
        status: 500,
      });
    } else {
      return await db.execute(sql`SELECT 1`); // Execute a simple query
    }
  } catch (error: any) {
    if (error instanceof APIError) throw error;
    const root = getRootCause(error);
    console.error('[db] connection failed:', {
      code: root?.code,
      message: root?.message,
      host: ENV.DB_HOST,
      port: ENV.DB_PORT,
      user: ENV.DB_USERNAME,
      database: ENV.DB_DATABASE_NAME,
    });
    throw new DatabaseConnectionError(describePgError(error), "Database connection failed");
  }
}

export const db = drizzle(pool, {
  schema
});
