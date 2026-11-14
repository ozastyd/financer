// Verifies Row Level Security isolation with two throwaway users.
// Everything runs inside one transaction that is ROLLED BACK at the end, so no
// users or rows are left behind.
// Usage: node --env-file=.env.local scripts/check-rls.mjs
import { randomUUID } from "node:crypto";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
const a = randomUUID();
const b = randomUUID();
let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

async function as(uid, fn) {
  await client.query("savepoint s");
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
  try {
    return await fn();
  } finally {
    await client.query("reset role");
    await client.query("release savepoint s");
  }
}

try {
  await client.connect();
  await client.query("begin");
  for (const [id, email] of [[a, "rls-a@financer.test"], [b, "rls-b@financer.test"]]) {
    await client.query(
      "insert into auth.users (id, aud, role, email, instance_id) values ($1, 'authenticated', 'authenticated', $2, '00000000-0000-0000-0000-000000000000')",
      [id, email],
    );
  }

  await as(a, async () => {
    await client.query("select public.seed_default_categories()");
    const cat = (await client.query("select id from public.categories where type = 'expense' limit 1")).rows[0].id;
    await client.query(
      "insert into public.transactions (user_id, type, category_id, amount, transaction_date) values ($1, 'expense', $2, 35000, current_date)",
      [a, cat],
    );
    await client.query("insert into public.user_profiles (user_id, display_name) values ($1, 'A')", [a]);
    const g = await client.query(
      "insert into public.financial_goals (user_id, title, target_amount) values ($1, 'Goal A', 1000000) returning id",
      [a],
    );
    await client.query(
      "insert into public.goal_contributions (goal_id, user_id, kind, amount, contribution_date) values ($1, $2, 'deposit', 250000, current_date)",
      [g.rows[0].id, a],
    );
    const cur = (await client.query("select current_amount from public.financial_goals")).rows[0].current_amount;
    check("trigger keeps goal current_amount in sync (250000)", Number(cur) === 250000);
    let blocked = false;
    try {
      await client.query("savepoint w");
      await client.query(
        "insert into public.goal_contributions (goal_id, user_id, kind, amount, contribution_date) values ($1, $2, 'withdrawal', 999999, current_date)",
        [g.rows[0].id, a],
      );
    } catch {
      blocked = true;
    }
    await client.query("rollback to savepoint w");
    check("withdrawal larger than balance is rejected", blocked);
    let negative = false;
    try {
      await client.query("savepoint n");
      await client.query(
        "insert into public.transactions (user_id, type, category_id, amount, transaction_date) values ($1, 'expense', $2, -5, current_date)",
        [a, cat],
      );
    } catch {
      negative = true;
    }
    await client.query("rollback to savepoint n");
    check("negative amount is rejected", negative);
  });

  await as(b, async () => {
    await client.query("select public.seed_default_categories()");
    const tables = ["user_profiles", "categories", "transactions", "financial_goals", "goal_contributions"];
    for (const t of tables) {
      const n = (await client.query(`select count(*)::int as n from public.${t} where user_id = $1`, [a])).rows[0].n;
      check(`user B sees 0 of user A's rows in ${t}`, n === 0);
    }
    const own = (await client.query("select count(*)::int as n from public.categories")).rows[0].n;
    check("user B sees only own seeded categories (17)", own === 17);
    const upd = await client.query("update public.transactions set amount = 1 where user_id = $1", [a]);
    check("user B cannot update user A's transactions", upd.rowCount === 0);
    const del = await client.query("delete from public.financial_goals where user_id = $1", [a]);
    check("user B cannot delete user A's goals", del.rowCount === 0);
    let spoof = false;
    try {
      await client.query("savepoint x");
      await client.query("insert into public.user_profiles (user_id, display_name) values ($1, 'spoof')", [a]);
    } catch {
      spoof = true;
    }
    await client.query("rollback to savepoint x");
    check("user B cannot insert rows owned by user A", spoof);
    let crossCat = false;
    try {
      await client.query("savepoint y");
      const aCat = await client.query("select id from public.categories limit 1");
      // B's own category id but claiming A's user id must fail; and A's category id is invisible to B
      await client.query(
        "insert into public.transactions (user_id, type, category_id, amount, transaction_date) values ($1, 'expense', $2, 1000, current_date)",
        [a, aCat.rows[0].id],
      );
    } catch {
      crossCat = true;
    }
    await client.query("rollback to savepoint y");
    check("user B cannot write a transaction into user A's account", crossCat);
  });

  const anon = await (async () => {
    await client.query("savepoint z");
    await client.query("set local role anon");
    const r = await client.query("select count(*)::int as n from public.transactions");
    await client.query("reset role");
    await client.query("release savepoint z");
    return r.rows[0].n;
  })();
  check("anonymous role sees no transactions", anon === 0);
} catch (err) {
  console.error("Error:", err.code ?? "", err.message);
  failures++;
} finally {
  await client.query("rollback").catch(() => {});
  await client.end().catch(() => {});
}
console.log(failures === 0 ? "\nAll RLS checks passed (transaction rolled back)." : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
