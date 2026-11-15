// Applies the SQL files in supabase/migrations (in name order) to SUPABASE_DB_URL.
// Each applied file is recorded in public.schema_migrations, so it runs only once.
// A file runs in one transaction together with its record, so a failure leaves
// nothing half-applied.
//
// Files written before tracking existed wrap themselves in begin/commit and use
// plain CREATE statements. If such a file fails with "already exists", it was
// applied earlier: it is recorded as applied without changing anything.
//
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
const selfWrapped = (sql) => /^\s*begin\s*;/im.test(sql);

try {
  await client.connect();
  // Bookkeeping table: not part of the app API, so no policies and no grants.
  await client.query(`
    create table if not exists public.schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    );
    alter table public.schema_migrations enable row level security;
    revoke all on public.schema_migrations from anon, authenticated;
  `);
  const { rows } = await client.query("select version from public.schema_migrations");
  const done = new Set(rows.map((r) => r.version));

  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (done.has(file)) {
      console.log(`up to date  ${file}`);
      continue;
    }
    const sql = await readFile(path.join(dir, file), "utf8");
    const record = () => client.query("insert into public.schema_migrations (version) values ($1)", [file]);
    try {
      if (selfWrapped(sql)) {
        await client.query(sql);
        await record();
      } else {
        await client.query("begin");
        await client.query(sql);
        await record();
        await client.query("commit");
      }
      console.log(`applied     ${file}`);
    } catch (err) {
      await client.query("rollback").catch(() => {});
      if (selfWrapped(sql) && ALREADY_EXISTS.has(err.code)) {
        await record();
        console.log(`recorded    ${file} (applied before tracking existed)`);
        continue;
      }
      throw Object.assign(err, { file });
    }
  }
} catch (err) {
  console.error(
    "Migration failed:",
    err.file ?? "",
    err.code ?? "",
    String(err.message).replace(/postgres(ql)?:\/\/\S+/g, "[db-url]"),
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
