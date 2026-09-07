-- ============================================================
-- THE TEACHING SCHEDULE, READABLE BY MEMBERS
-- ============================================================
-- "can we add the ability for someone that is called as a Teacher to see the
--  Teaching Schedule?"
--
-- Read-only, no account needed — the same audience that reads the feed.
--
-- Safe to run twice. Grants reading only; nothing here lets anybody write.
-- ============================================================

-- ---------- why a view and not a policy ----------
-- The obvious move is `create policy "Anyone can read teaching" ... using
-- (true)` on teaching_assignments. That would be a mistake: RLS is ROW-level.
-- A select policy exposes every COLUMN of the rows it matches, and that table
-- has a `notes` field the presidency writes into. Its placeholder says
-- "Anything the teacher should know", so some of it is probably fine to
-- share — but it is free text written over months on the understanding that
-- it was private, nobody can audit what is in there now, and publishing it
-- retroactively can't be undone.
--
-- So: a view listing the columns by name. What's on it is a decision somebody
-- made on purpose, and a column added to the table later doesn't silently
-- join it.
--
-- The view is owned by the role that creates it and does NOT set
-- security_invoker, so it reads the base table on its owner's behalf and the
-- presidency-only policy underneath stays exactly as it is. That policy is
-- still what protects `notes`: even a member who guesses the table name gets
-- nothing.
create or replace view teaching_public as
  select
    date,
    teacher_name,
    topic,
    talk_title,
    speaker,
    talk_link,
    no_lesson_reason
  from teaching_assignments;

-- Deliberately absent, and each for its own reason:
--   notes       — private, see above
--   teacher_id  — an internal uuid; teacher_name is the part anybody wants,
--                 and exposing member ids invites joining against them
--   id          — likewise, and nothing reads the schedule by row id
--   created_at  — when the presidency happened to type it in is nobody's
--                 business and tells you nothing about the lesson

-- Stake conference, ward conference and anything else that displaces the
-- quorum block. Without this a member sees a gap in the schedule with no
-- explanation, which reads as "nobody has sorted this out yet".
--
-- `note` is left off for the same reason as teaching notes: it's free text.
create or replace view calendar_exceptions_public as
  select date, kind from calendar_exceptions;

-- ---------- who can read them ----------
-- anon is a member with no account; authenticated is the presidency. Both get
-- select and nothing else — no insert, update or delete is granted, so the
-- schedule is read-only from the outside no matter what the app does.
grant select on teaching_public to anon, authenticated;
grant select on calendar_exceptions_public to anon, authenticated;

-- Belt and braces: revoke everything else in case a previous run or a
-- default privilege granted more.
revoke insert, update, delete on teaching_public from anon, authenticated;
revoke insert, update, delete on calendar_exceptions_public from anon, authenticated;

notify pgrst, 'reload schema';
