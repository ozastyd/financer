// Checks the phase-1 read functions (dashboard, period_totals, transactions_page)
// against values computed here from the same rows, checks user isolation, and
// times them on a large history.
// Everything runs inside one transaction that is ROLLED BACK at the end, so no
// users or rows are left behind.
// Usage: node --env-file=.env.local scripts/check-aggregates.mjs [transactionCount]
import { randomUUID } from "node:crypto";
import pg from "pg";

// Keep dates and timestamps as the exact strings Postgres sends (like the
// browser client does), so cursors keep full precision and no timezone shifts.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1184, (v) => v);

const N = Number(process.argv[2] ?? 10000);
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
const a = randomUUID();
const b = randomUUID();
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

async function as(uid, fn) {
  await client.query("savepoint s");
  if (uid === "anon") {
    await client.query("set local role anon");
  } else {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
  }
  try {
    return await fn();
  } finally {
    await client.query("rollback to savepoint s");
    await client.query("reset role");
  }
}

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(Date.parse(`${s}T00:00:00Z`) + n * 86400000));
const TODAY = "2026-11-15";
const range = { start: "2026-11-01", end: "2026-11-30", prevStart: "2026-10-01", prevEnd: "2026-10-31" };

function seededRandom(seed) {
  let x = seed;
  return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
}

try {
  await client.connect();
  await client.query("begin");
  for (const [id, email] of [[a, "agg-a@financer.test"], [b, "agg-b@financer.test"]]) {
    await client.query(
      "insert into auth.users (id, aud, role, email, instance_id) values ($1, 'authenticated', 'authenticated', $2, '00000000-0000-0000-0000-000000000000')",
      [id, email],
    );
  }
  await client.query("savepoint seed");
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: a, role: "authenticated" })]);
  await client.query("select public.seed_default_categories()");
  await client.query("insert into public.financial_profiles (user_id, current_savings) values ($1, 500000)", [a]);
  await client.query("reset role");
  await client.query("release savepoint seed");

  const cats = (await client.query("select id, name, type from public.categories where user_id = $1", [a])).rows;
  const exp = cats.filter((c) => c.type === "expense");
  const inc = cats.filter((c) => c.type === "income");

  // Two years of history ending today, generated deterministically.
  const rnd = seededRandom(42);
  const rows = [];
  for (let i = 0; i < N; i++) {
    const income = rnd() < 0.08;
    const cat = income ? inc[Math.floor(rnd() * inc.length)] : exp[Math.floor(rnd() * exp.length)];
    const amount = income ? 500000 + Math.floor(rnd() * 5000000) : 5000 + Math.floor(rnd() * 300000);
    const date = addDays(TODAY, -Math.floor(rnd() * 730));
    const description = i % 50 === 0 ? `Kopi_arabika ${i}` : `Belanja ${i}`;
    rows.push({ type: income ? "income" : "expense", category_id: cat.id, amount, date, description });
  }
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    const params = [];
    const values = chunk.map((r, j) => {
      params.push(a, r.type, r.category_id, r.amount, r.date, r.description);
      const k = j * 6;
      return `($${k + 1}, $${k + 2}, $${k + 3}, $${k + 4}, $${k + 5}, $${k + 6})`;
    });
    await client.query(
      `insert into public.transactions (user_id, type, category_id, amount, transaction_date, description) values ${values.join(",")}`,
      params,
    );
  }
  await client.query("analyze public.transactions");
  console.log(`seeded ${N} transactions in ${Date.now() - t0} ms`);

  // Expected values, computed in JS from the generated rows.
  const signed = (r) => (r.type === "income" ? r.amount : -r.amount);
  const tot = (from, to) => {
    const sel = rows.filter((r) => r.date >= from && r.date <= to);
    const income = sel.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
    const expense = sel.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
    return { income, expense, count: sel.length };
  };
  const byCat = (type, from, to) => {
    const m = new Map();
    for (const r of rows) if (r.type === type && r.date >= from && r.date <= to) m.set(r.category_id, (m.get(r.category_id) ?? 0) + r.amount);
    return m;
  };

  await as(a, async () => {
    const started = Date.now();
    const { rows: dr } = await client.query("select public.dashboard($1,$2,$3,$4,'day',$5) d", [range.start, range.end, range.prevStart, range.prevEnd, TODAY]);
    const dashMs = Date.now() - started;
    const d = dr[0].d;
    const n = (v) => Number(v);
    const ec = tot(range.start, range.end);
    const ep = tot(range.prevStart, range.prevEnd);
    check("dashboard current totals", n(d.current.income) === ec.income && n(d.current.expense) === ec.expense && n(d.current.count) === ec.count, JSON.stringify([d.current, ec]));
    check("dashboard previous totals", n(d.previous.income) === ep.income && n(d.previous.expense) === ep.expense && n(d.previous.count) === ep.count);
    const net = new Map();
    for (const r of rows) if (r.date >= range.prevStart && r.date <= range.end) net.set(r.date, (net.get(r.date) ?? 0) + signed(r));
    const got = new Map(d.net_by_bucket.map((x) => [x.d, n(x.net)]));
    check("dashboard daily net buckets", got.size === net.size && [...net].every(([k, v]) => got.get(k) === v));
    const ecat = byCat("expense", range.start, range.end);
    check("dashboard expense by category", d.expense_by_category.length === ecat.size && d.expense_by_category.every((c) => ecat.get(c.category_id) === n(c.amount)));
    const icat = byCat("income", range.start, range.end);
    check("dashboard income by category", d.income_by_category.length === icat.size && d.income_by_category.every((c) => icat.get(c.category_id) === n(c.amount)));
    check("dashboard all-time net and count", n(d.all_time_net) === rows.reduce((s, r) => s + signed(r), 0) && n(d.all_time_count) === N);
    check("dashboard today count", n(d.today_count) === rows.filter((r) => r.date === TODAY).length);
    check("dashboard starting savings", n(d.starting_savings) === 500000);
    console.log(`      dashboard (month) took ${dashMs} ms over ${N} rows`);

    const yStart = Date.now();
    const { rows: yr } = await client.query("select public.dashboard('2026-01-01','2026-12-31','2025-01-01','2025-12-31','month',$1) d", [TODAY]);
    const yMs = Date.now() - yStart;
    const ybuckets = new Map();
    for (const r of rows) if (r.date >= "2025-01-01") ybuckets.set(`${r.date.slice(0, 7)}-01`, (ybuckets.get(`${r.date.slice(0, 7)}-01`) ?? 0) + signed(r));
    const ygot = new Map(yr[0].d.net_by_bucket.map((x) => [x.d, n(x.net)]));
    check("dashboard monthly net buckets (year view)", ygot.size === ybuckets.size && [...ybuckets].every(([k, v]) => ygot.get(k) === v));
    console.log(`      dashboard (year) took ${yMs} ms`);

    const { rows: pt } = await client.query("select public.period_totals($1,$2) t", [range.start, range.end]);
    check("period_totals", n(pt[0].t.income) === ec.income && n(pt[0].t.expense) === ec.expense && n(pt[0].t.count) === ec.count && pt[0].t.has_any === true);

    // Walk every page of a month and compare with the expected order and day totals.
    const monthRows = rows.filter((r) => r.date >= "2026-10-01" && r.date <= "2026-10-31");
    let cursor = [null, null, null];
    const seen = [];
    let pages = 0;
    let firstPageMs = 0;
    for (;;) {
      const s = Date.now();
      const { rows: page } = await client.query("select * from public.transactions_page('2026-10-01','2026-10-31', null, null, $1, $2, $3, 30)", cursor);
      if (pages === 0) firstPageMs = Date.now() - s;
      pages++;
      seen.push(...page);
      if (page.length < 30) break;
      const last = page[page.length - 1];
      cursor = [last.transaction_date, last.created_at, last.id];
    }
    const dates = seen.map((r) => r.transaction_date);
    check("transactions_page returns every row of the month exactly once", seen.length === monthRows.length && new Set(seen.map((r) => r.id)).size === seen.length, `${seen.length} vs ${monthRows.length}`);
    check("transactions_page is newest day first", dates.every((d, i) => i === 0 || dates[i - 1] >= d));
    const dayNet = new Map();
    for (const r of monthRows) dayNet.set(r.date, (dayNet.get(r.date) ?? 0) + signed(r));
    check("transactions_page day_net is the full day's net on every page", seen.every((r, i) => dayNet.get(dates[i]) === Number(r.day_net)));
    console.log(`      first page took ${firstPageMs} ms; ${pages} pages for ${monthRows.length} rows`);

    // "_" is a LIKE wildcard; escaped, it must match only descriptions that contain "_".
    const { rows: srch } = await client.query("select * from public.transactions_page('2024-01-01','2026-12-31', null, '_', null, null, null, 100)");
    const expectedSearch = rows.filter((r) => r.description.includes("_")).length;
    check("search treats LIKE wildcards literally", srch.length === Math.min(expectedSearch, 100) && srch.every((r) => r.description.includes("_")), `${srch.length} vs ${expectedSearch}`);
    const { rows: byCatName } = await client.query("select t.* from public.transactions_page('2026-10-01','2026-10-31', null, $1, null, null, null, 100) t", [exp[0].name]);
    check("search matches category names", byCatName.length > 0 && byCatName.every((r) => r.category_id === exp[0].id || (r.description ?? "").toLowerCase().includes(exp[0].name.toLowerCase())));
    const { rows: typed } = await client.query("select * from public.transactions_page('2026-10-01','2026-10-31', 'income', null, null, null, null, 100)");
    check("type filter", typed.every((r) => r.type === "income") && typed.length === monthRows.filter((r) => r.type === "income").length);
  });

  await as(b, async () => {
    const { rows: dr } = await client.query("select public.dashboard($1,$2,$3,$4,'day',$5) d", [range.start, range.end, range.prevStart, range.prevEnd, TODAY]);
    check("another user sees none of these totals", Number(dr[0].d.all_time_count) === 0 && dr[0].d.net_by_bucket.length === 0);
    const { rows: pg2 } = await client.query("select * from public.transactions_page('2024-01-01','2026-12-31')");
    check("another user's transaction list is empty", pg2.length === 0);
    const { rows: pt } = await client.query("select public.period_totals('2024-01-01','2026-12-31') t");
    check("another user's period totals are zero", Number(pt[0].t.count) === 0 && pt[0].t.has_any === false);
  });

  await as("anon", async () => {
    let blocked = false;
    try {
      await client.query("select public.dashboard('2026-11-01','2026-11-30','2026-10-01','2026-10-31','day','2026-11-15')");
    } catch (e) {
      blocked = e.code === "42501";
    }
    check("signed-out visitors cannot call dashboard", blocked);
  });
} catch (err) {
  console.error("Check failed to run:", err.code ?? "", String(err.message).replace(/postgres(ql)?:\/\/\S+/g, "[db-url]"));
  failures++;
} finally {
  await client.query("rollback").catch(() => {});
  await client.end().catch(() => {});
}
console.log(failures === 0 ? "\nAll aggregate checks passed (everything rolled back)." : `\n${failures} check(s) failed (everything rolled back).`);
process.exitCode = failures === 0 ? 0 : 1;
