-- ============================================================
-- EQ Hub — schema
-- Run in a NEW Supabase project (SQL Editor → New query → Run).
--
-- Design note: the legacy Planner kept all state in one JSON row.
-- That works for four people but silently loses edits when two save
-- at once. Everything here is a real table with real rows.
--
-- Two audiences:
--   • Members  — no account. Read the feed, comment, claim sign-ups.
--   • Presidency — Supabase Auth accounts. Everything else.
-- The split is enforced by RLS below, not just hidden in the UI.
-- ============================================================

-- ---------- who counts as presidency ----------
-- A row here grants presidency access. Add one per auth user after
-- you create their login (see README step 3).
create table if not exists presidency_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  role text not null default 'Counselor',
  phone text,
  email text,
  created_at timestamptz not null default now()
);

alter table presidency_members enable row level security;

-- Helper: is the current caller presidency?
create or replace function is_presidency()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from presidency_members where user_id = auth.uid()
  );
$$;

drop policy if exists "Presidency can read the presidency list" on presidency_members;
create policy "Presidency can read the presidency list" on presidency_members
  for select using (is_presidency());

-- ============================================================
-- MEMBER-FACING (public read)
-- ============================================================

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  -- Mirrors the home-screen tiles. 'lesson' isn't here: this Sunday's lesson
  -- comes from the teaching schedule, not from someone remembering to post it.
  -- Mirrors the home-screen tiles, and the planner's kinds: an assignment
  -- posted to the feed stays an assignment rather than being folded into
  -- announcements.
  category text not null check (category in ('announcement','activity','assignment','temple')),
  title text not null,
  body text,
  link_url text,
  link_label text,
  event_date date,
  event_time text,
  event_location text,
  pinned boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);

-- Set when the planning row asked for "I'm in" instead of a form. Lives on the
-- post because the feed is what members read.
alter table posts add column if not exists rsvp boolean not null default false;
-- Whether this post offers a sign-up sheet. Opt-in at writing time: the button
-- used to appear on every post that didn't have one, which put a call to
-- action on notices that just needed reading.
alter table posts add column if not exists allow_signup boolean not null default false;
-- A flyer across the top of the post. Public by design: the whole point is
-- that a member with no account sees it.
alter table posts add column if not exists flyer_url text;
create index if not exists posts_created_at_idx on posts (created_at desc);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts (id) on delete cascade,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists comments_post_id_idx on comments (post_id);

-- Sign-ups: "who's bringing what" for an event post.
create table if not exists signup_slots (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts (id) on delete cascade,
  label text not null,
  quantity_needed int not null default 1,
  sort_order int not null default 0
);
create index if not exists signup_slots_post_idx on signup_slots (post_id);

create table if not exists signup_claims (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references signup_slots (id) on delete cascade,
  claimant_name text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists signup_claims_slot_idx on signup_claims (slot_id);

alter table posts enable row level security;
alter table comments enable row level security;
alter table signup_slots enable row level security;
alter table signup_claims enable row level security;

-- Anyone may read the feed and sign-ups.
drop policy if exists "Public can read posts" on posts;
create policy "Public can read posts" on posts for select using (true);
drop policy if exists "Public can read comments" on comments;
create policy "Public can read comments" on comments for select using (true);
drop policy if exists "Public can read slots" on signup_slots;
create policy "Public can read slots" on signup_slots for select using (true);
drop policy if exists "Public can read claims" on signup_claims;
create policy "Public can read claims" on signup_claims for select using (true);

-- Anyone may comment or claim a sign-up slot (no account needed).
drop policy if exists "Public can comment" on comments;
create policy "Public can comment" on comments for insert with check (true);
drop policy if exists "Public can claim a slot" on signup_claims;
create policy "Public can claim a slot" on signup_claims for insert with check (true);
-- Deliberately no public delete: members sign up without an account, so the
-- database can't tell whose claim is whose. Removing a claim is presidency-only.

-- Things the quorum sets up once and then mostly reads: the GroupMe link, for
-- one. A key/value table rather than a column on something, because the next
-- one of these will be a different shape and a table per setting is silly.
--
-- Readable by anyone, including members with no account — the feed shows the
-- GroupMe card to everybody, and the weekly email is written from the same
-- value. Writable by the presidency only.
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

-- Only presidency may publish or manage feed content.
drop policy if exists "Presidency writes posts" on posts;
create policy "Presidency writes posts" on posts
  for all using (is_presidency()) with check (is_presidency());
drop policy if exists "Presidency moderates comments" on comments;
create policy "Presidency moderates comments" on comments
  for delete using (is_presidency());
drop policy if exists "Presidency manages slots" on signup_slots;
create policy "Presidency manages slots" on signup_slots
  for all using (is_presidency()) with check (is_presidency());
drop policy if exists "Presidency manages claims" on signup_claims;
create policy "Presidency manages claims" on signup_claims
  for delete using (is_presidency());
drop policy if exists "Presidency edits claims" on signup_claims;
create policy "Presidency edits claims" on signup_claims
  for update using (is_presidency()) with check (is_presidency());

-- ============================================================
-- FORMS — surveys, sign-ups, assignments
-- ============================================================
-- A form is published or it isn't. Published forms are readable by anyone with
-- the link (members have no account); drafts are presidency-only.

create table if not exists forms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  kind text not null default 'signup' check (kind in ('signup','survey')),
  anonymous boolean not null default false,
  published boolean not null default false,
  closes_on date,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists forms_published_idx on forms (published, created_at desc);
-- Heads the form when a member opens it, and becomes the link preview image
-- when the form is shared.
alter table forms add column if not exists flyer_url text;

create table if not exists form_questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms (id) on delete cascade,
  -- capacity = a pick-a-slot question: each option has a limit, and it closes
  -- when full. That's what makes temple cleaning and rodeo shifts work.
  type text not null check (type in
    ('short','long','scale','yesno','choice','checkboxes','date','number','capacity')),
  label text not null,
  help text,
  required boolean not null default false,
  options jsonb not null default '[]',
  sort_order int not null default 0
);
create index if not exists form_questions_form_idx on form_questions (form_id, sort_order);

create table if not exists form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms (id) on delete cascade,
  respondent_name text,
  created_at timestamptz not null default now()
);
create index if not exists form_responses_form_idx on form_responses (form_id, created_at desc);

create table if not exists form_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references form_responses (id) on delete cascade,
  question_id uuid not null references form_questions (id) on delete cascade,
  value jsonb
);
create index if not exists form_answers_response_idx on form_answers (response_id);
create index if not exists form_answers_question_idx on form_answers (question_id);

alter table forms enable row level security;
alter table form_questions enable row level security;
alter table form_responses enable row level security;
alter table form_answers enable row level security;

-- Members can see published forms only, and can submit to them.
drop policy if exists "Public reads published forms" on forms;
create policy "Public reads published forms" on forms
  for select using (published or is_presidency());
drop policy if exists "Public reads questions of published forms" on form_questions;
create policy "Public reads questions of published forms" on form_questions
  for select using (
    is_presidency() or exists (
      select 1 from forms f where f.id = form_id and f.published
    )
  );
drop policy if exists "Public submits a response" on form_responses;
create policy "Public submits a response" on form_responses
  for insert with check (
    -- The presidency can submit to their own draft. Testing a form before
    -- sending it out is the normal way to use it, and refusing that made the
    -- app look broken at the moment you were checking it worked.
    is_presidency()
    or exists (select 1 from forms f where f.id = form_id and f.published)
  );
-- Which form does this response belong to?
--
-- SECURITY DEFINER on purpose. Row-level security applies inside policy
-- expressions as well, so the answers policy below cannot simply read
-- form_responses — members have no read access to that table by design, the
-- sub-select comes back empty, and every member's answers get rejected no
-- matter what. Looking the parent up through a definer function sidesteps that
-- one lookup without opening the table: it returns a form id for a response id
-- the caller already has, and nothing else.
create or replace function form_of_response(rid uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select form_id from form_responses where id = rid;
$$;

drop policy if exists "Public submits answers" on form_answers;
create policy "Public submits answers" on form_answers
  for insert with check (
    is_presidency()
    or exists (
      select 1 from forms f
      where f.id = form_of_response(response_id) and f.published
    )
  );

-- NO blanket public read on answers or responses. A capacity question needs
-- remaining counts, and a sign-up sheet should show who has taken which slot —
-- but a survey answer must never be readable by whoever has the link, or
-- "anonymous" would be meaningless. The view below exposes capacity answers
-- only; everything else stays presidency-only.
drop policy if exists "Presidency reads responses" on form_responses;
create policy "Presidency reads responses" on form_responses
  for select using (is_presidency());
drop policy if exists "Presidency reads answers" on form_answers;
create policy "Presidency reads answers" on form_answers
  for select using (is_presidency());

-- Clearing out test submissions, or removing one that was filed by mistake.
-- form_answers.response_id cascades, so the answers go with the response.
drop policy if exists "Presidency deletes responses" on form_responses;
create policy "Presidency deletes responses" on form_responses
  for delete using (is_presidency());

drop policy if exists "Presidency manages forms" on forms;
create policy "Presidency manages forms" on forms
  for all using (is_presidency()) with check (is_presidency());
drop policy if exists "Presidency manages questions" on form_questions;
create policy "Presidency manages questions" on form_questions
  for all using (is_presidency()) with check (is_presidency());
drop policy if exists "Presidency manages responses" on form_responses;
create policy "Presidency manages responses" on form_responses
  for delete using (is_presidency());
drop policy if exists "Presidency manages answers" on form_answers;
create policy "Presidency manages answers" on form_answers
  for delete using (is_presidency());


-- ============================================================
-- PLANNING — activities, temple trips, assignments
-- ============================================================
-- The presidency plans here. A row is private until it's posted to the feed,
-- and even then the private fields (assigned_to, notes) never leave this table
-- — publishing copies only the public-facing fields into `posts`.
--
-- This is why planning isn't just extra columns on `posts`: posts are readable
-- by anyone with the site link, so an assignment or a note about a brother
-- would be public. Keeping them here, behind presidency-only RLS, is the
-- difference between private and "private-looking".
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  -- 'assignment' never publishes: service and volunteer jobs are presidency
  -- coordination, not feed announcements.
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
  -- The feed post this was published as, if any. Kept so a later edit updates
  -- that same announcement instead of posting a second one. Nulled by the
  -- database if the post is deleted from the feed, which puts this row back
  -- into "not posted" rather than pointing at something gone.
  post_id uuid references posts (id) on delete set null,
  done boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Added after the first release. Repeating events are stored as a rule on one
-- row, not as generated rows: "basketball every Thursday" stays a single thing
-- to edit, and a series with no end date doesn't need a horizon to fill.
-- The anchor is this row's own event_date; repeat_until is inclusive.
alter table events add column if not exists repeat_rule text;
alter table events add column if not exists repeat_until date;
-- A sign-up form attached to this activity, temple trip or assignment.
alter table events add column if not exists form_id uuid references forms (id) on delete set null;

-- Shown to the quorum when this is posted. Kept apart from `notes`, which is
-- the presidency's own and must never reach the feed.
alter table events add column if not exists details text;
-- Basketball doesn't need a form — just "I'm in".
alter table events add column if not exists rsvp boolean not null default false;
-- The flyer travels with the event to the feed post when it's published.
alter table events add column if not exists flyer_url text;

create index if not exists events_kind_date_idx on events (kind, event_date);
create index if not exists events_post_idx on events (post_id);

alter table events enable row level security;


-- ============================================================
-- EVENT DATES — several dates for one thing
-- ============================================================
-- Temple cleaning runs on a handful of Saturdays that aren't a weekly pattern,
-- and each one needs its own sign-up. A repeat rule can't express that, so
-- dates get their own rows.
--
-- An event with no rows here still uses its own event_date, so nothing that
-- already exists has to change.
create table if not exists event_dates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  event_date date not null,
  event_time text,
  -- Each date can point at its own form: a different sign-up sheet per shift.
  form_id uuid references forms (id) on delete set null,
  notes text,
  done boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists event_dates_event_idx on event_dates (event_id, event_date);

alter table event_dates enable row level security;

-- ============================================================
-- POST LINKS — more than one link on a card
-- ============================================================
-- Stake conference has a streaming link per language; a temple trip might
-- carry directions and a schedule. `posts.link_url` holds one, which isn't
-- enough, so extra links get their own rows.
--
-- Publicly readable: they're the useful part of the announcement.
create table if not exists post_links (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts (id) on delete cascade,
  label text not null,
  url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists post_links_post_idx on post_links (post_id, sort_order);

alter table post_links enable row level security;

-- ============================================================
-- RSVPS — "I'm in", without a whole form
-- ============================================================
-- Attached to the feed post rather than the planning row, because the post is
-- what members can see. Names are public on purpose — the point is knowing
-- who's coming.
create table if not exists rsvps (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists rsvps_post_idx on rsvps (post_id);

alter table rsvps enable row level security;

-- Members read names through this view, which deliberately leaves out `id`.
-- Taking an RSVP back needs that id, and the only person who has it is whoever
-- created it — their browser kept it. That's what stops one member deleting
-- another's without needing an account.
create or replace view public_rsvps
with (security_invoker = off) as
  select post_id, name, created_at from rsvps;

grant select on public_rsvps to anon, authenticated;

-- ============================================================
-- PRESIDENCY-ONLY (no public read at all)
-- ============================================================

-- The roster is the spine: ministering, teaching, callings all point here.
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  last_name text,
  age int,
  birth_date text,
  address text,
  phone text,
  email text,
  office text,
  band text,
  calling text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

-- Added after the first release. These run here, immediately after the table,
-- because indexes and policies further down reference these columns — an
-- older database would fail on those before ever reaching a migration at the
-- end of the file. No-ops when the column already exists.
alter table members add column if not exists address text;
create index if not exists members_name_idx on members (last_name, name);

create table if not exists teaching_assignments (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  teacher_id uuid references members (id) on delete set null,
  teacher_name text,
  topic text,
  talk_title text,
  speaker text,
  talk_link text,
  notes text,
  no_lesson_reason text,
  created_at timestamptz not null default now()
);
create index if not exists teaching_date_idx on teaching_assignments (date);

-- Stake conference (and any other one-off no-lesson Sunday) can't be computed
-- from the calendar the way General Conference and 5th Sundays can, so it's
-- stored. Kind lets you record ward conference or anything else that displaces
-- the quorum block.
create table if not exists calendar_exceptions (
  date date primary key,
  kind text not null default 'Stake Conference',
  note text
);


-- Conference talk library. Reloaded after each General Conference from the
-- Church site via the conference-talks Netlify function; slug is the natural
-- key so re-importing the same conference updates rather than duplicates.
create table if not exists talks (
  slug text primary key,
  conf text not null,
  year int not null,
  month int not null,
  session text,
  title text not null,
  speaker text,
  url text not null,
  created_at timestamptz not null default now()
);
create index if not exists talks_conf_idx on talks (year desc, month desc);

create table if not exists ministering_districts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  leader_id uuid references members (id) on delete set null,
  sort_order int not null default 0
);

create table if not exists ministering_companionships (
  id uuid primary key default gen_random_uuid(),
  district_id uuid references ministering_districts (id) on delete cascade,
  companion_a_id uuid references members (id) on delete set null,
  companion_b_id uuid references members (id) on delete set null,
  households text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists ministering_interviews (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members (id) on delete cascade,
  quarter text not null,
  held_on date,
  held_by text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists min_interviews_q_idx on ministering_interviews (quarter);

-- Agendas: one row per meeting, items in a child table.
create table if not exists agendas (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('presidency','sunday')),
  meeting_date date,
  meeting_time text,
  location text,
  title text,
  notes text,
  created_at timestamptz not null default now()
);
-- Set once the previous Sunday's announcements have been rolled forward, so
-- deleting one doesn't bring it back on the next visit.
alter table agendas add column if not exists carried_over boolean not null default false;

-- The order the presidency wants to work through the categories in, for one
-- meeting. A list of category keys; anything not in it keeps its default
-- place, so an order saved before a new category existed still works.
alter table agendas add column if not exists category_order jsonb not null default '[]';

-- Added after the first release. These run here, immediately after the table,
-- because policies further down reference it. No-ops when already present.
-- Sunday agendas carry who prays and who conducts; presidency agendas leave
-- them null.
alter table agendas add column if not exists opening_prayer text;
alter table agendas add column if not exists closing_prayer text;
alter table agendas add column if not exists conducting text;
-- The weekly email, once it's been generated and possibly hand-edited. Saved
-- so reopening Monday's agenda doesn't throw away Karl's wording.
alter table agendas add column if not exists email_body text;
create index if not exists agendas_kind_date_idx on agendas (kind, meeting_date desc);

create table if not exists agenda_items (
  id uuid primary key default gen_random_uuid(),
  agenda_id uuid not null references agendas (id) on delete cascade,
  section text not null default 'items',
  text text not null default '',
  who text,
  notes text,
  due_date date,
  done boolean not null default false,
  category text,
  -- A link, or a file in the agenda-files storage bucket.
  link_url text,
  attachment_url text,
  attachment_name text,
  sort_order int not null default 0
);

-- Added after the first release. Sunday announcements roll forward week to
-- week, so each one remembers where it came from and when to stop.
--
-- source_item_id is deliberately a plain uuid, not a foreign key: if the
-- presidency item it came from is deleted, we need to still SEE the id in
-- order to notice it's gone and stop carrying the announcement. A foreign key
-- with "on delete set null" would erase exactly the evidence we need.
alter table agenda_items add column if not exists source_item_id uuid;
-- Optional last date this is worth repeating. Null means "until removed".
alter table agenda_items add column if not exists expires_on date;
alter table agenda_items add column if not exists carry_over boolean not null default true;

-- Added after the first release. These run here, immediately after the table,
-- because indexes and policies further down reference these columns — an
-- older database would fail on those before ever reaching a migration at the
-- end of the file. No-ops when the column already exists.
alter table agenda_items add column if not exists link_url text;
alter table agenda_items add column if not exists attachment_url text;
alter table agenda_items add column if not exists attachment_name text;
create index if not exists agenda_items_agenda_idx on agenda_items (agenda_id);

-- The running list that feeds presidency agendas.
create table if not exists running_items (
  id uuid primary key default gen_random_uuid(),
  bucket text not null check (bucket in ('topics','actions','watch','moves','service','missionary')),
  text text not null,
  who text,
  notes text,
  due_date date,
  done boolean not null default false,
  meta jsonb not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Added after the first release. These run here, immediately after the table,
-- because indexes and policies further down reference these columns. No-ops
-- when the column already exists.
alter table running_items add column if not exists link_url text;
alter table running_items add column if not exists attachment_url text;
alter table running_items add column if not exists attachment_name text;
create index if not exists running_bucket_idx on running_items (bucket);
-- What the item is about — the same set the meeting agenda uses. agenda_items
-- already had a category column; this brings the planner into line.
alter table running_items add column if not exists category text;

-- Categories the presidency adds themselves.
--
-- The eight built-in ones live in the app rather than here, so a fresh
-- database has them without a seed and they can never be deleted out from
-- under existing items. This table holds only the extras, and the two lists
-- are merged when a picker is drawn.
create table if not exists agenda_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  accent text not null default 'var(--sub)',
  soft text not null default 'var(--inset)',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table agenda_categories enable row level security;
drop policy if exists "Presidency manages agenda categories" on agenda_categories;
create policy "Presidency manages agenda categories" on agenda_categories
  for all using (is_presidency()) with check (is_presidency());

-- Committees. Renameable, so they're rows rather than a hardcoded list.
create table if not exists calling_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0
);

create table if not exists callings (
  id uuid primary key default gen_random_uuid(),
  position text not null,
  member_id uuid references members (id) on delete set null,
  candidate_name text,
  stage text not null default 'Need',
  group_id uuid references calling_groups (id) on delete set null,
  group_name text,
  -- Stage -> date reached, e.g. {"Called":"2026-08-09","Sustained":"2026-08-16"}.
  -- Stamped automatically when the stage changes, so you can see how long
  -- something has been sitting.
  stage_dates jsonb not null default '{}',
  set_apart_by text,
  notes text,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

-- Added after the first release. These run here, immediately after the table,
-- because indexes and policies further down reference these columns — an
-- older database would fail on those before ever reaching a migration at the
-- end of the file. No-ops when the column already exists.
alter table callings add column if not exists stage_dates jsonb not null default '{}';
alter table callings add column if not exists set_apart_by text;
alter table callings add column if not exists group_id uuid references calling_groups (id) on delete set null;
create index if not exists callings_group_idx on callings (group_id);
create index if not exists callings_stage_idx on callings (stage);

alter table calendar_exceptions enable row level security;
alter table talks enable row level security;
alter table members enable row level security;
alter table teaching_assignments enable row level security;
alter table ministering_districts enable row level security;
alter table ministering_companionships enable row level security;
alter table ministering_interviews enable row level security;
alter table agendas enable row level security;
alter table agenda_items enable row level security;
alter table running_items enable row level security;
alter table calling_groups enable row level security;
alter table callings enable row level security;

-- One policy shape for every presidency table: no session, no data.
-- This is the line that makes ministering notes actually private.
drop policy if exists "Presidency only" on talks;
create policy "Presidency only" on talks
  for all using (is_presidency()) with check (is_presidency());
drop policy if exists "Presidency only" on calendar_exceptions;
create policy "Presidency only" on calendar_exceptions
  for all using (is_presidency()) with check (is_presidency());
drop policy if exists "Presidency only" on members;
create policy "Presidency only" on members
  for all using (is_presidency()) with check (is_presidency());
drop policy if exists "Presidency only" on teaching_assignments;
create policy "Presidency only" on teaching_assignments
  for all using (is_presidency()) with check (is_presidency());
drop policy if exists "Presidency only" on ministering_districts;
create policy "Presidency only" on ministering_districts
  for all using (is_presidency()) with check (is_presidency());
drop policy if exists "Presidency only" on ministering_companionships;
create policy "Presidency only" on ministering_companionships
  for all using (is_presidency()) with check (is_presidency());
drop policy if exists "Presidency only" on ministering_interviews;
create policy "Presidency only" on ministering_interviews
  for all using (is_presidency()) with check (is_presidency());
drop policy if exists "Presidency only" on agendas;
create policy "Presidency only" on agendas
  for all using (is_presidency()) with check (is_presidency());
drop policy if exists "Presidency only" on agenda_items;
create policy "Presidency only" on agenda_items
  for all using (is_presidency()) with check (is_presidency());
drop policy if exists "Presidency only" on running_items;
create policy "Presidency only" on running_items
  for all using (is_presidency()) with check (is_presidency());
drop policy if exists "Presidency only" on calling_groups;
create policy "Presidency only" on calling_groups
  for all using (is_presidency()) with check (is_presidency());
drop policy if exists "Presidency only" on events;
create policy "Presidency only" on events
  for all using (is_presidency()) with check (is_presidency());
drop policy if exists "Presidency only" on event_dates;
create policy "Presidency only" on event_dates
  for all using (is_presidency()) with check (is_presidency());

-- Anyone may say they're coming, and take it back if they still hold the id.
drop policy if exists "Public can read post links" on post_links;
create policy "Public can read post links" on post_links for select using (true);
drop policy if exists "Presidency manages post links" on post_links;
create policy "Presidency manages post links" on post_links
  for all using (is_presidency()) with check (is_presidency());

drop policy if exists "Public can rsvp" on rsvps;
create policy "Public can rsvp" on rsvps for insert with check (true);
drop policy if exists "Public can withdraw own rsvp" on rsvps;
create policy "Public can withdraw own rsvp" on rsvps for delete using (true);
drop policy if exists "Presidency can read rsvps" on rsvps;
create policy "Presidency can read rsvps" on rsvps for select using (is_presidency());

drop policy if exists "Presidency only" on callings;
create policy "Presidency only" on callings
  for all using (is_presidency()) with check (is_presidency());

-- ---------- realtime ----------
-- Realtime. "alter publication ... add table" errors if the table is already a
-- member, which is what makes a re-run fail with:
--   relation "posts" is already member of publication "supabase_realtime"
-- So each one is added only if it isn't there yet. The publication itself is
-- created by Supabase; if it's missing, this block does nothing rather than
-- failing.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['posts','comments','signup_claims','form_responses','form_answers']
    loop
      if to_regclass('public.' || t) is not null
         and not exists (
           select 1 from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = t
         )
      then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$$;

-- ============================================================
-- PUBLIC LESSON VIEWS
-- ============================================================
-- The home screen shows this Sunday's lesson to members, who have no account.
-- teaching_assignments itself stays presidency-only because `notes` can hold
-- private prep comments — these views expose only what gets announced over the
-- pulpit anyway: date, teacher, talk, speaker, link.
--
-- security_invoker = off (the default, stated explicitly) means the view runs
-- with its owner's rights and so is NOT blocked by the underlying table's RLS.
-- That is the intent here; the column list is the security boundary.

create or replace view public_lessons
with (security_invoker = off) as
  select date, teacher_name, talk_title, speaker, talk_link
  from teaching_assignments;

create or replace view public_calendar_exceptions
with (security_invoker = off) as
  select date, kind
  from calendar_exceptions;

grant select on public_lessons to anon, authenticated;
grant select on public_calendar_exceptions to anon, authenticated;

-- ============================================================
-- MIGRATIONS — always run, safe on a brand new project
-- ============================================================
-- Every table above is created with "if not exists", which means re-running
-- this file will NOT add a column to a table that already exists. So anything
-- added after the first release has to be an explicit alter, and those alters
-- have to actually run — - not sit here commented out. Each statement below is
-- idempotent: on a fresh database they're harmless no-ops.

-- Categories changed from (announcement, event, lesson, reminder) to
-- (announcement, temple, activity). The constraint is dropped first so the
-- rewrite below can't trip over it.
alter table posts drop constraint if exists posts_category_check;
update posts set category = 'activity'     where category = 'event';
update posts set category = 'announcement' where category in ('reminder','lesson');
alter table posts add constraint posts_category_check
  check (category in ('announcement','activity','assignment','temple'));

-- An early version let anyone delete any sign-up claim, not just their own.
drop policy if exists "Public can release own claim" on signup_claims;

-- Capacity answers only — what members need to see remaining spots and who has
-- signed up. Survey answers are never included: the join requires type='capacity'.
create or replace view public_form_capacity
with (security_invoker = off) as
  select
    r.form_id,
    a.question_id,
    r.id as response_id,
    case when f.anonymous then null else r.respondent_name end as respondent_name,
    a.value
  from form_answers a
  join form_questions q on q.id = a.question_id and q.type = 'capacity'
  join form_responses r on r.id = a.response_id
  join forms f on f.id = r.form_id and f.published;

grant select on public_form_capacity to anon, authenticated;

-- Starter committees. Safe to re-run: only inserts when the table is empty.
insert into calling_groups (name, sort_order)
select * from (values
  ('EQ Presidency', 0),
  ('Teachers', 1),
  ('Activities Committee', 2),
  ('Service Committee', 3),
  ('Ministering', 4)
) as v(name, sort_order)
where not exists (select 1 from calling_groups);

-- Columns added after the first release now live directly beneath their table,
-- because an index or policy further down may reference them. See each table.

-- Supabase talks to Postgres through PostgREST, which keeps its own cached copy
-- of the schema. Adding a column without refreshing that cache is what produces
-- "Could not find the 'address' column of 'members' in the schema cache" — the
-- column exists, but the API layer hasn't noticed yet. This tells it to look
-- again, so the fix takes effect immediately instead of whenever it next reloads.
-- ---------- Carry old committee names onto the new groups ----------
-- The first version of Callings stored the committee as free text in
-- callings.group_name. It's now a real row in calling_groups, joined by
-- group_id. Without this, every existing calling would come back ungrouped
-- and the committee you'd typed would be stranded in a column nothing reads.
--
-- Only runs when the old column is actually present, and only fills rows that
-- aren't linked yet, so it's safe to run repeatedly and does nothing on a new
-- database.
do $$
begin
  if to_regclass('public.callings') is not null
     and to_regclass('public.calling_groups') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'callings'
         and column_name = 'group_name'
     )
  then
    -- a group row for every committee name in use that doesn't have one
    insert into calling_groups (name, sort_order)
    select distinct btrim(c.group_name), 100
    from callings c
    where c.group_name is not null
      and btrim(c.group_name) <> ''
      and not exists (
        select 1 from calling_groups g
        where lower(g.name) = lower(btrim(c.group_name))
      );

    -- point each calling at its group
    update callings c
       set group_id = g.id
      from calling_groups g
     where c.group_id is null
       and c.group_name is not null
       and lower(g.name) = lower(btrim(c.group_name));
  end if;
end
$$;

notify pgrst, 'reload schema';



-- ---------- Flyers ----------
-- Uploads land in the existing agenda-files bucket under a flyers/ prefix
-- rather than needing a second bucket. That bucket must be marked public in
-- Supabase → Storage, which it already is for agenda attachments.
notify pgrst, 'reload schema';
