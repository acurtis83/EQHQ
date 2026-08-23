-- ---------------------------------------------------------------------------
-- Anyone with the link can fill out a form
-- ---------------------------------------------------------------------------
-- Run this in the Supabase SQL editor to guarantee the whole anonymous path.
-- Safe to run more than once.
--
-- A member has no account, so every request they make arrives as the `anon`
-- role. Two separate things have to allow it, and missing either one looks the
-- same from the outside — a form that won't open or won't submit:
--
--   * GRANTs   — may this role touch the table at all?
--                Failing this says "permission denied for table ...".
--   * POLICIES — may it touch these particular rows?
--                Failing this says "violates row-level security policy".
--
-- Both are re-applied below.
--
-- One thing this cannot fix: a form still has to be PUBLISHED. The policies
-- deliberately check `forms.published`, so a draft is invisible to members even
-- with everything else correct. The report at the bottom lists which of your
-- forms are live.
-- ---------------------------------------------------------------------------

-- ---------- may anon touch these tables at all ----------
grant usage on schema public to anon, authenticated;

-- Reading a form and its questions.
grant select on forms          to anon, authenticated;
grant select on form_questions to anon, authenticated;

-- Submitting. Insert only: a member may add their own response and answers,
-- and may not read anyone's.
grant insert on form_responses to anon, authenticated;
grant insert on form_answers   to anon, authenticated;

-- Remaining spots on a sign-up slot, through the narrow view.
grant select on public_form_capacity to anon, authenticated;

-- ---------- may anon touch these rows ----------
alter table forms           enable row level security;
alter table form_questions  enable row level security;
alter table form_responses  enable row level security;
alter table form_answers    enable row level security;

-- Published forms are readable by anyone; drafts only by the presidency.
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

-- Submitting is allowed against a published form and nothing else.
drop policy if exists "Public submits a response" on form_responses;
create policy "Public submits a response" on form_responses
  for insert with check (
    -- The presidency can submit to their own draft. Testing a form before
    -- sending it out is the normal way to use it, and refusing that made the
    -- app look broken at the moment you were checking it worked.
    is_presidency()
    or exists (select 1 from forms f where f.id = form_id and f.published)
  );

drop policy if exists "Public submits answers" on form_answers;
create policy "Public submits answers" on form_answers
  for insert with check (
    is_presidency()
    or exists (
      select 1 from form_responses r
      join forms f on f.id = r.form_id
      where r.id = response_id and f.published
    )
  );

-- Reading responses stays presidency-only. This is deliberate and is why the
-- app never asks Postgres to hand a submitted row back — see src/lib/newId.js.
drop policy if exists "Presidency reads responses" on form_responses;
create policy "Presidency reads responses" on form_responses
  for select using (is_presidency());

drop policy if exists "Presidency reads answers" on form_answers;
create policy "Presidency reads answers" on form_answers
  for select using (is_presidency());

-- Clearing out test submissions. The answers cascade with the response, so
-- only form_responses needs the rule.
grant delete on form_responses to authenticated;
drop policy if exists "Presidency deletes responses" on form_responses;
create policy "Presidency deletes responses" on form_responses
  for delete using (is_presidency());

notify pgrst, 'reload schema';

-- ---------- what members can actually see right now ----------
-- Anything marked "draft" opens as "That form isn't available." Publish it on
-- the form's Share tab.
select
  title,
  case when published then 'live — anyone with the link can fill it out'
       else 'draft — members cannot open this' end as status,
  created_at::date as created
from forms
order by published desc, created_at desc;
