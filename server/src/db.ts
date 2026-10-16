import { Pool, type PoolClient } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      allowExitOnIdle: true,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : undefined,
    })
  : new Pool({
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      allowExitOnIdle: true,
      host: process.env.DB_HOST?.trim() || "localhost",
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME?.trim(),
      user: process.env.DB_USER?.trim(),
      password: process.env.DB_PASSWORD,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : undefined,
    });

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});

export async function query<T extends object = Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
) {
  return pool.query<T>(text, values);
}

export async function withTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Database transaction rollback failed:", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabaseConnection(): Promise<void> {
  await pool.query("SELECT 1");
}

export async function closeDatabaseConnection(): Promise<void> {
  await pool.end();
}

export default pool;