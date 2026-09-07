-- ============================================================
-- LAST SUNDAY'S ANNOUNCEMENTS, READABLE BY MEMBERS
-- ============================================================
-- "lets also add a hub similar to Upcoming that lists the Announcements from
--  the last Sunday. it can pull from the Announcements on the Sunday Quorum
--  Meeting"
--
-- Read-only, no account needed — the same audience that reads the feed.
--
-- Safe to run twice. Grants reading only; nothing here lets anybody write.
-- ============================================================

-- ---------- why a view and not a policy ----------
-- Same reasoning as supabase/teaching-public.sql, and it matters more here.
-- agenda_items is the presidency's working table: alongside the announcement
-- text it carries `notes`, `who` and `due_date`, which is where things like
-- who needs visiting and why get written down. RLS is ROW-level, so a select
-- policy on that table would publish every column of every row it matched —
-- the whole working record, not the sentence meant to be read out.
--
-- The view names the safe columns. A column added to the table later doesn't
-- silently join it, and the presidency-only policy on the base table stays
-- exactly as it is (no security_invoker, so the view reads as its owner).

-- ---------- which Sunday ----------
-- The most recent Sunday meeting that has actually happened, and only that
-- one. Two things fall out of `meeting_date <= current_date` that are worth
-- stating plainly:
--
--   1. A drafted agenda for NEXT Sunday is invisible. The presidency builds
--      those days ahead, and an announcement is not public until it has been
--      made. Without this, members would read next week's notices — including
--      ones that get edited or dropped before Sunday — as though they were
--      already announced.
--   2. The hub doesn't empty out on a fifth Sunday or over conference. It
--      keeps showing the last real meeting until a newer one replaces it,
--      which is what "from last Sunday" means to somebody checking their
--      phone on a Wednesday.
--
-- current_date is the database's date. The app never sends one, so a phone
-- with a wrong clock can't ask for a Sunday that hasn't happened yet.
create or replace view sunday_announcements_public as
  select
    a.meeting_date,
    i.text,
    i.link_url,
    i.sort_order
  from agenda_items i
  join agendas a on a.id = i.agenda_id
  where a.kind = 'sunday'
    and i.section = 'announcements'
    and a.meeting_date = (
      select max(meeting_date) from agendas
      where kind = 'sunday' and meeting_date <= current_date
    );

-- Deliberately absent, and each for its own reason:
--   notes           — the presidency's private working notes
--   who             — who is responsible; internal, and often a name that
--                     hasn't been asked yet
--   due_date, done  — task tracking, not part of the announcement
--   category        — an internal grouping key
--   attachment_url  — files in the agenda-files bucket are presidency-only;
--                     publishing the URL would hand out a link to one.
--                     link_url is the outward-facing link and is kept.
--   id, agenda_id   — internal uuids; nothing reads an announcement by id

-- ---------- who can read it ----------
-- anon is a member with no account; authenticated is the presidency. Both get
-- select and nothing else, so this stays read-only from the outside no matter
-- what the app does.
grant select on sunday_announcements_public to anon, authenticated;
revoke insert, update, delete on sunday_announcements_public from anon, authenticated;

notify pgrst, 'reload schema';
