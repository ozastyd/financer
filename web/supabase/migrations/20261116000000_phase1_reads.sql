-- Financial OS: phase 1 of the scaling plan (docs/architecture/scaling-plan.md)
-- Totals, charts and the transaction list are computed in Postgres, so the
-- browser never downloads a user's whole history.
--
-- Every function runs as the caller (security invoker): row-level security
-- still applies, and each query also filters on auth.uid() so it can use the
-- user-first indexes. Amounts stay whole rupiah (bigint).
-- The migration runner wraps this file in a transaction.

-- Keyset pagination order for the transaction list: newest day, newest entry.
create index if not exists transactions_user_date_created_id_idx
  on public.transactions (user_id, transaction_date desc, created_at desc, id desc);
drop index if exists public.transactions_user_date_idx;


-- Everything Beranda needs, in one call.
--   p_start/p_end           current period (inclusive)
--   p_prev_start/p_prev_end previous period, for comparison
--   p_bucket                'day' (week and month views) or 'month' (year view)
--   p_today                 the user's calendar day in Asia/Jakarta
create or replace function public.dashboard(
  p_start date,
  p_end date,
  p_prev_start date,
  p_prev_end date,
  p_bucket text,
  p_today date
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with mine as (
    select type, category_id, amount, transaction_date,
           case when type = 'income' then amount else -amount end as signed
    from public.transactions
    where user_id = auth.uid()
  ),
  span as (
    select * from mine
    where transaction_date between least(p_start, p_prev_start) and greatest(p_end, p_prev_end)
  )
  select jsonb_build_object(
    'current', (
      select jsonb_build_object(
        'income', coalesce(sum(amount) filter (where type = 'income'), 0),
        'expense', coalesce(sum(amount) filter (where type = 'expense'), 0),
        'count', count(*))
      from span where transaction_date between p_start and p_end),
    'previous', (
      select jsonb_build_object(
        'income', coalesce(sum(amount) filter (where type = 'income'), 0),
        'expense', coalesce(sum(amount) filter (where type = 'expense'), 0),
        'count', count(*))
      from span where transaction_date between p_prev_start and p_prev_end),
    'net_by_bucket', (
      select coalesce(jsonb_agg(jsonb_build_object('d', b, 'net', n) order by b), '[]'::jsonb)
      from (
        select case when p_bucket = 'month' then date_trunc('month', transaction_date)::date
                    else transaction_date end as b,
               sum(signed) as n
        from span group by 1
      ) x),
    'expense_by_category', (
      select coalesce(jsonb_agg(jsonb_build_object('category_id', category_id, 'amount', a) order by a desc), '[]'::jsonb)
      from (
        select category_id, sum(amount) as a from span
        where type = 'expense' and transaction_date between p_start and p_end
        group by 1
      ) x),
    'income_by_category', (
      select coalesce(jsonb_agg(jsonb_build_object('category_id', category_id, 'amount', a) order by a desc), '[]'::jsonb)
      from (
        select category_id, sum(amount) as a from span
        where type = 'income' and transaction_date between p_start and p_end
        group by 1
      ) x),
    'all_time_net', (select coalesce(sum(signed), 0) from mine),
    'all_time_count', (select count(*) from mine),
    'today_count', (select count(*) from mine where transaction_date = p_today),
    'starting_savings', coalesce(
      (select current_savings from public.financial_profiles where user_id = auth.uid()), 0)
  );
$$;


-- Income, expense and count for one range (the Transaksi month header),
-- plus whether the user has recorded anything at all (for the empty state).
create or replace function public.period_totals(p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'income', coalesce(sum(amount) filter (where type = 'income'), 0),
    'expense', coalesce(sum(amount) filter (where type = 'expense'), 0),
    'count', count(*),
    'has_any', exists (select 1 from public.transactions where user_id = auth.uid())
  )
  from public.transactions
  where user_id = auth.uid() and transaction_date between p_from and p_to;
$$;


-- One page of the transaction list, newest first.
-- Filters (type, text/amount search) run here. day_net is the day's net over
-- the same filters, computed before the cursor so a day split across two
-- pages still shows its full total.
create or replace function public.transactions_page(
  p_from date,
  p_to date,
  p_type text default null,
  p_query text default null,
  p_cursor_date date default null,
  p_cursor_created timestamptz default null,
  p_cursor_id uuid default null,
  p_limit int default 30
)
returns table (
  id uuid,
  type text,
  category_id uuid,
  amount bigint,
  description text,
  transaction_date date,
  created_at timestamptz,
  day_net bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select
      nullif(btrim(coalesce(p_query, '')), '') as text_q,
      nullif(regexp_replace(coalesce(p_query, ''), '\D', '', 'g'), '') as digits
  ),
  pattern as (
    select
      '%' || replace(replace(replace(text_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' as like_q,
      digits
    from q
  ),
  filtered as (
    select t.id, t.type, t.category_id, t.amount, t.description, t.transaction_date, t.created_at,
           sum(case when t.type = 'income' then t.amount else -t.amount end)
             over (partition by t.transaction_date)::bigint as day_net
    from public.transactions t
    left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
    cross join pattern p
    where t.user_id = auth.uid()
      and t.transaction_date between p_from and p_to
      and (p_type is null or t.type = p_type)
      and (
        p.like_q is null
        or t.description ilike p.like_q
        or c.name ilike p.like_q
        or (p.digits is not null and t.amount::text like '%' || p.digits || '%')
      )
  )
  select f.id, f.type, f.category_id, f.amount, f.description, f.transaction_date, f.created_at, f.day_net
  from filtered f
  where p_cursor_date is null
     or (f.transaction_date, f.created_at, f.id) < (p_cursor_date, p_cursor_created, p_cursor_id)
  order by f.transaction_date desc, f.created_at desc, f.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;


-- Only signed-in users may call these.
revoke execute on function public.dashboard(date, date, date, date, text, date) from public, anon;
revoke execute on function public.period_totals(date, date) from public, anon;
revoke execute on function public.transactions_page(date, date, text, text, date, timestamptz, uuid, int) from public, anon;
grant execute on function public.dashboard(date, date, date, date, text, date) to authenticated;
grant execute on function public.period_totals(date, date) to authenticated;
grant execute on function public.transactions_page(date, date, text, text, date, timestamptz, uuid, int) to authenticated;
