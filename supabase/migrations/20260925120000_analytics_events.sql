-- Analytics events table for funnel/cohort analysis
create table if not exists public.analytics_events (
  id bigserial primary key,
  telegram_id bigint not null,
  event_name text not null,
  properties jsonb not null default '{}',
  session_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_analytics_user_time
  on public.analytics_events (telegram_id, created_at desc);

create index if not exists idx_analytics_event_time
  on public.analytics_events (event_name, created_at desc);

create index if not exists idx_analytics_session
  on public.analytics_events (session_id) where session_id is not null;

-- RLS: users can only insert their own events, admins can read all
alter table public.analytics_events enable row level security;

create policy "Users insert own events"
  on public.analytics_events for insert
  with check (telegram_id = (current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::bigint;

create policy "Admins read all events"
  on public.analytics_events for select
  using (
    exists (
      select 1 from public.players
      where telegram_id = (current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::bigint
      and is_admin = true
    )
  );

-- Helper RPC: insert event (called from client)
create or replace function public.track_event(
  _event_name text,
  _properties jsonb default '{}',
  _session_id text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _telegram_id bigint;
begin
  -- Extract telegram_id from JWT claims
  _telegram_id := (current_setting('request.jwt.claims', true))::jsonb ->> 'sub')::bigint;
  
  insert into public.analytics_events (telegram_id, event_name, properties, session_id)
  values (_telegram_id, _event_name, _properties, _session_id);
end;
$$;

grant execute on function public.track_event(text, jsonb, text) to anon, authenticated, service_role;

-- Materialized daily cohorts (refreshed daily via cron)
create table if not exists public.daily_cohorts (
  cohort_date date not null,
  metric text not null,
  value numeric not null,
  primary key (cohort_date, metric)
);

-- Example cohort refresh (run daily via pg_cron)
-- Refill: new users who started that day
-- Retention: % of cohort who returned on day N
create or replace function public.refresh_daily_cohorts(_date date default current_date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _start timestamptz := _date;
  _end timestamptz := _date + interval '1 day';
  _new_users int;
  _d1 int;
  _d3 int;
  _d7 int;
  _total_sessions int;
  _avg_sessions numeric;
  _total_deposits numeric;
  _total_wins int;
begin
  -- New users on this day
  select count(distinct telegram_id) into _new_users
  from analytics_events
  where event_name = 'mini_app_open'
    and created_at >= _start and created_at < _end;

  -- Day 1 retention (returned next day)
  select count(distinct telegram_id) into _d1
  from analytics_events
  where event_name = 'mini_app_open'
    and created_at >= _start + interval '1 day'
    and created_at < _end + interval '1 day'
    and telegram_id in (
      select telegram_id from analytics_events
      where event_name = 'mini_app_open'
        and created_at >= _start and created_at < _end
    );

  -- Day 3 retention
  select count(distinct telegram_id) into _d3
  from analytics_events
  where event_name = 'mini_app_open'
    and created_at >= _start + interval '3 days'
    and created_at < _end + interval '3 days'
    and telegram_id in (
      select telegram_id from analytics_events
      where event_name = 'mini_app_open'
        and created_at >= _start and created_at < _end
    );

  -- Day 7 retention
  select count(distinct telegram_id) into _d7
  from analytics_events
  where event_name = 'mini_app_open'
    and created_at >= _start + interval '7 days'
    and created_at < _end + interval '7 days'
    and telegram_id in (
      select telegram_id from analytics_events
      where event_name = 'mini_app_open'
        and created_at >= _start and created_at < _end
    );

  -- Session stats
  select count(*) into _total_sessions
  from analytics_events
  where event_name = 'mini_app_open'
    and created_at >= _start and created_at < _end;

  select avg(session_count) into _avg_sessions
  from (
    select telegram_id, count(*) as session_count
    from analytics_events
    where event_name = 'mini_app_open'
      and created_at >= _start and created_at < _end
    group by telegram_id
  ) s;

  -- Revenue
  select coalesce(sum((properties->>'amount')::numeric), 0) into _total_deposits
  from analytics_events
  where event_name = 'deposit_approved'
    and created_at >= _start and created_at < _end;

  -- Wins
  select count(*) into _total_wins
  from analytics_events
  where event_name = 'game_win'
    and created_at >= _start and created_at < _end;

  -- Upsert cohort metrics
  insert into daily_cohorts (cohort_date, metric, value) values
    (_date, 'new_users', _new_users),
    (_date, 'retention_d1', case when _new_users > 0 then _d1::numeric / _new_users * 100 else 0 end),
    (_date, 'retention_d3', case when _new_users > 0 then _d3::numeric / _new_users * 100 else 0 end),
    (_date, 'retention_d7', case when _new_users > 0 then _d7::numeric / _new_users * 100 else 0 end),
    (_date, 'sessions_total', _total_sessions),
    (_date, 'sessions_avg_per_user', _avg_sessions),
    (_date, 'deposits_total_etb', _total_deposits),
    (_date, 'wins_total', _total_wins)
  on conflict (cohort_date, metric) do update set value = excluded.value;
end;
$$;

grant execute on function public.refresh_daily_cohorts(date) to service_role;

-- Quick query view for dashboards
create or replace view public.v_daily_cohorts as
select
  cohort_date,
  max(case when metric = 'new_users' then value end) as new_users,
  max(case when metric = 'retention_d1' then value end) as retention_d1_pct,
  max(case when metric = 'retention_d3' then value end) as retention_d3_pct,
  max(case when metric = 'retention_d7' then value end) as retention_d7_pct,
  max(case when metric = 'sessions_total' then value end) as sessions_total,
  max(case when metric = 'sessions_avg_per_user' then value end) as sessions_avg_per_user,
  max(case when metric = 'deposits_total_etb' then value end) as deposits_total_etb,
  max(case when metric = 'wins_total' then value end) as wins_total
from daily_cohorts
group by cohort_date
order by cohort_date desc;