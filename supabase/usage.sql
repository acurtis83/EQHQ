-- ============================================================
-- Is the app earning its place? Weekly opens and link taps.
-- ============================================================
--
-- "can we add a tracker in the settings to view how many people are using the
--  app or clicking on links weekly?"
--
-- The hard part of this is not counting. It's that eighty brothers is a small
-- enough population that a device id, a timestamp and a roster get you most of
-- the way to a name — so what is NOT stored matters more than what is.
--
-- Never recorded, and there is no column to put them in:
--   * names, member ids, form responses, anything typed
--   * IP addresses or user agents (PostgREST would have to be asked for them;
--     it isn't)
--   * which post, announcement or person an action was about, beyond the
--     coarse label below
--
-- `device` is a random uuid the browser makes up for itself and rotates every
-- year. It exists so the presidency can see "34 people opened it" rather than
-- "300 taps", which is the difference between knowing whether the app is used
-- and knowing nothing. It is pseudonymous, not anonymous, and the policies
-- below treat it that way: anon can INSERT and cannot SELECT, so one member's
-- browser can never read another's rows.

create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  -- The day, not the moment. An exact timestamp plus a device id is a
  -- movement log; a date is a count.
  day date not null default (now() at time zone 'utc')::date,
  kind text not null check (kind in ('open', 'link')),
  -- What was tapped, as a short slug the app chooses from a fixed list —
  -- "signup", "talk", "summary", "groupme". Capped so a URL or a sentence
  -- can't be smuggled in by a future caller that means well.
  label text check (label is null or length(label) <= 40),
  device uuid,
  created_at timestamptz not null default now()
);

create index if not exists usage_day_idx on usage_events (day desc);

alter table usage_events enable row level security;

-- Anyone may add a row. Nobody but the presidency may read one back: without
-- this asymmetry a member's browser could count the quorum, or worse, pull the
-- raw rows and correlate them.
drop policy if exists "Anyone records usage" on usage_events;
create policy "Anyone records usage" on usage_events
  for insert to anon, authenticated with check (true);

drop policy if exists "Presidency reads usage" on usage_events;
create policy "Presidency reads usage" on usage_events
  for select using (is_presidency());

drop policy if exists "Presidency clears usage" on usage_events;
create policy "Presidency clears usage" on usage_events
  for delete using (is_presidency());

grant insert on usage_events to anon, authenticated;
grant select, delete on usage_events to authenticated;

-- ---------- the weekly rollup ----------
--
-- Weeks start on Monday, matching the email. `people` counts distinct devices
-- and is therefore a lower bound — one brother with a phone and an iPad is
-- two — which is the right direction for a number nobody should lean on too
-- hard.
--
-- security_invoker = ON here, deliberately and unlike the public views in this
-- project: this one must stay behind the presidency policy above. The public
-- views exist to publish a safe column subset to members; this exists to
-- aggregate something members may not read at all.

create or replace view usage_weekly
with (security_invoker = on) as
  select
    date_trunc('week', day)::date as week,
    kind,
    label,
    count(*)                                      as events,
    count(distinct device) filter (where device is not null) as people
  from usage_events
  group by 1, 2, 3;

grant select on usage_weekly to authenticated;

-- ---------- forgetting ----------
--
-- "Roll up weekly, bin the detail after 90 days."
--
-- The weekly totals are worth keeping; the rows behind them are not. Called
-- from the Settings screen when the presidency opens the tracker, so it needs
-- no scheduler — and a database nobody has looked at in a year is a database
-- that hasn't been accumulating either.
create or replace function prune_usage_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  if not is_presidency() then
    return 0;
  end if;
  delete from usage_events where day < (now() at time zone 'utc')::date - 90;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

grant execute on function prune_usage_events() to authenticated;

notify pgrst, 'reload schema';
