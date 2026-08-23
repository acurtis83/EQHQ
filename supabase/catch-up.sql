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
--          yet AND applies everything below. This file only adds columns; it
--          can't create a table that was never there.
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

notify pgrst, 'reload schema';


-- Expect "Success. No rows returned." Then reload the app.
--
-- If the roster error persists, your database is missing tables as well as
-- columns — run schema.sql, which creates them.
