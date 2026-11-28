#!/usr/bin/env node
// What people answered to "Seberapa Financer membantumu?".
// Read-only; prints no names or emails, so the output is safe to paste.
//   node ops/ratings.mjs            (live database)
//   DATABASE_PATH=/path/copy.db node ops/ratings.mjs
import { DatabaseSync } from "node:sqlite";

const DB = process.env.DATABASE_PATH || "/data/workspace/financer/data/financer.db";
const db = new DatabaseSync(DB, { readOnly: true });
const LABELS = ["", "Buruk", "Kurang", "Lumayan", "Membantu", "Suka banget"];

const has = db.prepare("select 1 from sqlite_master where type = 'table' and name = 'app_ratings'").get();
if (!has) {
  console.log("Belum ada penilaian (tabel app_ratings belum dibuat).");
  process.exit(0);
}

const rows = db.prepare("select rating, reasons, note, updated_at from app_ratings order by updated_at desc").all();
const asked = db.prepare("select count(*) as n, coalesce(sum(asks), 0) as asks from rating_prompts").get();
console.log(`Penilaian: ${rows.length} orang · kartu ditampilkan ke ${asked.n} orang (${asked.asks} kali)`);
if (!rows.length) process.exit(0);

const avg = rows.reduce((s, r) => s + r.rating, 0) / rows.length;
console.log(`Rata-rata: ${avg.toFixed(2)} / 5\n`);
for (let v = 5; v >= 1; v--) {
  const n = rows.filter((r) => r.rating === v).length;
  const pct = Math.round((n / rows.length) * 100);
  console.log(`${v} ${LABELS[v].padEnd(12)} ${"█".repeat(Math.round(pct / 4)).padEnd(25)} ${n} (${pct}%)`);
}

const counts = new Map();
for (const r of rows) for (const reason of JSON.parse(r.reasons || "[]")) counts.set(reason, (counts.get(reason) ?? 0) + 1);
if (counts.size) {
  console.log("\nAlasan yang dipilih:");
  for (const [reason, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}× ${reason}`);
}

const notes = rows.filter((r) => r.note).slice(0, 20);
if (notes.length) {
  console.log("\nCatatan terbaru:");
  for (const r of notes) console.log(`  ${r.updated_at.slice(0, 10)} · ${r.rating}/5 · ${r.note.replace(/\s+/g, " ")}`);
}
