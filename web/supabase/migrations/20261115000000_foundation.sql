-- Financial OS: foundation schema
-- Tables: user_profiles, financial_profiles, categories, transactions,
--         financial_goals, goal_contributions
-- Every table is protected by Row Level Security so a signed-in user can
-- only read and write their own rows. Amounts are whole rupiah (bigint).

begin;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- user_profiles (step 1 of onboarding)
-- ---------------------------------------------------------------------------
create table public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  age_range text check (age_range in ('<18', '18-21', '22-25', '26-30', '>30')),
  occupation text check (occupation in ('pelajar', 'mahasiswa', 'fresh_graduate', 'karyawan', 'freelancer', 'wirausaha', 'lainnya')),
  financial_experience text check (financial_experience in ('pemula', 'menengah', 'mahir')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- financial_profiles (steps 2, 3 and 5 of onboarding)
-- ---------------------------------------------------------------------------
create table public.financial_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  monthly_income bigint not null default 0 check (monthly_income >= 0),
  income_source text check (income_source in ('gaji', 'freelance', 'usaha', 'uang_saku', 'beasiswa', 'lainnya', 'belum_ada')),
  additional_income bigint not null default 0 check (additional_income >= 0),
  income_frequency text check (income_frequency in ('bulanan', 'mingguan', 'tidak_tentu', 'belum_ada')),
  current_savings bigint not null default 0 check (current_savings >= 0),
  monthly_expenses bigint not null default 0 check (monthly_expenses >= 0),
  existing_debt bigint not null default 0 check (existing_debt >= 0),
  monthly_obligations bigint not null default 0 check (monthly_obligations >= 0),
  emergency_fund_status text check (emergency_fund_status in ('belum_ada', 'sebagian', 'cukup')),
  goal_choices text[] not null default '{}',
  tracks_expenses text check (tracks_expenses in ('rutin', 'kadang', 'tidak')),
  saves_regularly text check (saves_regularly in ('rutin', 'kadang', 'tidak')),
  impulse_buying text check (impulse_buying in ('sering', 'kadang', 'jarang')),
  uses_paylater text check (uses_paylater in ('sering', 'kadang', 'tidak')),
  biggest_challenge text check (char_length(biggest_challenge) <= 200),
  onboarding_step smallint not null default 1 check (onboarding_step between 1 and 6),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger financial_profiles_updated_at
  before update on public.financial_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- categories (seeded per user on first sign-in)
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  type text not null check (type in ('income', 'expense')),
  icon text not null default 'lainnya' check (char_length(icon) <= 30),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, type, name),
  unique (id, user_id)
);

create index categories_user_idx on public.categories (user_id, type, sort_order);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  category_id uuid not null,
  amount bigint not null check (amount > 0 and amount <= 1000000000000),
  description text check (char_length(description) <= 120),
  transaction_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- the category must belong to the same user
  foreign key (category_id, user_id) references public.categories (id, user_id)
);

create index transactions_user_date_idx on public.transactions (user_id, transaction_date desc, created_at desc);
create index transactions_category_idx on public.transactions (category_id);

create trigger transactions_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- financial_goals
-- ---------------------------------------------------------------------------
create table public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  target_amount bigint not null check (target_amount > 0 and target_amount <= 1000000000000),
  current_amount bigint not null default 0 check (current_amount >= 0),
  target_date date,
  priority smallint not null default 2 check (priority between 1 and 3),
  category text not null default 'lainnya' check (char_length(category) <= 30),
  description text check (char_length(description) <= 200),
  monthly_plan bigint check (monthly_plan is null or monthly_plan > 0),
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  paused_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index financial_goals_user_idx on public.financial_goals (user_id, status, created_at);

create trigger financial_goals_updated_at
  before update on public.financial_goals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- goal_contributions (deposits and withdrawals; amounts are always positive)
-- ---------------------------------------------------------------------------
create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('deposit', 'withdrawal')),
  amount bigint not null check (amount > 0 and amount <= 1000000000000),
  note text check (char_length(note) <= 120),
  contribution_date date not null,
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.financial_goals (id, user_id) on delete cascade
);

create index goal_contributions_goal_idx on public.goal_contributions (goal_id, contribution_date desc, created_at desc);
create index goal_contributions_user_idx on public.goal_contributions (user_id);

-- Keep financial_goals.current_amount equal to the sum of its contributions.
-- A withdrawal larger than the balance violates current_amount >= 0 and fails.
create function public.sync_goal_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  gid uuid := coalesce(new.goal_id, old.goal_id);
  total bigint;
begin
  select coalesce(sum(case when kind = 'deposit' then amount else -amount end), 0)
    into total
    from public.goal_contributions
   where goal_id = gid;

  update public.financial_goals g
     set current_amount = total,
         status = case
           when total >= g.target_amount and g.status <> 'completed' then 'completed'
           when total < g.target_amount and g.status = 'completed' then 'active'
           else g.status end,
         completed_at = case
           when total >= g.target_amount and g.status <> 'completed' then now()
           when total < g.target_amount then null
           else g.completed_at end
   where g.id = gid;
  return null;
end;
$$;

create trigger goal_contributions_sync
  after insert or update or delete on public.goal_contributions
  for each row execute function public.sync_goal_amount();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.user_profiles enable row level security;
alter table public.financial_profiles enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.financial_goals enable row level security;
alter table public.goal_contributions enable row level security;

create policy "own rows: select" on public.user_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows: insert" on public.user_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows: update" on public.user_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows: delete" on public.user_profiles for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own rows: select" on public.financial_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows: insert" on public.financial_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows: update" on public.financial_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows: delete" on public.financial_profiles for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own rows: select" on public.categories for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows: insert" on public.categories for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows: update" on public.categories for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows: delete" on public.categories for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own rows: select" on public.transactions for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows: insert" on public.transactions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows: update" on public.transactions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows: delete" on public.transactions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own rows: select" on public.financial_goals for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows: insert" on public.financial_goals for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows: update" on public.financial_goals for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows: delete" on public.financial_goals for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own rows: select" on public.goal_contributions for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows: insert" on public.goal_contributions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows: delete" on public.goal_contributions for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Default categories, seeded for the calling user on first sign-in.
-- Runs as the caller (security invoker), so RLS still applies.
-- ---------------------------------------------------------------------------
create function public.seed_default_categories()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.categories (user_id, name, type, icon, sort_order)
  values
    (uid, 'Makan & minum', 'expense', 'makan', 1),
    (uid, 'Transport', 'expense', 'transport', 2),
    (uid, 'Belanja', 'expense', 'belanja', 3),
    (uid, 'Hiburan', 'expense', 'hiburan', 4),
    (uid, 'Langganan', 'expense', 'langganan', 5),
    (uid, 'Pendidikan', 'expense', 'pendidikan', 6),
    (uid, 'Tempat tinggal', 'expense', 'rumah', 7),
    (uid, 'Tagihan', 'expense', 'tagihan', 8),
    (uid, 'Kesehatan', 'expense', 'kesehatan', 9),
    (uid, 'Bayar utang', 'expense', 'utang', 10),
    (uid, 'Lainnya', 'expense', 'lainnya', 11),
    (uid, 'Gaji', 'income', 'gaji', 1),
    (uid, 'Freelance', 'income', 'freelance', 2),
    (uid, 'Usaha', 'income', 'usaha', 3),
    (uid, 'Uang saku', 'income', 'uang_saku', 4),
    (uid, 'Beasiswa', 'income', 'beasiswa', 5),
    (uid, 'Lainnya', 'income', 'lainnya', 6)
  on conflict (user_id, type, name) do nothing;
end;
$$;

revoke all on function public.seed_default_categories() from public, anon;
grant execute on function public.seed_default_categories() to authenticated;

commit;
