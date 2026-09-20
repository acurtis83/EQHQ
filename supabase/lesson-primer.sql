-- ============================================================
-- The Quick Summary: a primer on Sunday's talk, for the brother
-- who has just sat down.
-- ============================================================
--
-- "a Cliff Notes style summary or Talk Primer for those who want the
--  executive summary. Great for those first sitting down in EQ to get up to
--  speed."
--
-- Four columns rather than one blob, because the point of the thing is that it
-- looks the same every week: you learn where the big idea sits and your eye
-- goes there. A single free-text box produces a different shape every time,
-- which is the wall of text the button exists to avoid.
--
-- Takeaways are text[] rather than a newline-separated string. The list is the
-- part that gets rendered as a list, and splitting a string on newlines in
-- three different screens is how the three come to disagree about what an
-- empty line means.
--
-- Safe to run more than once.

alter table teaching_assignments
  add column if not exists primer_idea text,
  add column if not exists primer_takeaways text[],
  add column if not exists primer_scripture text,
  add column if not exists primer_question text;

-- ---------- what members can read ----------
--
-- The primer is written to be read by the quorum, so all four go in. `notes`
-- stays out, as it always has — that's the presidency's prep.
--
-- `topic` is added here too, and its absence was a real if quiet fault:
-- ThisWeeksLesson falls back to the topic as the headline when no talk has
-- been chosen, and the view never sent it. A week set up with a teacher and a
-- subject showed the bare word "Lesson" on every member's phone, which is
-- less than the weekly email said about the same week.
--
-- security_invoker = off (stated, though it's the default) means the view runs
-- with its owner's rights and isn't blocked by the table's RLS. That is the
-- intent: the column list is the security boundary, because a select policy
-- would expose every column of every matched row.
--
-- Dropped and rebuilt rather than replaced. `create or replace view` can only
-- ADD columns at the end — it matches the existing ones by position, so
-- putting `topic` third reads as renaming talk_title and Postgres refuses:
--
--   ERROR: cannot change name of view column "talk_title" to "topic"
--
-- Appending the new columns instead would have worked and left the view in a
-- different shape here than in schema.sql, which is how a fresh project and a
-- migrated one drift apart. Nothing depends on this view but the app, which
-- selects by name, so dropping it costs nothing and both paths end up
-- identical. The grant below is re-applied because dropping takes it too.

drop view if exists public_lessons;

create view public_lessons
with (security_invoker = off) as
  select
    date,
    teacher_name,
    topic,
    talk_title,
    speaker,
    talk_link,
    primer_idea,
    primer_takeaways,
    primer_scripture,
    primer_question
  from teaching_assignments;

grant select on public_lessons to anon, authenticated;
revoke insert, update, delete on public_lessons from anon, authenticated;

notify pgrst, 'reload schema';
