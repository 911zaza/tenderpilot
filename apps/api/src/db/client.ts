import pg from "pg";
import { env } from "../env.js";

export const pool = new pg.Pool({ connectionString: env.databaseUrl });

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}
