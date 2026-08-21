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

create policy "Presidency can read the presidency list" on presidency_members
  for select using (is_presidency());

-- ============================================================
-- MEMBER-FACING (public read)
-- ============================================================

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  -- Mirrors the home-screen tiles. 'lesson' isn't here: this Sunday's lesson
  -- comes from the teaching schedule, not from someone remembering to post it.
  category text not null check (category in ('announcement','temple','activity')),
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
create policy "Public can read posts" on posts for select using (true);
create policy "Public can read comments" on comments for select using (true);
create policy "Public can read slots" on signup_slots for select using (true);
create policy "Public can read claims" on signup_claims for select using (true);

-- Anyone may comment or claim a sign-up slot (no account needed).
create policy "Public can comment" on comments for insert with check (true);
create policy "Public can claim a slot" on signup_claims for insert with check (true);
-- Deliberately no public delete: members sign up without an account, so the
-- database can't tell whose claim is whose. Removing a claim is presidency-only.

-- Only presidency may publish or manage feed content.
create policy "Presidency writes posts" on posts
  for all using (is_presidency()) with check (is_presidency());
create policy "Presidency moderates comments" on comments
  for delete using (is_presidency());
create policy "Presidency manages slots" on signup_slots
  for all using (is_presidency()) with check (is_presidency());
create policy "Presidency manages claims" on signup_claims
  for delete using (is_presidency());
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
create policy "Public reads published forms" on forms
  for select using (published or is_presidency());
create policy "Public reads questions of published forms" on form_questions
  for select using (
    is_presidency() or exists (
      select 1 from forms f where f.id = form_id and f.published
    )
  );
create policy "Public submits a response" on form_responses
  for insert with check (
    exists (select 1 from forms f where f.id = form_id and f.published)
  );
create policy "Public submits answers" on form_answers
  for insert with check (
    exists (
      select 1 from form_responses r
      join forms f on f.id = r.form_id
      where r.id = response_id and f.published
    )
  );

-- NO blanket public read on answers or responses. A capacity question needs
-- remaining counts, and a sign-up sheet should show who has taken which slot —
-- but a survey answer must never be readable by whoever has the link, or
-- "anonymous" would be meaningless. The view below exposes capacity answers
-- only; everything else stays presidency-only.
create policy "Presidency reads responses" on form_responses
  for select using (is_presidency());
create policy "Presidency reads answers" on form_answers
  for select using (is_presidency());

create policy "Presidency manages forms" on forms
  for all using (is_presidency()) with check (is_presidency());
create policy "Presidency manages questions" on form_questions
  for all using (is_presidency()) with check (is_presidency());
create policy "Presidency manages responses" on form_responses
  for delete using (is_presidency());
create policy "Presidency manages answers" on form_answers
  for delete using (is_presidency());

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
create index if not exists running_bucket_idx on running_items (bucket);

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
create policy "Presidency only" on talks
  for all using (is_presidency()) with check (is_presidency());
create policy "Presidency only" on calendar_exceptions
  for all using (is_presidency()) with check (is_presidency());
create policy "Presidency only" on members
  for all using (is_presidency()) with check (is_presidency());
create policy "Presidency only" on teaching_assignments
  for all using (is_presidency()) with check (is_presidency());
create policy "Presidency only" on ministering_districts
  for all using (is_presidency()) with check (is_presidency());
create policy "Presidency only" on ministering_companionships
  for all using (is_presidency()) with check (is_presidency());
create policy "Presidency only" on ministering_interviews
  for all using (is_presidency()) with check (is_presidency());
create policy "Presidency only" on agendas
  for all using (is_presidency()) with check (is_presidency());
create policy "Presidency only" on agenda_items
  for all using (is_presidency()) with check (is_presidency());
create policy "Presidency only" on running_items
  for all using (is_presidency()) with check (is_presidency());
create policy "Presidency only" on calling_groups
  for all using (is_presidency()) with check (is_presidency());
create policy "Presidency only" on callings
  for all using (is_presidency()) with check (is_presidency());

-- ---------- realtime ----------
alter publication supabase_realtime add table posts;
alter publication supabase_realtime add table comments;
alter publication supabase_realtime add table signup_claims;
alter publication supabase_realtime add table form_responses;
alter publication supabase_realtime add table form_answers;

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
-- MIGRATION — only if you already ran an earlier version of this file
-- ============================================================
-- Categories changed from (announcement, event, lesson, reminder) to
-- (announcement, temple, activity). Run this once; skip it on a fresh project.
--
-- alter table posts drop constraint if exists posts_category_check;
-- update posts set category = 'activity'     where category = 'event';
-- update posts set category = 'announcement' where category in ('reminder','lesson');
-- alter table posts add constraint posts_category_check
--   check (category in ('announcement','temple','activity'));

-- If you already ran an earlier version, drop the old permissive delete policy:
-- drop policy if exists "Public can release own claim" on signup_claims;

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

-- If you already ran an earlier version of this file:
-- alter table callings add column if not exists group_id uuid references calling_groups (id) on delete set null;
-- alter table callings add column if not exists stage_dates jsonb not null default '{}';
-- alter table callings add column if not exists set_apart_by text;

-- If you already ran an earlier version of this file:
-- alter table agenda_items add column if not exists link_url text;
-- alter table agenda_items add column if not exists attachment_url text;
-- alter table agenda_items add column if not exists attachment_name text;

-- If you already ran an earlier version of this file:
-- alter table members add column if not exists address text;

