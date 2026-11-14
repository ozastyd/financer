// Applies the SQL files in supabase/migrations (in name order) to SUPABASE_DB_URL.
// Each file wraps itself in a transaction and uses plain CREATE statements, so a
// file that was already applied fails with "already exists" and changes nothing.
// Usage: node --env-file=.env.local scripts/apply-migrations.mjs
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set.");
  process.exit(1);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const ALREADY_EXISTS = new Set(["42P07", "42723", "42710"]);

try {
  await client.connect();
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(path.join(dir, file), "utf8");
    try {
      await client.query(sql);
      console.log(`applied  ${file}`);
    } catch (err) {
      await client.query("rollback").catch(() => {});
      if (ALREADY_EXISTS.has(err.code)) {
        console.log(`skipped  ${file} (objects already exist)`);
        continue;
      }
      throw err;
    }
  }
} catch (err) {
  console.error("Migration failed:", err.code ?? "", String(err.message).replace(/postgres(ql)?:\/\/\S+/g, "[db-url]"));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
