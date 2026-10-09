-- ============================================================
-- An announcement stops being shown once it's over.
-- ============================================================
--
-- "the announcements on the FEED include a temple cleaning that is in the
--  past....or should updated to the new date"
--
-- "Stake Temple Cleaning Assignment - Friday Oct 2", still on the feed on the
-- 9th. The date in that sentence is just text — nothing in the app knows it is
-- a date, so nothing could retire it.
--
-- But there is already a control for exactly this: `expires_on`, the "Repeat
-- until" box on each announcement. Until now it only decided whether an
-- announcement carried forward to the NEXT agenda; it had no effect on what
-- members see. So an announcement could be marked as finished and still be on
-- the feed, which is the worst of both — a control that looks like it works.
--
-- Now one date governs both. Set it to the day the thing happens and the
-- announcement leaves the feed the morning after, without anybody editing the
-- Sunday agenda.
--
-- Left out deliberately: reading dates out of the text. "Friday Oct 2" could
-- be parsed, and a wrong guess would hide an announcement nobody meant to
-- hide — in a hub whose entire job is making sure things get heard. The date
-- box is explicit, and the agenda screen can prompt for it.
--
-- Safe to run more than once.

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
    -- Null means "until somebody removes it", which is the common case and
    -- stays the default. A date means the last day it is worth saying.
    and (i.expires_on is null or i.expires_on >= current_date)
    and a.meeting_date = (
      select max(meeting_date) from agendas
      where kind = 'sunday' and meeting_date <= current_date
    );

grant select on sunday_announcements_public to anon, authenticated;
revoke insert, update, delete on sunday_announcements_public from anon, authenticated;

notify pgrst, 'reload schema';
