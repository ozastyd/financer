import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { DashboardArgs, DashboardRaw } from "./dashboard";
import type { RatingStats } from "./rating";
import type { Category, Contribution, FinancialProfile, Goal, UserProfile } from "./types";

// SQLite storage with one account per person. Every row belongs to a user and
// every query here takes that user's id, so one account can never read or
// change another's data. Composite foreign keys also make the database itself
// refuse a transaction on someone else's category or a deposit into someone
// else's goal. Amounts are whole rupiah (INTEGER).

const DB_PATH = process.env.DATABASE_PATH || "./data/financer.db";
const SCHEMA_VERSION = 4;

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

/**
 * Money moved into a goal (deposit), back out of it (withdrawal), or used for
 * what it was saved for (spend). A spend can be linked to the expense it was
 * recorded as in Transaksi.
 */
function contributionsTable(name: string) {
  return `create table if not exists ${name} (
  id text primary key,
  goal_id text not null,
  user_id text not null references users (id) on delete cascade,
  kind text not null check (kind in ('deposit','withdrawal','spend')),
  amount integer not null check (amount > 0 and amount <= 1000000000000),
  note text check (note is null or length(note) <= 120),
  contribution_date text not null,
  transaction_id text references transactions (id) on delete set null,
  created_at text not null default ${NOW},
  foreign key (goal_id, user_id) references financial_goals (id, user_id) on delete cascade
);`;
}

function syncTrigger(name: string, event: "insert" | "update" | "delete", ref: "new" | "old") {
  const goal = `${ref}.goal_id`;
  const unspent = `not exists (select 1 from goal_contributions where goal_id = ${goal} and kind = 'spend')`;
  return `create trigger if not exists ${name} after ${event} on goal_contributions
begin
  update financial_goals set
    current_amount = (select coalesce(sum(case when kind = 'deposit' then amount else -amount end), 0) from goal_contributions where goal_id = ${goal})
  where id = ${goal};
  update financial_goals set
    status = case
      when current_amount >= target_amount and status <> 'completed' then 'completed'
      when current_amount < target_amount and status = 'completed' and ${unspent} then 'active'
      else status end,
    completed_at = case
      when current_amount >= target_amount and status <> 'completed' then ${NOW}
      when current_amount < target_amount and status = 'completed' and ${unspent} then null
      else completed_at end
  where id = ${goal};
end;`;
}

/** v3 -> v4: transactions can record the time of day (HH:MM, Asia/Jakarta). */
function migrateToV4(d: DatabaseSync) {
  const cols = d.prepare("pragma table_info(transactions)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "transaction_time")) {
    d.exec("alter table transactions add column transaction_time text check (transaction_time is null or transaction_time glob '[0-2][0-9]:[0-5][0-9]')");
  }
}

/** v2 -> v3: contributions gain the "spend" kind and a link to a transaction; triggers cover edits and deletes. */
function migrateToV3(d: DatabaseSync) {
  d.exec("begin immediate");
  try {
    d.exec(`${contributionsTable("goal_contributions_v3")}
insert into goal_contributions_v3 (id, goal_id, user_id, kind, amount, note, contribution_date, transaction_id, created_at)
  select id, goal_id, user_id, kind, amount, note, contribution_date, null, created_at from goal_contributions;
drop table goal_contributions;
alter table goal_contributions_v3 rename to goal_contributions;`);
    d.exec("commit");
  } catch (e) {
    d.exec("rollback");
    throw e;
  }
}

const SCHEMA = `
create table if not exists users (
  id text primary key,
  email text not null unique collate nocase,
  password_hash text not null,
  created_at text not null default ${NOW}
);

create table if not exists user_profiles (
  user_id text primary key references users (id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 60),
  age_range text,
  occupation text,
  financial_experience text,
  created_at text not null default ${NOW},
  updated_at text not null default ${NOW}
);

create table if not exists financial_profiles (
  user_id text primary key references users (id) on delete cascade,
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
  created_at text not null default ${NOW},
  updated_at text not null default ${NOW}
);

create table if not exists categories (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  type text not null check (type in ('income','expense')),
  icon text not null default 'lainnya',
  sort_order integer not null default 0,
  created_at text not null default ${NOW},
  unique (user_id, type, name),
  unique (id, user_id)
);
create index if not exists categories_user_idx on categories (user_id, type, sort_order);

create table if not exists transactions (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  type text not null check (type in ('income','expense')),
  category_id text not null,
  amount integer not null check (amount > 0 and amount <= 1000000000000),
  description text check (description is null or length(description) <= 120),
  transaction_date text not null,
  transaction_time text check (transaction_time is null or transaction_time glob '[0-2][0-9]:[0-5][0-9]'),
  created_at text not null default ${NOW},
  updated_at text not null default ${NOW},
  foreign key (category_id, user_id) references categories (id, user_id)
);
create index if not exists transactions_user_date_idx on transactions (user_id, transaction_date desc, created_at desc, id desc);

create table if not exists financial_goals (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
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
  created_at text not null default ${NOW},
  updated_at text not null default ${NOW},
  unique (id, user_id)
);
create index if not exists financial_goals_user_idx on financial_goals (user_id, created_at);

${contributionsTable("goal_contributions")}
create index if not exists goal_contributions_goal_idx on goal_contributions (goal_id, contribution_date desc, created_at desc);
create index if not exists goal_contributions_user_date_idx on goal_contributions (user_id, contribution_date);
create index if not exists goal_contributions_tx_idx on goal_contributions (transaction_id) where transaction_id is not null;

-- Keep financial_goals.current_amount equal to deposits minus withdrawals and
-- money spent. A change that would make the balance negative violates
-- current_amount >= 0 and fails. A goal completes when the balance reaches
-- the target; it only reopens when its money has not been spent (a correction),
-- so using the money for what it was saved for keeps the goal completed.
${syncTrigger("goal_contributions_sync_ins", "insert", "new")}
${syncTrigger("goal_contributions_sync_upd", "update", "new")}
${syncTrigger("goal_contributions_sync_del", "delete", "old")}

-- One-time password reset links: only the SHA-256 of the token is stored.
create table if not exists password_resets (
  token_hash text primary key,
  user_id text not null references users (id) on delete cascade,
  expires_at text not null,
  used_at text,
  created_at text not null default ${NOW}
);
create index if not exists password_resets_user_idx on password_resets (user_id);

-- Phones running the Financer app that may send bank/e-wallet notifications.
-- Only the SHA-256 of the device token is stored.
create table if not exists device_tokens (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  token_hash text not null unique,
  label text check (label is null or length(label) <= 60),
  recording integer not null default 0,
  created_at text not null default ${NOW},
  last_seen_at text
);
create index if not exists device_tokens_user_idx on device_tokens (user_id);

-- Transactions read from notifications, waiting for the user to confirm.
-- The raw notification text is kept only while pending, then cleared.
create table if not exists pending_transactions (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  source text not null check (length(source) <= 20),
  type text not null check (type in ('income','expense')),
  amount integer not null check (amount > 0 and amount <= 1000000000000),
  description text check (description is null or length(description) <= 120),
  counterparty text check (counterparty is null or length(counterparty) <= 80),
  category_hint text check (category_hint is null or length(category_hint) <= 60),
  maybe_transfer integer not null default 0,
  occurred_date text not null,
  occurred_time text,
  raw_title text,
  raw_text text,
  fingerprint text not null,
  status text not null default 'pending' check (status in ('pending','accepted','dismissed')),
  transaction_id text references transactions (id) on delete set null,
  created_at text not null default ${NOW},
  unique (user_id, fingerprint)
);
create index if not exists pending_transactions_user_idx on pending_transactions (user_id, status, occurred_date desc);

-- "Rekam notifikasi" test mode: raw texts from allow-listed apps, to check the reader against.
create table if not exists notification_samples (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  package_name text not null check (length(package_name) <= 120),
  title text check (title is null or length(title) <= 300),
  text text check (text is null or length(text) <= 2000),
  parsed integer not null default 0,
  posted_at text,
  created_at text not null default ${NOW}
);
create index if not exists notification_samples_user_idx on notification_samples (user_id, created_at desc);

-- "Kabari saya" on features that are still being built.
create table if not exists feature_interest (
  user_id text not null references users (id) on delete cascade,
  feature text not null check (length(feature) between 1 and 40),
  created_at text not null default ${NOW},
  primary key (user_id, feature)
);

-- "Seberapa Financer membantumu?": one answer per user (sending again replaces it).
create table if not exists app_ratings (
  user_id text primary key references users (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  reasons text not null default '[]',
  note text not null default '' check (length(note) <= 500),
  created_at text not null default ${NOW},
  updated_at text not null default ${NOW}
);

-- How often the rating card was shown, so a close asks again later and not forever.
create table if not exists rating_prompts (
  user_id text primary key references users (id) on delete cascade,
  asks integer not null default 0,
  last_asked_at text
);
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
  const version = (d.prepare("pragma user_version").get() as { user_version: number }).user_version;
  const hasTables = Boolean(d.prepare("select 1 from sqlite_master where type = 'table' and name = 'categories'").get());
  if (hasTables && version === 2) migrateToV3(d);
  if (hasTables && (version === 2 || version === 3)) migrateToV4(d);
  else if (hasTables && version < 2) {
    d.close();
    throw new Error(`${DB_PATH} uses the old single-user layout. Move it away and restart; a new database is created automatically.`);
  }
  d.exec(SCHEMA);
  d.exec(`pragma user_version = ${SCHEMA_VERSION}`);
  globalForDb.__financerDb = d;
  return d;
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

function toSql(v: unknown): SQLInputValue {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Array.isArray(v)) return JSON.stringify(v);
  return v as SQLInputValue;
}

// ---------------------------------------------------------------------------
// accounts
// ---------------------------------------------------------------------------

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

export function findUserByEmail(email: string): UserRow | undefined {
  return one("select id, email, password_hash from users where email = ?", email) as unknown as UserRow | undefined;
}

export function getUser(id: string): Pick<UserRow, "id" | "email"> | undefined {
  return one("select id, email from users where id = ?", id) as unknown as Pick<UserRow, "id" | "email"> | undefined;
}

/**
 * Creates the account and its default categories, then runs `andThen` (for
 * example saving onboarding answers) in the same transaction, so a failure
 * leaves no half-made account. Returns null when the email is taken.
 */
export function createUser(email: string, passwordHash: string, andThen?: (uid: string) => void): string | null {
  const id = newId();
  try {
    tx(() => {
      db().prepare("insert into users (id, email, password_hash) values (?, ?, ?)").run(id, email, passwordHash);
      const ins = db().prepare("insert into categories (id, user_id, name, type, icon, sort_order) values (?, ?, ?, ?, ?, ?)");
      for (const [name, type, icon, order] of DEFAULT_CATEGORIES) ins.run(newId(), id, name, type, icon, order);
      andThen?.(id);
    });
  } catch (e) {
    if (e instanceof Error && /UNIQUE constraint failed: users\.email/i.test(e.message)) return null;
    throw e;
  }
  return id;
}

// ---------------------------------------------------------------------------
// writes (always scoped to the owner)
// ---------------------------------------------------------------------------

type OwnedTable = "transactions" | "financial_goals" | "goal_contributions";

/** Inserts a row owned by uid. */
export function insertOwned(table: OwnedTable, uid: string, values: Record<string, unknown>) {
  const row = { ...values, user_id: uid };
  const keys = Object.keys(row);
  db()
    .prepare(`insert into ${table} (${keys.join(",")}) values (${keys.map(() => "?").join(",")})`)
    .run(...keys.map((k) => toSql(row[k as keyof typeof row])));
}

/** Updates the owner's row; returns the number of rows changed (0 when it isn't theirs). */
export function updateOwned(table: "transactions" | "financial_goals", uid: string, id: string, values: Record<string, unknown>): number {
  const keys = Object.keys(values).filter((k) => values[k] !== undefined);
  if (!keys.length) return Number((one(`select count(*) as n from ${table} where id = ? and user_id = ?`, id, uid)?.n as number) ?? 0);
  const r = db()
    .prepare(`update ${table} set ${keys.map((k) => `${k} = ?`).join(",")}, updated_at = ? where id = ? and user_id = ?`)
    .run(...keys.map((k) => toSql(values[k])), now(), id, uid);
  return Number(r.changes);
}

/** Deletes the owner's row; returns the number of rows deleted. */
export function deleteOwned(table: "transactions" | "financial_goals", uid: string, id: string): number {
  return Number(db().prepare(`delete from ${table} where id = ? and user_id = ?`).run(id, uid).changes);
}

export function upsertProfile(table: "user_profiles" | "financial_profiles", uid: string, values: Record<string, unknown>) {
  const keys = Object.keys(values);
  db()
    .prepare(
      `insert into ${table} (user_id, ${keys.join(",")}) values (?, ${keys.map(() => "?").join(",")})
       on conflict (user_id) do update set ${keys.map((k) => `${k} = excluded.${k}`).join(",")}, updated_at = '${now()}'`,
    )
    .run(uid, ...keys.map((k) => toSql(values[k])));
}

// ---------------------------------------------------------------------------
// reads (always scoped to the owner)
// ---------------------------------------------------------------------------

export function getCategory(uid: string, id: string) {
  return one("select id, type from categories where id = ? and user_id = ?", id, uid) as Pick<Category, "id" | "type"> | undefined;
}

/** An existing transaction with the same date, type and amount (a scanned row may duplicate it). */
export function findSimilarTransaction(uid: string, date: string, type: string, amount: number): { description: string | null; category: string } | undefined {
  return one(
    `select t.description as description, c.name as category from transactions t join categories c on c.id = t.category_id and c.user_id = t.user_id
     where t.user_id = ? and t.transaction_date = ? and t.type = ? and t.amount = ? limit 1`,
    uid,
    date,
    type,
    amount,
  ) as { description: string | null; category: string } | undefined;
}

/** Deletes several of the owner's transactions (undo of a batch save); returns how many were removed. */
export function deleteOwnedTransactions(uid: string, ids: string[]): number {
  let n = 0;
  tx(() => {
    const st = db().prepare("delete from transactions where id = ? and user_id = ?");
    for (const id of ids) n += Number(st.run(id, uid).changes);
  });
  return n;
}

export function getTransaction(uid: string, id: string) {
  return one("select type, category_id from transactions where id = ? and user_id = ?", id, uid) as { type: string; category_id: string } | undefined;
}

/** The owner's categories, each with how often it was used in the last 90 days (most-used first in the form). */
export function listCategories(uid: string): Category[] {
  return all(
    `select c.id, c.name, c.type, c.icon, c.sort_order,
       (select count(*) from transactions t
         where t.category_id = c.id and t.user_id = c.user_id and t.transaction_date >= date('now', '-90 day')) as usage
     from categories c where c.user_id = ? order by c.sort_order`,
    uid,
  ) as unknown as Category[];
}

export function getUserProfile(uid: string): UserProfile | null {
  return (one("select display_name, age_range, occupation, financial_experience from user_profiles where user_id = ?", uid) as unknown as UserProfile) ?? null;
}

export function getFinancialProfile(uid: string): FinancialProfile | null {
  const r = one("select * from financial_profiles where user_id = ?", uid);
  if (!r) return null;
  const rest = { ...r };
  for (const k of ["user_id", "created_at", "updated_at"]) delete rest[k];
  return {
    ...(rest as unknown as FinancialProfile),
    goal_choices: JSON.parse(String(r.goal_choices ?? "[]")),
    onboarding_completed: Boolean(r.onboarding_completed),
  };
}

/** Category icons counted as fixed monthly costs. */
const FIXED_ICONS = "'rumah','tagihan','utang'";

const GOAL_COLUMNS =
  "id, title, target_amount, current_amount, target_date, priority, category, description, monthly_plan, status, paused_at, completed_at, created_at";

/**
 * The owner's goals, each with what was saved into it since `monthStart`
 * (deposits minus withdrawals) and how much of it was used (spent).
 */
export function listGoals(uid: string, monthStart: string): Goal[] {
  return all(
    `select ${GOAL_COLUMNS},
       (select coalesce(sum(case c.kind when 'deposit' then c.amount when 'withdrawal' then -c.amount else 0 end), 0)
          from goal_contributions c where c.goal_id = g.id and c.contribution_date >= ?) as month_saved,
       (select coalesce(sum(c.amount), 0) from goal_contributions c where c.goal_id = g.id and c.kind = 'spend') as spent_amount
     from financial_goals g where g.user_id = ? order by g.created_at`,
    monthStart,
    uid,
  ) as unknown as Goal[];
}

export function getGoal(uid: string, id: string) {
  return one(`select ${GOAL_COLUMNS} from financial_goals where id = ? and user_id = ?`, id, uid) as unknown as Goal | undefined;
}

export function goalSpent(uid: string, id: string): number {
  return Number((one("select coalesce(sum(amount), 0) as n from goal_contributions where goal_id = ? and user_id = ? and kind = 'spend'", id, uid)?.n as number) ?? 0);
}

const CONTRIBUTION_COLUMNS = "id, goal_id, kind, amount, note, contribution_date, transaction_id, created_at";

export function listContributions(uid: string, goalId: string): Contribution[] {
  return all(
    `select ${CONTRIBUTION_COLUMNS} from goal_contributions
     where goal_id = ? and user_id = ? order by contribution_date desc, created_at desc limit 200`,
    goalId,
    uid,
  ) as unknown as Contribution[];
}

export function getContribution(uid: string, goalId: string, id: string) {
  return one(`select ${CONTRIBUTION_COLUMNS} from goal_contributions where id = ? and goal_id = ? and user_id = ?`, id, goalId, uid) as unknown as Contribution | undefined;
}

export function updateContribution(uid: string, id: string, values: { amount?: number; note?: string | null; contribution_date?: string }): number {
  const keys = Object.keys(values).filter((k) => values[k as keyof typeof values] !== undefined) as (keyof typeof values)[];
  if (!keys.length) return 1;
  const r = db()
    .prepare(`update goal_contributions set ${keys.map((k) => `${k} = ?`).join(",")} where id = ? and user_id = ?`)
    .run(...keys.map((k) => toSql(values[k])), id, uid);
  return Number(r.changes);
}

/** Deletes a contribution, and the expense it was recorded as when it was money spent. */
export function deleteContribution(uid: string, id: string): number {
  return tx(() => {
    const row = one("select transaction_id from goal_contributions where id = ? and user_id = ?", id, uid) as { transaction_id: string | null } | undefined;
    if (!row) return 0;
    db().prepare("delete from goal_contributions where id = ? and user_id = ?").run(id, uid);
    if (row.transaction_id) db().prepare("delete from transactions where id = ? and user_id = ?").run(row.transaction_id, uid);
    return 1;
  });
}

/** Records goal money being used; with a category it is also recorded as an expense in Transaksi. */
export function spendFromGoal(
  uid: string,
  goalId: string,
  input: { amount: number; note: string | null; contribution_date: string; category_id: string | null; description: string },
): string {
  const id = newId();
  tx(() => {
    let transactionId: string | null = null;
    if (input.category_id) {
      transactionId = newId();
      insertOwned("transactions", uid, {
        id: transactionId,
        type: "expense",
        category_id: input.category_id,
        amount: input.amount,
        description: input.description,
        transaction_date: input.contribution_date,
      });
    }
    insertOwned("goal_contributions", uid, {
      id,
      goal_id: goalId,
      kind: "spend",
      amount: input.amount,
      note: input.note,
      contribution_date: input.contribution_date,
      transaction_id: transactionId,
    });
  });
  return id;
}

export function dashboard(uid: string, a: DashboardArgs): DashboardRaw {
  const lo = a.p_start < a.p_prev_start ? a.p_start : a.p_prev_start;
  const hi = a.p_end > a.p_prev_end ? a.p_end : a.p_prev_end;
  const totals = (from: string, to: string) =>
    one(
      `select coalesce(sum(case when type='income' then amount end),0) as income,
              coalesce(sum(case when type='expense' then amount end),0) as expense,
              count(*) as count
       from transactions where user_id = ? and transaction_date between ? and ?`,
      uid,
      from,
      to,
    ) as { income: number; expense: number; count: number };
  const bucket = (col: string) => (a.p_bucket === "month" ? `substr(${col},1,7) || '-01'` : col);
  // Money moved into goals is no longer free to spend; withdrawals and money
  // used from a goal come back (a used amount recorded as an expense cancels out).
  const setAside = (from: string, to: string) =>
    Number(
      (one(
        `select coalesce(sum(case when kind = 'deposit' then amount else -amount end), 0) as n
         from goal_contributions where user_id = ? and contribution_date between ? and ?`,
        uid,
        from,
        to,
      )?.n as number) ?? 0,
    );
  // Spending split for the monthly plan: fixed costs (rent, bills, debt payments)
  // and purchases paid from a goal are left out of the day-to-day pace.
  const split = one(
    `select coalesce(sum(case when c.icon in (${FIXED_ICONS}) then t.amount end), 0) as fixed,
            coalesce(sum(case when c.icon not in (${FIXED_ICONS}) or c.icon is null then t.amount end), 0) as flexible
     from transactions t left join categories c on c.id = t.category_id and c.user_id = t.user_id
     where t.user_id = ? and t.type = 'expense' and t.transaction_date between ? and ?
       and not exists (select 1 from goal_contributions g where g.transaction_id = t.id)`,
    uid,
    a.p_start,
    a.p_end,
  ) as { fixed: number; flexible: number };
  const byCat = (type: string) =>
    all(
      `select category_id, sum(amount) as amount from transactions
       where user_id = ? and type = ? and transaction_date between ? and ? group by category_id order by amount desc`,
      uid,
      type,
      a.p_start,
      a.p_end,
    ) as { category_id: string; amount: number }[];
  const allTime = one(
    `select coalesce(sum(case when type='income' then amount else -amount end),0) as net, count(*) as n from transactions where user_id = ?`,
    uid,
  ) as { net: number; n: number };
  return {
    current: totals(a.p_start, a.p_end),
    previous: totals(a.p_prev_start, a.p_prev_end),
    net_by_bucket: all(
      `select d, sum(net) as net from (
         select ${bucket("transaction_date")} as d, case when type='income' then amount else -amount end as net
         from transactions where user_id = ? and transaction_date between ? and ?
         union all
         select ${bucket("contribution_date")} as d, case when kind = 'deposit' then -amount else amount end as net
         from goal_contributions where user_id = ? and contribution_date between ? and ?
       ) group by d order by d`,
      uid,
      lo,
      hi,
      uid,
      lo,
      hi,
    ) as { d: string; net: number }[],
    set_aside: setAside(a.p_start, a.p_end),
    prev_set_aside: setAside(a.p_prev_start, a.p_prev_end),
    fixed_expense: split.fixed,
    flexible_expense: split.flexible,
    goals_balance: Number((one("select coalesce(sum(current_amount), 0) as n from financial_goals where user_id = ?", uid)?.n as number) ?? 0),
    expense_by_category: byCat("expense"),
    income_by_category: byCat("income"),
    all_time_net: allTime.net,
    all_time_count: allTime.n,
    today_count: (one("select count(*) as n from transactions where user_id = ? and transaction_date = ?", uid, a.p_today) as { n: number }).n,
    starting_savings: (one("select current_savings as s from financial_profiles where user_id = ?", uid) as { s: number } | undefined)?.s ?? 0,
  };
}

export function periodTotals(uid: string, from: string, to: string) {
  const t = one(
    `select coalesce(sum(case when type='income' then amount end),0) as income,
            coalesce(sum(case when type='expense' then amount end),0) as expense,
            count(*) as count
     from transactions where user_id = ? and transaction_date between ? and ?`,
    uid,
    from,
    to,
  ) as { income: number; expense: number; count: number };
  const any = one("select exists (select 1 from transactions where user_id = ?) as a", uid) as { a: number };
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

export function transactionsPage(uid: string, p: PageArgs) {
  const text = (p.query ?? "").trim() || null;
  const digits = (p.query ?? "").replace(/\D/g, "") || null;
  const like = text ? `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const limit = Math.min(Math.max(p.limit || 30, 1), 100);
  const params: SQLInputValue[] = [uid, p.from, p.to, p.type, p.type, like, like, like, digits, digits];
  let cursor = "";
  if (p.cursorDate) {
    cursor = "where (transaction_date, created_at, id) < (?, ?, ?)";
    params.push(p.cursorDate, p.cursorCreated, p.cursorId);
  }
  params.push(limit);
  return all(
    `with filtered as (
       select t.id, t.type, t.category_id, t.amount, t.description, t.transaction_date, t.transaction_time, t.created_at,
              sum(case when t.type='income' then t.amount else -t.amount end) over (partition by t.transaction_date) as day_net
       from transactions t left join categories c on c.id = t.category_id and c.user_id = t.user_id
       where t.user_id = ?
         and t.transaction_date between ? and ?
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

export interface CoachTxSearch {
  /** Any of these words in the note or category name (empty: every transaction in range). */
  terms: string[];
  type: "income" | "expense" | null;
  from: string;
  to: string;
  order: "terbaru" | "terbesar";
  limit: number;
}

/**
 * The AI Coach's look-up over the user's own records: the matching rows
 * (newest or largest first) plus the count and total of every match, so it
 * can answer "berapa total…" without seeing more rows than it needs.
 */
export function coachSearchTransactions(uid: string, q: CoachTxSearch) {
  // A term matches when every word of it appears, in any order ("sewa axon" finds "AXON Suites … sewa").
  const terms = q.terms
    .map((t) => t.split(/\s+/).filter((w) => w.length >= 2))
    .filter((words) => words.length > 0)
    .slice(0, 8);
  const like = (w: string) => `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const wordMatch = "(t.description like ? escape '\\' or c.name like ? escape '\\')";
  const match = terms.length ? `and (${terms.map((words) => `(${words.map(() => wordMatch).join(" and ")})`).join(" or ")})` : "";
  const where = `from transactions t left join categories c on c.id = t.category_id and c.user_id = t.user_id
     where t.user_id = ? and t.transaction_date between ? and ? and (? is null or t.type = ?) ${match}`;
  const params: SQLInputValue[] = [uid, q.from, q.to, q.type, q.type, ...terms.flatMap((words) => words.flatMap((w) => [like(w), like(w)]))];
  const totals = one(
    `select count(*) as n,
            coalesce(sum(case when t.type='expense' then t.amount end),0) as expense,
            coalesce(sum(case when t.type='income' then t.amount end),0) as income ${where}`,
    ...params,
  ) as { n: number; expense: number; income: number };
  const order = q.order === "terbesar" ? "t.amount desc, t.transaction_date desc" : "t.transaction_date desc, t.transaction_time desc, t.created_at desc";
  const rows = all(
    `select t.transaction_date as date, t.transaction_time as time, t.type, t.amount, c.name as category, t.description ${where}
     order by ${order} limit ?`,
    ...params,
    Math.min(Math.max(q.limit || 10, 1), 25),
  ) as { date: string; time: string | null; type: string; amount: number; category: string | null; description: string | null }[];
  return { ...totals, rows };
}

/** Maps a SQLite error to the same messages the app used with Postgres. */
export function dbErrorMessage(e: unknown): { message: string; status: number } {
  const msg = e instanceof Error ? e.message : "";
  if (/CHECK constraint/i.test(msg)) return { message: "Data tidak valid.", status: 400 };
  if (/FOREIGN KEY/i.test(msg)) return { message: "Kategori atau tujuan tidak ditemukan.", status: 400 };
  console.error("db error:", msg);
  return { message: "Gagal menyimpan. Coba lagi.", status: 500 };
}

// ---------------------------------------------------------------------------
// account: password, reset links, export, deletion, feature interest
// ---------------------------------------------------------------------------

export function getPasswordHash(uid: string): string | undefined {
  return (one("select password_hash from users where id = ?", uid) as { password_hash: string } | undefined)?.password_hash;
}

export function setPasswordHash(uid: string, hash: string) {
  db().prepare("update users set password_hash = ? where id = ?").run(hash, uid);
}

export function createPasswordReset(uid: string, tokenHash: string, expiresAt: string) {
  tx(() => {
    // Only the newest link works.
    db().prepare("delete from password_resets where user_id = ?").run(uid);
    db().prepare("insert into password_resets (token_hash, user_id, expires_at) values (?, ?, ?)").run(tokenHash, uid, expiresAt);
  });
}

/** The account a valid, unused, unexpired reset token belongs to. */
export function findPasswordReset(tokenHash: string): string | undefined {
  const row = one("select user_id, expires_at, used_at from password_resets where token_hash = ?", tokenHash) as
    | { user_id: string; expires_at: string; used_at: string | null }
    | undefined;
  if (!row || row.used_at || row.expires_at < now()) return undefined;
  return row.user_id;
}

/** Sets the new password and uses up every reset link of the account. */
export function completePasswordReset(uid: string, hash: string) {
  tx(() => {
    setPasswordHash(uid, hash);
    db().prepare("update password_resets set used_at = ? where user_id = ? and used_at is null").run(now(), uid);
  });
}

/** Deletes the account; every table cascades from users. */
export function deleteUser(uid: string): number {
  return Number(db().prepare("delete from users where id = ?").run(uid).changes);
}

export interface ExportRow {
  date: string;
  kind: string;
  label: string;
  amount: number;
  note: string | null;
}

/** Everything the user recorded, oldest first: transactions and goal entries. */
export function exportRows(uid: string): ExportRow[] {
  return all(
    `select t.transaction_date as date, case t.type when 'income' then 'Pemasukan' else 'Pengeluaran' end as kind,
            coalesce(c.name, 'Tanpa kategori') as label, t.amount as amount, t.description as note, t.created_at as created
     from transactions t left join categories c on c.id = t.category_id and c.user_id = t.user_id
     where t.user_id = ?
     union all
     select g.contribution_date, case g.kind when 'deposit' then 'Setoran tujuan' when 'withdrawal' then 'Penarikan tujuan' else 'Pemakaian tujuan' end,
            f.title, g.amount, g.note, g.created_at
     from goal_contributions g join financial_goals f on f.id = g.goal_id and f.user_id = g.user_id
     where g.user_id = ?
     order by 1, 6`,
    uid,
    uid,
  ) as unknown as ExportRow[];
}

export function listInterests(uid: string): string[] {
  return all("select feature from feature_interest where user_id = ? order by created_at", uid).map((r) => String(r.feature));
}

export function setInterest(uid: string, feature: string, on: boolean) {
  if (on) db().prepare("insert or ignore into feature_interest (user_id, feature) values (?, ?)").run(uid, feature);
  else db().prepare("delete from feature_interest where user_id = ? and feature = ?").run(uid, feature);
}

// ---------------------------------------------------------------------------
// app devices, notification inbox, recorded samples
// ---------------------------------------------------------------------------

export interface DeviceRow {
  id: string;
  user_id: string;
  label: string | null;
  recording: number;
  created_at: string;
  last_seen_at: string | null;
}

export function createDevice(uid: string, tokenHash: string, label: string | null): string {
  const id = newId();
  db().prepare("insert into device_tokens (id, user_id, token_hash, label) values (?, ?, ?, ?)").run(id, uid, tokenHash, label);
  return id;
}

export function deviceByTokenHash(tokenHash: string): DeviceRow | undefined {
  return one("select id, user_id, label, recording, created_at, last_seen_at from device_tokens where token_hash = ?", tokenHash) as unknown as DeviceRow | undefined;
}

export function touchDevice(id: string) {
  db().prepare("update device_tokens set last_seen_at = ? where id = ?").run(now(), id);
}

export function listDevices(uid: string): DeviceRow[] {
  return all("select id, user_id, label, recording, created_at, last_seen_at from device_tokens where user_id = ? order by created_at desc", uid) as unknown as DeviceRow[];
}

export function setDeviceRecording(uid: string, id: string, on: boolean): number {
  return Number(db().prepare("update device_tokens set recording = ? where id = ? and user_id = ?").run(on ? 1 : 0, id, uid).changes);
}

export function deleteDevice(uid: string, id: string): number {
  return Number(db().prepare("delete from device_tokens where id = ? and user_id = ?").run(id, uid).changes);
}

export interface PendingRow {
  id: string;
  source: string;
  type: "income" | "expense";
  amount: number;
  description: string | null;
  counterparty: string | null;
  category_hint: string | null;
  maybe_transfer: number;
  occurred_date: string;
  occurred_time: string | null;
  raw_text: string | null;
  created_at: string;
}

/** Adds a read notification to the inbox; false when the same one was already added. */
export function addPending(uid: string, p: Omit<PendingRow, "id" | "created_at"> & { raw_title: string | null; fingerprint: string }): boolean {
  const r = db()
    .prepare(
      `insert or ignore into pending_transactions
        (id, user_id, source, type, amount, description, counterparty, category_hint, maybe_transfer, occurred_date, occurred_time, raw_title, raw_text, fingerprint)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(newId(), uid, p.source, p.type, p.amount, p.description, p.counterparty, p.category_hint, p.maybe_transfer, p.occurred_date, p.occurred_time, p.raw_title, p.raw_text, p.fingerprint);
  return Number(r.changes) > 0;
}

const PENDING_COLUMNS =
  "id, source, type, amount, description, counterparty, category_hint, maybe_transfer, occurred_date, occurred_time, raw_text, created_at";

export function listPending(uid: string): PendingRow[] {
  return all(`select ${PENDING_COLUMNS} from pending_transactions where user_id = ? and status = 'pending' order by occurred_date desc, occurred_time desc, created_at desc limit 200`, uid) as unknown as PendingRow[];
}

export function countPending(uid: string): number {
  return Number((one("select count(*) as n from pending_transactions where user_id = ? and status = 'pending'", uid)?.n as number) ?? 0);
}

export function getPending(uid: string, id: string): PendingRow | undefined {
  return one(`select ${PENDING_COLUMNS} from pending_transactions where id = ? and user_id = ? and status = 'pending'`, id, uid) as unknown as PendingRow | undefined;
}

/** Saves an inbox item as a real transaction and clears its raw text. */
export function acceptPending(
  uid: string,
  id: string,
  record: { type: "income" | "expense"; category_id: string; amount: number; description: string | null; transaction_date: string; transaction_time: string | null },
): string {
  const txId = newId();
  tx(() => {
    insertOwned("transactions", uid, { id: txId, ...record });
    db().prepare("update pending_transactions set status = 'accepted', transaction_id = ?, raw_text = null, raw_title = null where id = ? and user_id = ?").run(txId, id, uid);
  });
  return txId;
}

export function dismissPending(uid: string, id: string): number {
  return Number(
    db().prepare("update pending_transactions set status = 'dismissed', raw_text = null, raw_title = null where id = ? and user_id = ? and status = 'pending'").run(id, uid).changes,
  );
}

export function addSample(uid: string, s: { package_name: string; title: string | null; text: string | null; parsed: boolean; posted_at: string | null }) {
  db()
    .prepare("insert into notification_samples (id, user_id, package_name, title, text, parsed, posted_at) values (?, ?, ?, ?, ?, ?, ?)")
    .run(newId(), uid, s.package_name, s.title, s.text, s.parsed ? 1 : 0, s.posted_at);
  // Keep the newest 300.
  db()
    .prepare("delete from notification_samples where user_id = ? and id not in (select id from notification_samples where user_id = ? order by created_at desc limit 300)")
    .run(uid, uid);
}

export function listSamples(uid: string) {
  return all("select package_name, title, text, parsed, posted_at from notification_samples where user_id = ? order by created_at desc limit 300", uid) as {
    package_name: string;
    title: string | null;
    text: string | null;
    parsed: number;
    posted_at: string | null;
  }[];
}

export function clearSamples(uid: string) {
  db().prepare("delete from notification_samples where user_id = ?").run(uid);
}

// ---------------------------------------------------------------------------
// app rating
// ---------------------------------------------------------------------------

export function ratingStats(uid: string): RatingStats | undefined {
  const user = one("select created_at from users where id = ?", uid) as { created_at: string } | undefined;
  if (!user) return undefined;
  const use = one("select count(*) as n, count(distinct transaction_date) as days from transactions where user_id = ?", uid) as { n: number; days: number };
  const prompt = one("select asks, last_asked_at from rating_prompts where user_id = ?", uid) as { asks: number; last_asked_at: string | null } | undefined;
  return {
    accountCreatedAt: user.created_at,
    activeDays: use.days,
    transactions: use.n,
    rated: !!one("select 1 from app_ratings where user_id = ?", uid),
    asks: prompt?.asks ?? 0,
    lastAskedAt: prompt?.last_asked_at ?? null,
  };
}

export function markRatingAsked(uid: string) {
  db()
    .prepare(
      `insert into rating_prompts (user_id, asks, last_asked_at) values (?, 1, ${NOW})
       on conflict (user_id) do update set asks = asks + 1, last_asked_at = excluded.last_asked_at`,
    )
    .run(uid);
}

export function saveRating(uid: string, r: { rating: number; reasons: string[]; note: string }) {
  db()
    .prepare(
      `insert into app_ratings (user_id, rating, reasons, note) values (?, ?, ?, ?)
       on conflict (user_id) do update set rating = excluded.rating, reasons = excluded.reasons, note = excluded.note, updated_at = ${NOW}`,
    )
    .run(uid, r.rating, JSON.stringify(r.reasons), r.note);
}
