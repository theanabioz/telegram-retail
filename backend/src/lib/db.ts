import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "../config.js";
import { HttpError } from "./http-error.js";

const connectionString = env.DATABASE_URL;
const hasDiscreteConfig = Boolean(env.PGHOST && env.PGDATABASE && env.PGUSER);

const pool = connectionString || hasDiscreteConfig
  ? new Pool({
      connectionString,
      host: env.PGHOST,
      port: env.PGPORT ?? 5432,
      database: env.PGDATABASE,
      user: env.PGUSER,
      password: env.PGPASSWORD,
      ssl: env.PGSSL ? { rejectUnauthorized: false } : undefined,
      max: env.PG_POOL_MAX,
      idleTimeoutMillis: env.PG_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: env.PG_CONNECTION_TIMEOUT_MS,
    })
  : null;

function getPool() {
  if (!pool) {
    throw new HttpError(500, "Postgres connection is not configured");
  }

  return pool;
}

export type DbLike = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export async function queryDb<T extends QueryResultRow>(text: string, params: unknown[] = [], db?: DbLike) {
  return (db ?? getPool()).query<T>(text, params);
}

export async function maybeOne<T extends QueryResultRow>(text: string, params: unknown[] = [], db?: DbLike) {
  const result = await queryDb<T>(text, params, db);
  return result.rows[0] ?? null;
}

export async function one<T extends QueryResultRow>(text: string, params: unknown[] = [], db?: DbLike) {
  const row = await maybeOne<T>(text, params, db);
  if (!row) {
    throw new HttpError(500, "Expected query to return one row");
  }

  return row;
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();

  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
