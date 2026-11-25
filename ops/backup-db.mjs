#!/usr/bin/env node
// Nightly backup of the Financer SQLite database.
// - Takes a consistent copy while the app keeps running (VACUUM INTO).
// - Gzips it into BACKUP_DIR/daily, keeps the newest 14 dailies.
// - On Sundays also keeps a weekly copy (newest 8).
// - Optional: BACKUP_COPY_CMD is run with the file path appended, to send the
//   copy off this machine (e.g. an rclone or scp command). Not set = local only.
// Run by systemd (ops/financer-backup.timer). Usage: node backup-db.mjs
import { execFileSync } from "node:child_process";
import { createReadStream, createWriteStream, mkdirSync, readdirSync, rmSync, statSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { DatabaseSync } from "node:sqlite";

const DB = process.env.DATABASE_PATH || "/data/workspace/financer/data/financer.db";
const DIR = process.env.BACKUP_DIR || "/data/workspace/financer/backups";
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
const daily = join(DIR, "daily");
const weekly = join(DIR, "weekly");
mkdirSync(daily, { recursive: true, mode: 0o700 });
mkdirSync(weekly, { recursive: true, mode: 0o700 });

const raw = join(daily, `financer-${stamp}.db`);
const src = new DatabaseSync(DB, { readOnly: true });
src.prepare("vacuum into ?").run(raw);
src.close();

// Sanity check before keeping it: the copy opens and passes an integrity check.
const check = new DatabaseSync(raw, { readOnly: true });
const ok = check.prepare("pragma integrity_check").get();
const users = check.prepare("select count(*) as n from users").get().n;
check.close();
if (Object.values(ok)[0] !== "ok") {
  rmSync(raw);
  throw new Error(`backup failed integrity check: ${JSON.stringify(ok)}`);
}

const gz = `${raw}.gz`;
await pipeline(createReadStream(raw), createGzip({ level: 9 }), createWriteStream(gz, { mode: 0o600 }));
rmSync(raw);
if (new Date().getUTCDay() === 0) copyFileSync(gz, join(weekly, `financer-${stamp}.db.gz`));

const prune = (dir, keep) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".db.gz"))
    .sort()
    .reverse()
    .slice(keep)
    .forEach((f) => rmSync(join(dir, f)));
prune(daily, 14);
prune(weekly, 8);

if (process.env.BACKUP_COPY_CMD) {
  const [cmd, ...args] = process.env.BACKUP_COPY_CMD.split(" ");
  execFileSync(cmd, [...args, gz], { stdio: "inherit", timeout: 10 * 60 * 1000 });
}
console.log(`backup ok: ${gz} (${statSync(gz).size} bytes, ${users} users)`);
