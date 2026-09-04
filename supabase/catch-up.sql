-- ============================================================
-- CATCH-UP MIGRATION
-- ============================================================
-- Adds columns that newer features need to a database created by an older
-- version of schema.sql.
--
-- IMPORTANT — which file should you run?
--
--   * Missing COLUMNS  ("Could not find the 'address' column of 'members'")
--       -> this file is enough.
--
--   * Missing TABLES   ("relation \"calling_groups\" does not exist")
--       -> run schema.sql instead. It creates whatever tables you don't have
--          yet AND applies everything below. This file creates only the few
--          tables belonging to features added after the first release; it
--          won't rebuild a database that's missing the older ones.
--
-- If you're unsure, just run schema.sql — it is safe to re-run and does
-- strictly more than this file does.
--
-- Every statement here is wrapped so that a table you don't have is skipped
-- rather than throwing an error. Running this twice does nothing the second
-- time. It never drops a table and never deletes a row.
-- ============================================================

do $$
begin
  -- ---------- Roster: street address ----------
  if to_regclass('public.members') is not null then
    alter table members add column if not exists address text;
  end if;

  -- ---------- Callings: committees, stage history, set apart by ----------
  -- group_id points at calling_groups, so both tables have to exist.
  if to_regclass('public.callings') is not null then
    alter table callings add column if not exists stage_dates jsonb not null default '{}';
    alter table callings add column if not exists set_apart_by text;

    if to_regclass('public.calling_groups') is not null then
      alter table callings add column if not exists group_id uuid
        references calling_groups (id) on delete set null;
    end if;
  end if;

  -- ---------- Planner items: links and attachments ----------
  if to_regclass('public.running_items') is not null then
    alter table running_items add column if not exists link_url text;
    alter table running_items add column if not exists attachment_url text;
    alter table running_items add column if not exists attachment_name text;
  end if;

  -- ---------- Agenda item categories ----------
  -- agenda_items has had a category column since the first release; the
  -- planner's items get one now so both use the same set.
  if to_regclass('public.running_items') is not null then
    alter table running_items add column if not exists category text;
  end if;
  if to_regclass('public.agenda_items') is not null then
    alter table agenda_items add column if not exists category text;
  end if;

  -- ---------- Custom agenda categories ----------
  -- The eight built-in categories live in the app; this holds only the extras.
  if to_regclass('public.agenda_categories') is null then
    create table agenda_categories (
      id uuid primary key default gen_random_uuid(),
      key text not null unique,
      label text not null,
      accent text not null default 'var(--sub)',
      soft text not null default 'var(--inset)',
      sort_order int not null default 0,
      created_at timestamptz not null default now()
    );
    alter table agenda_categories enable row level security;
    create policy "Presidency manages agenda categories" on agenda_categories
      for all using (is_presidency()) with check (is_presidency());
  end if;

  -- ---------- Agenda items: links and attachments ----------
  if to_regclass('public.agenda_items') is not null then
    alter table agenda_items add column if not exists link_url text;
    alter table agenda_items add column if not exists attachment_url text;
    alter table agenda_items add column if not exists attachment_name text;
  end if;

  -- ---------- Planning: activities, temple trips, assignments ----------
  -- New table, so this only matters on a database that predates it. Created
  -- here rather than left to schema.sql so catch-up.sql alone is enough.
  if to_regclass('public.events') is null and to_regclass('public.posts') is not null then
    create table events (
      id uuid primary key default gen_random_uuid(),
      kind text not null check (kind in ('activity','temple','assignment')),
      title text not null,
      event_date date,
      event_time text,
      location text,
      assigned_to text,
      notes text,
      link_url text,
      attachment_url text,
      attachment_name text,
      post_id uuid references posts (id) on delete set null,
      done boolean not null default false,
      sort_order int not null default 0,
      created_at timestamptz not null default now()
    );
    create index if not exists events_kind_date_idx on events (kind, event_date);
    create index if not exists events_post_idx on events (post_id);
    alter table events enable row level security;
    -- Presidency-only: assignments and notes must not be publicly readable.
    create policy "Presidency only" on events
      for all using (is_presidency()) with check (is_presidency());
  end if;

  -- ---------- Sunday agendas: prayers, conducting, weekly email ----------
  if to_regclass('public.agendas') is not null then
    alter table agendas add column if not exists opening_prayer text;
    alter table agendas add column if not exists closing_prayer text;
    alter table agendas add column if not exists conducting text;
    alter table agendas add column if not exists email_body text;
  end if;

  -- ---------- Announcement carry-over ----------
  if to_regclass('public.agenda_items') is not null then
    alter table agenda_items add column if not exists source_item_id uuid;
    alter table agenda_items add column if not exists expires_on date;
    alter table agenda_items add column if not exists carry_over boolean not null default true;
  end if;
  if to_regclass('public.agendas') is not null then
    alter table agendas add column if not exists carried_over boolean not null default false;
  end if;

  -- ---------- Repeating events and attached sign-up forms ----------
  if to_regclass('public.events') is not null then
    alter table events add column if not exists repeat_rule text;
    alter table events add column if not exists repeat_until date;
    if to_regclass('public.forms') is not null then
      alter table events add column if not exists form_id uuid
        references forms (id) on delete set null;
    end if;
  end if;

  -- ---------- Public details, RSVP flag, multiple dates ----------
  if to_regclass('public.events') is not null then
    alter table events add column if not exists details text;
    alter table events add column if not exists rsvp boolean not null default false;
  end if;
  if to_regclass('public.posts') is not null then
    alter table posts add column if not exists rsvp boolean not null default false;
    alter table posts add column if not exists allow_signup boolean not null default false;
  end if;

  -- Several links on one card: streaming links, directions, a schedule.
  if to_regclass('public.post_links') is null and to_regclass('public.posts') is not null then
    create table post_links (
      id uuid primary key default gen_random_uuid(),
      post_id uuid not null references posts (id) on delete cascade,
      label text not null,
      url text not null,
      sort_order int not null default 0,
      created_at timestamptz not null default now()
    );
    create index if not exists post_links_post_idx on post_links (post_id, sort_order);
    alter table post_links enable row level security;
    create policy "Public can read post links" on post_links for select using (true);
    create policy "Presidency manages post links" on post_links
      for all using (is_presidency()) with check (is_presidency());
  end if;

  if to_regclass('public.event_dates') is null and to_regclass('public.events') is not null then
    create table event_dates (
      id uuid primary key default gen_random_uuid(),
      event_id uuid not null references events (id) on delete cascade,
      event_date date not null,
      event_time text,
      form_id uuid,
      notes text,
      done boolean not null default false,
      sort_order int not null default 0,
      created_at timestamptz not null default now()
    );
    if to_regclass('public.forms') is not null then
      alter table event_dates
        add constraint event_dates_form_fk foreign key (form_id)
        references forms (id) on delete set null;
    end if;
    create index if not exists event_dates_event_idx on event_dates (event_id, event_date);
    alter table event_dates enable row level security;
    create policy "Presidency only" on event_dates
      for all using (is_presidency()) with check (is_presidency());
  end if;

  if to_regclass('public.rsvps') is null and to_regclass('public.posts') is not null then
    create table rsvps (
      id uuid primary key default gen_random_uuid(),
      post_id uuid not null references posts (id) on delete cascade,
      name text not null,
      created_at timestamptz not null default now()
    );
    create index if not exists rsvps_post_idx on rsvps (post_id);
    alter table rsvps enable row level security;
    create policy "Public can rsvp" on rsvps for insert with check (true);
    create policy "Public can withdraw own rsvp" on rsvps for delete using (true);
    create policy "Presidency can read rsvps" on rsvps for select using (is_presidency());
  end if;

  -- ---------- Flyers ----------
  -- A flyer image across the top of a form, an event, and the feed post it
  -- publishes to. Stored in the existing agenda-files bucket under flyers/.
  if to_regclass('public.forms') is not null then
    alter table forms add column if not exists flyer_url text;
  end if;
  if to_regclass('public.events') is not null then
    alter table events add column if not exists flyer_url text;
  end if;
  if to_regclass('public.posts') is not null then
    alter table posts add column if not exists flyer_url text;
  end if;

  -- ---------- Post categories ----------
  -- Old set: announcement, event, lesson, reminder.
  -- New set: announcement, temple, activity — matching the home-screen tiles.
  -- The constraint comes off first so existing rows can be rewritten.
  if to_regclass('public.posts') is not null then
    alter table posts drop constraint if exists posts_category_check;
    update posts set category = 'activity'     where category = 'event';
    update posts set category = 'announcement' where category in ('reminder','lesson');
    alter table posts add constraint posts_category_check
      check (category in ('announcement','activity','assignment','temple'));
  end if;

  -- ---------- Sign-up claims ----------
  -- An early version let anyone delete anyone's claim.
  if to_regclass('public.signup_claims') is not null then
    drop policy if exists "Public can release own claim" on signup_claims;
  end if;

  -- ---------- Starter committees ----------
  -- Only inserts when the table is empty, so it won't duplicate yours.
  if to_regclass('public.calling_groups') is not null then
    insert into calling_groups (name, sort_order)
    select * from (values
      ('EQ Presidency', 0),
      ('Teachers', 1),
      ('Activities Committee', 2),
      ('Service Committee', 3),
      ('Ministering', 4)
    ) as v(name, sort_order)
    where not exists (select 1 from calling_groups);
  end if;
end
$$;

-- ---------- Refresh the API's view of the schema ----------
-- This is the step that clears a "schema cache" error. Supabase reaches
-- Postgres through PostgREST, which caches the table layout; adding a column
-- doesn't tell it to look again. This does.
-- Members read RSVP names through this view, which leaves out `id` on purpose:
-- withdrawing needs the id, and only the person who created it has it.
do $$
begin
  if to_regclass('public.rsvps') is not null then
    execute $v$
      create or replace view public_rsvps
      with (security_invoker = off) as
        select post_id, name, created_at from rsvps
    $v$;
    execute 'grant select on public_rsvps to anon, authenticated';
  end if;
end
$$;

-- Manual category order on a presidency agenda.
alter table agendas add column if not exists category_order jsonb not null default '[]';

-- Quorum settings: the GroupMe link and anything like it.
create table if not exists app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
drop policy if exists "Anyone can read settings" on app_settings;
create policy "Anyone can read settings" on app_settings for select using (true);
drop policy if exists "Presidency writes settings" on app_settings;
create policy "Presidency writes settings" on app_settings
  for all using (is_presidency()) with check (is_presidency());

-- ---------- Who conducts, month by month ----------
-- Conducting rotates monthly, so the Sunday agenda was asking the same
-- question every week. Keyed by "YYYY-MM" text rather than a date: the unit
-- really is the month, and a date column invites the question of which day.
-- ---------- The standing teaching rotation ----------
-- Who teaches on the 1st, 2nd, 3rd, 4th Sunday by default. A suggestion the
-- Teaching screen offers, not an assignment — nothing reads this to tell the
-- quorum who is teaching. Four slots: a 5th Sunday is bishopric-directed and
-- has no quorum lesson.
--
-- `name` is free text, not a member reference. "Invite/Presidency" is a real
-- answer and is not a person on the roster.
create table if not exists teaching_rotation (
  slot int primary key check (slot between 1 and 4),
  name text,
  updated_at timestamptz not null default now()
);
alter table teaching_rotation enable row level security;
-- Presidency only. It's a planning aid; members see the Teaching schedule's
-- confirmed assignments, never the defaults behind them.
drop policy if exists "Presidency manages teaching rotation" on teaching_rotation;
create policy "Presidency manages teaching rotation" on teaching_rotation
  for all using (is_presidency()) with check (is_presidency());

create table if not exists conducting_schedule (
  month text primary key check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  name text,
  updated_at timestamptz not null default now()
);
alter table conducting_schedule enable row level security;
-- Presidency only. Members never see who conducts; it appears on the Sunday
-- agenda and the printed sheet, both of which are behind a sign-in.
drop policy if exists "Presidency manages conducting" on conducting_schedule;
create policy "Presidency manages conducting" on conducting_schedule
  for all using (is_presidency()) with check (is_presidency());

notify pgrst, 'reload schema';


-- Expect "Success. No rows returned." Then reload the app.
--
-- If the roster error persists, your database is missing tables as well as
-- columns — run schema.sql, which creates them.


-- ==== ministering (see supabase/ministering.sql) ====
-- ---------- districts ----------
-- Three of them, one for the president and one for each counsellor. The
-- leader is stored as an id AND a name, the same as teaching_assignments:
-- the id is the truth, the name survives a member being deleted off the
-- roster, which shouldn't quietly blank a district heading.
alter table ministering_districts add column if not exists leader_name text;
alter table ministering_districts add column if not exists notes text;

-- ---------- households ----------
-- A household was a text[] on the companionship. That was fine for printing
-- a list and useless for anything else: you can't give a string an address,
-- you can't record that somebody visited it, and you can't put it on a map.
create table if not exists ministering_households (
  id uuid primary key default gen_random_uuid(),
  -- Nullable on purpose. A household with no companionship is not a data
  -- error, it's the single most important thing this screen can tell you.
  companionship_id uuid references ministering_companionships (id) on delete set null,
  name text not null,
  address text,
  phone text,
  notes text,
  -- Set false rather than deleting when a family moves out, so the contact
  -- history stays readable.
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Coordinates, and enough about how they were obtained to know when they're
-- stale. geocode_query is the exact string that was looked up: if the address
-- is edited afterwards it stops matching, which is how the app knows to ask
-- again instead of leaving a pin on the old house.
alter table ministering_households add column if not exists lat double precision;
alter table ministering_households add column if not exists lng double precision;
alter table ministering_households add column if not exists geocode_query text;
alter table ministering_households add column if not exists geocoded_at timestamptz;
-- 'ok' | 'not_found' | 'failed'. A miss is remembered so a bad address isn't
-- retried on every run — there are rate limits, and one unfixable address
-- shouldn't burn them.
alter table ministering_households add column if not exists geocode_status text;

create index if not exists min_households_comp_idx
  on ministering_households (companionship_id);
create index if not exists min_households_active_idx
  on ministering_households (active);

-- ---------- the contact log ----------
-- "No contact logged recently" is one of the four warning signs, and it needs
-- something to count. One row per time anybody reports having reached a
-- household: a visit, a text, a chat in the hall after church.
create table if not exists ministering_contacts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references ministering_households (id) on delete cascade,
  -- Kept alongside the household so the history survives a companionship
  -- being reorganised, which happens every year or two.
  companionship_id uuid references ministering_companionships (id) on delete set null,
  contacted_on date not null,
  kind text not null default 'visit'
    check (kind in ('visit','call','text','service','church','other')),
  notes text,
  logged_by text,
  created_at timestamptz not null default now()
);
create index if not exists min_contacts_household_idx
  on ministering_contacts (household_id, contacted_on desc);

-- ---------- interviews ----------
-- Already exists, but it pointed only at a member. A quarterly ministering
-- interview is held with a companionship about its households, so it needs to
-- be findable that way too.
alter table ministering_interviews
  add column if not exists companionship_id uuid references ministering_companionships (id) on delete cascade;
create index if not exists min_interviews_comp_idx
  on ministering_interviews (companionship_id, quarter);

-- ---------- security ----------
-- Same shape as every other presidency table: no session, no data. This is
-- the line that keeps a family's ministering notes off the public feed.
alter table ministering_households enable row level security;
alter table ministering_contacts enable row level security;

drop policy if exists "Presidency only" on ministering_households;
create policy "Presidency only" on ministering_households
  for all using (is_presidency()) with check (is_presidency());

drop policy if exists "Presidency only" on ministering_contacts;
create policy "Presidency only" on ministering_contacts
  for all using (is_presidency()) with check (is_presidency());

-- ---------- move the old text[] across ----------
-- Only for companionships whose households haven't been migrated yet, so
-- running this twice doesn't double every family. The array is left alone:
-- if something here is wrong, the original is still sitting there to compare
-- against, and dropping a column is not worth the risk of being unable to.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'ministering_companionships' and column_name = 'households'
  ) then
    insert into ministering_households (companionship_id, name)
    select c.id, btrim(h)
    from ministering_companionships c
    cross join lateral unnest(c.households) as h
    where btrim(h) <> ''
      and not exists (
        select 1 from ministering_households mh
        where mh.companionship_id = c.id
          and lower(mh.name) = lower(btrim(h))
      );
  end if;
end
$$;

notify pgrst, 'reload schema';
