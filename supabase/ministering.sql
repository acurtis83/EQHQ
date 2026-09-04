-- ============================================================
-- MINISTERING
-- ============================================================
-- Districts, companionships, the households they cover, and a log of when
-- anybody last made contact.
--
-- Safe to run on a database that already has the first three ministering
-- tables from schema.sql, and safe to run twice. It creates what's missing,
-- adds columns that don't exist yet, and moves the old free-text household
-- list into real rows without deleting the original.
--
-- This file is also inlined at the end of schema.sql, so a fresh database
-- gets all of it. It's kept separately because it's the one an existing
-- database needs, and telling somebody "run the 1,200-line file" when they
-- want one feature is how people end up not running it.
-- ============================================================

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
