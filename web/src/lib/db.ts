import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { DashboardArgs, DashboardRaw } from "./dashboard";
import type { Category, Contribution, FinancialProfile, Goal, UserProfile } from "./types";

// Single-user SQLite storage. Replaces Supabase for a personal deployment:
// there is one owner, so tables have no user_id and access is gated by the
// password check in src/proxy.ts. Amounts are whole rupiah (INTEGER).

const DB_PATH = process.env.DATABASE_PATH || "./data/financer.db";

const SCHEMA = `
create table if not exists app_settings (
  key text primary key,
  value text not null
);

create table if not exists user_profiles (
  id integer primary key check (id = 1),
  display_name text not null check (length(display_name) between 1 and 60),
  age_range text,
  occupation text,
  financial_experience text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists financial_profiles (
  id integer primary key check (id = 1),
  monthly_income integer not null default 0 check (monthly_income >= 0),
  income_source text,
  additional_income integer not null default 0 check (additional_income >= 0),
  income_frequency text,
  current_savings integer not null default 0 check (current_savings >= 0),
  monthly_expenses integer not null default 0 check (monthly_expenses >= 0),
  existing_debt integer not null default 0 check (existing_debt >= 0),
  monthly_obligations integer not null default 0 check (monthly_obligations >= 0),
  emergency_fund_status text,
  goal_choices text not null default '[]',
  tracks_expenses text,
  saves_regularly text,
  impulse_buying text,
  uses_paylater text,
  biggest_challenge text check (biggest_challenge is null or length(biggest_challenge) <= 200),
  onboarding_step integer not null default 1 check (onboarding_step between 1 and 6),
  onboarding_completed integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists categories (
  id text primary key,
  name text not null check (length(name) between 1 and 40),
  type text not null check (type in ('income','expense')),
  icon text not null default 'lainnya',
  sort_order integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (type, name)
);

create table if not exists transactions (
  id text primary key,
  type text not null check (type in ('income','expense')),
  category_id text not null references categories (id),
  amount integer not null check (amount > 0 and amount <= 1000000000000),
  description text check (description is null or length(description) <= 120),
  transaction_date text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists transactions_date_idx on transactions (transaction_date desc, created_at desc, id desc);

create table if not exists financial_goals (
  id text primary key,
  title text not null check (length(title) between 1 and 60),
  target_amount integer not null check (target_amount > 0 and target_amount <= 1000000000000),
  current_amount integer not null default 0 check (current_amount >= 0),
  target_date text,
  priority integer not null default 2 check (priority between 1 and 3),
  category text not null default 'lainnya',
  description text check (description is null or length(description) <= 200),
  monthly_plan integer check (monthly_plan is null or monthly_plan > 0),
  status text not null default 'active' check (status in ('active','paused','completed')),
  paused_at text,
  completed_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists goal_contributions (
  id text primary key,
  goal_id text not null references financial_goals (id) on delete cascade,
  kind text not null check (kind in ('deposit','withdrawal')),
  amount integer not null check (amount > 0 and amount <= 1000000000000),
  note text check (note is null or length(note) <= 120),
  contribution_date text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists goal_contributions_goal_idx on goal_contributions (goal_id, contribution_date desc, created_at desc);

-- Keep financial_goals.current_amount equal to the sum of its contributions.
-- A withdrawal larger than the balance violates current_amount >= 0 and fails.
create trigger if not exists goal_contributions_sync_ins after insert on goal_contributions
begin
  update financial_goals set
    current_amount = (select coalesce(sum(case when kind = 'deposit' then amount else -amount end), 0) from goal_contributions where goal_id = new.goal_id)
  where id = new.goal_id;
  update financial_goals set
    status = case
      when current_amount >= target_amount and status <> 'completed' then 'completed'
      when current_amount < target_amount and status = 'completed' then 'active'
      else status end,
    completed_at = case
      when current_amount >= target_amount and status <> 'completed' then strftime('%Y-%m-%dT%H:%M:%fZ','now')
      when current_amount < target_amount then null
      else completed_at end
  where id = new.goal_id;
end;
`;

const DEFAULT_CATEGORIES: [string, "income" | "expense", string, number][] = [
  ["Makan & minum", "expense", "makan", 1],
  ["Transport", "expense", "transport", 2],
  ["Belanja", "expense", "belanja", 3],
  ["Hiburan", "expense", "hiburan", 4],
  ["Langganan", "expense", "langganan", 5],
  ["Pendidikan", "expense", "pendidikan", 6],
  ["Tempat tinggal", "expense", "rumah", 7],
  ["Tagihan", "expense", "tagihan", 8],
  ["Kesehatan", "expense", "kesehatan", 9],
  ["Bayar utang", "expense", "utang", 10],
  ["Lainnya", "expense", "lainnya", 11],
  ["Gaji", "income", "gaji", 1],
  ["Freelance", "income", "freelance", 2],
  ["Usaha", "income", "usaha", 3],
  ["Uang saku", "income", "uang_saku", 4],
  ["Beasiswa", "income", "beasiswa", 5],
  ["Lainnya", "income", "lainnya", 6],
];

const globalForDb = globalThis as unknown as { __financerDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (globalForDb.__financerDb) return globalForDb.__financerDb;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const d = new DatabaseSync(DB_PATH);
  d.exec("pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000;");
  d.exec(SCHEMA);
  const count = d.prepare("select count(*) as n from categories").get() as { n: number };
  if (count.n === 0) {
    const ins = d.prepare("insert into categories (id, name, type, icon, sort_order) values (?, ?, ?, ?, ?)");
    for (const [name, type, icon, order] of DEFAULT_CATEGORIES) ins.run(randomUUID(), name, type, icon, order);
  }
  globalForDb.__financerDb = d;
  return d;
}

export function getSetting(key: string): string | null {
  const r = db().prepare("select value from app_settings where key = ?").get(key) as { value: string } | undefined;
  return r?.value ?? null;
}

/** Sets a value only if the key is still empty; returns false when it was already set. */
export function setSettingOnce(key: string, value: string): boolean {
  const r = db().prepare("insert into app_settings (key, value) values (?, ?) on conflict (key) do nothing").run(key, value);
  return Number(r.changes) > 0;
}

export const now = () => new Date().toISOString();
export const newId = () => randomUUID();

/** Runs fn inside a transaction. */
export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("begin immediate");
  try {
    const r = fn();
    d.exec("commit");
    return r;
  } catch (e) {
    d.exec("rollback");
    throw e;
  }
}

type Row = Record<string, unknown>;
const all = (sql: string, ...p: SQLInputValue[]) => db().prepare(sql).all(...p) as Row[];
const one = (sql: string, ...p: SQLInputValue[]) => db().prepare(sql).get(...p) as Row | undefined;

/** INSERT/UPDATE helper: builds the statement from an object's keys. */
export function insert(table: string, values: Record<string, unknown>) {
  const keys = Object.keys(values);
  db()
    .prepare(`insert into ${table} (${keys.join(",")}) values (${keys.map(() => "?").join(",")})`)
    .run(...keys.map((k) => toSql(values[k])));
}

export function update(table: string, id: string, values: Record<string, unknown>): number {
  const keys = Object.keys(values).filter((k) => values[k] !== undefined);
  if (!keys.length) return Number((one(`select count(*) as n from ${table} where id = ?`, id)?.n as number) ?? 0);
  const r = db()
    .prepare(`update ${table} set ${keys.map((k) => `${k} = ?`).join(",")}, updated_at = ? where id = ?`)
    .run(...keys.map((k) => toSql(values[k])), now(), id);
  return Number(r.changes);
}

export function upsertSingleton(table: "user_profiles" | "financial_profiles", values: Record<string, unknown>) {
  const keys = Object.keys(values);
  db()
    .prepare(
      `insert into ${table} (id, ${keys.join(",")}) values (1, ${keys.map(() => "?").join(",")})
       on conflict (id) do update set ${keys.map((k) => `${k} = excluded.${k}`).join(",")}, updated_at = '${now()}'`,
    )
    .run(...keys.map((k) => toSql(values[k])));
}

function toSql(v: unknown): SQLInputValue {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Array.isArray(v)) return JSON.stringify(v);
  return v as SQLInputValue;
}

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

export function getCategory(id: string) {
  return one("select id, type from categories where id = ?", id) as Pick<Category, "id" | "type"> | undefined;
}

export function listCategories(): Category[] {
  return all("select id, name, type, icon, sort_order from categories order by sort_order") as unknown as Category[];
}

export function getUserProfile(): UserProfile | null {
  return (one("select display_name, age_range, occupation, financial_experience from user_profiles where id = 1") as unknown as UserProfile) ?? null;
}

export function getFinancialProfile(): FinancialProfile | null {
  const r = one("select * from financial_profiles where id = 1");
  if (!r) return null;
  const rest = { ...r };
  for (const k of ["id", "created_at", "updated_at"]) delete rest[k];
  return {
    ...(rest as unknown as FinancialProfile),
    goal_choices: JSON.parse(String(r.goal_choices ?? "[]")),
    onboarding_completed: Boolean(r.onboarding_completed),
  };
}

export function listGoals(): Goal[] {
  return all("select * from financial_goals order by created_at") as unknown as Goal[];
}

export function getGoal(id: string) {
  return one("select * from financial_goals where id = ?", id) as unknown as Goal | undefined;
}

export function listContributions(goalId: string): Contribution[] {
  return all(
    `select id, goal_id, kind, amount, note, contribution_date, created_at from goal_contributions
     where goal_id = ? order by contribution_date desc, created_at desc limit 200`,
    goalId,
  ) as unknown as Contribution[];
}

export function dashboard(a: DashboardArgs): DashboardRaw {
  const lo = a.p_start < a.p_prev_start ? a.p_start : a.p_prev_start;
  const hi = a.p_end > a.p_prev_end ? a.p_end : a.p_prev_end;
  const totals = (from: string, to: string) =>
    one(
      `select coalesce(sum(case when type='income' then amount end),0) as income,
              coalesce(sum(case when type='expense' then amount end),0) as expense,
              count(*) as count
       from transactions where transaction_date between ? and ?`,
      from,
      to,
    ) as { income: number; expense: number; count: number };
  const bucket = a.p_bucket === "month" ? "substr(transaction_date,1,7) || '-01'" : "transaction_date";
  const byCat = (type: string) =>
    all(
      `select category_id, sum(amount) as amount from transactions
       where type = ? and transaction_date between ? and ? group by category_id order by amount desc`,
      type,
      a.p_start,
      a.p_end,
    ) as { category_id: string; amount: number }[];
  const allTime = one(
    `select coalesce(sum(case when type='income' then amount else -amount end),0) as net, count(*) as n from transactions`,
  ) as { net: number; n: number };
  return {
    current: totals(a.p_start, a.p_end),
    previous: totals(a.p_prev_start, a.p_prev_end),
    net_by_bucket: all(
      `select ${bucket} as d, sum(case when type='income' then amount else -amount end) as net
       from transactions where transaction_date between ? and ? group by 1 order by 1`,
      lo,
      hi,
    ) as { d: string; net: number }[],
    expense_by_category: byCat("expense"),
    income_by_category: byCat("income"),
    all_time_net: allTime.net,
    all_time_count: allTime.n,
    today_count: (one("select count(*) as n from transactions where transaction_date = ?", a.p_today) as { n: number }).n,
    starting_savings: (one("select current_savings as s from financial_profiles where id = 1") as { s: number } | undefined)?.s ?? 0,
  };
}

export function periodTotals(from: string, to: string) {
  const t = one(
    `select coalesce(sum(case when type='income' then amount end),0) as income,
            coalesce(sum(case when type='expense' then amount end),0) as expense,
            count(*) as count
     from transactions where transaction_date between ? and ?`,
    from,
    to,
  ) as { income: number; expense: number; count: number };
  const any = one("select exists (select 1 from transactions) as a") as { a: number };
  return { ...t, has_any: Boolean(any.a) };
}

export interface PageArgs {
  from: string;
  to: string;
  type: string | null;
  query: string | null;
  cursorDate: string | null;
  cursorCreated: string | null;
  cursorId: string | null;
  limit: number;
}

export function transactionsPage(p: PageArgs) {
  const text = (p.query ?? "").trim() || null;
  const digits = (p.query ?? "").replace(/\D/g, "") || null;
  const like = text ? `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const limit = Math.min(Math.max(p.limit || 30, 1), 100);
  const params: SQLInputValue[] = [p.from, p.to, p.type, p.type, like, like, like, digits, digits];
  let cursor = "";
  if (p.cursorDate) {
    cursor = "where (transaction_date, created_at, id) < (?, ?, ?)";
    params.push(p.cursorDate, p.cursorCreated, p.cursorId);
  }
  params.push(limit);
  return all(
    `with filtered as (
       select t.id, t.type, t.category_id, t.amount, t.description, t.transaction_date, t.created_at,
              sum(case when t.type='income' then t.amount else -t.amount end) over (partition by t.transaction_date) as day_net
       from transactions t left join categories c on c.id = t.category_id
       where t.transaction_date between ? and ?
         and (? is null or t.type = ?)
         and (? is null
              or t.description like ? escape '\\'
              or c.name like ? escape '\\'
              or (? is not null and cast(t.amount as text) like '%' || ? || '%'))
     )
     select * from filtered ${cursor}
     order by transaction_date desc, created_at desc, id desc
     limit ?`,
    ...params,
  );
}

/** Maps a SQLite error to the same messages the app used with Postgres. */
export function dbErrorMessage(e: unknown): { message: string; status: number } {
  const msg = e instanceof Error ? e.message : "";
  if (/CHECK constraint/i.test(msg)) return { message: "Data tidak valid.", status: 400 };
  if (/FOREIGN KEY/i.test(msg)) return { message: "Kategori atau tujuan tidak ditemukan.", status: 400 };
  console.error("db error:", msg);
  return { message: "Gagal menyimpan. Coba lagi.", status: 500 };
}
