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

  -- ---------- Post categories ----------
  -- Old set: announcement, event, lesson, reminder.
  -- New set: announcement, temple, activity — matching the home-screen tiles.
  -- The constraint comes off first so existing rows can be rewritten.
  if to_regclass('public.posts') is not null then
    alter table posts drop constraint if exists posts_category_check;
    update posts set category = 'activity'     where category = 'event';
    update posts set category = 'announcement' where category in ('reminder','lesson');
    alter table posts add constraint posts_category_check
      check (category in ('announcement','temple','activity'));
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
notify pgrst, 'reload schema';


-- Expect "Success. No rows returned." Then reload the app.
--
-- If the roster error persists, your database is missing tables as well as
-- columns — run schema.sql, which creates them.
