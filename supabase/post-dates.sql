-- ============================================================
-- An assignment that runs over several dates, on the feed.
-- ============================================================
--
-- "why is the Stake Temple Cleaning assignment not showing on the FEED or
--  upcoming events?"
--
-- Because a post carries ONE date. The temple cleaning runs five dates to
-- 15 December, the post was stamped with the first of them, and on the 19th
-- of September the whole assignment silently left the feed with four dates
-- still to come.
--
-- The planner already knows the real dates — they're in event_dates — and an
-- event already knows which post it was published as, via events.post_id.
-- Nothing new has to be stored; the feed just needs to be able to read them.
--
-- Keyed by post_id rather than event_id, because that is the only id the feed
-- has. It never loads the planner.
--
-- The WHERE clause is the security boundary, and it is why this is a view
-- rather than a policy: only dates belonging to an event that has already
-- been published to the feed are exposed. An assignment the presidency is
-- still working out is invisible here, which is the same promise the rest of
-- the planner makes. Row-level security couldn't express that without
-- publishing every column of every matched row.
--
-- security_invoker = off (stated, though it's the default) so the view runs
-- with its owner's rights and isn't blocked by the underlying tables' RLS.
--
-- Safe to run more than once.

drop view if exists public_event_dates;

create view public_event_dates
with (security_invoker = off) as
  select
    e.post_id,
    d.event_date,
    d.event_time,
    -- The form for THIS date, when a particular shift has its own sign-up.
    -- The Sunday agenda already prefers it over the event's general one.
    d.form_id
  from event_dates d
  join events e on e.id = d.event_id
  where e.post_id is not null
    and coalesce(d.done, false) = false;

grant select on public_event_dates to anon, authenticated;
revoke insert, update, delete on public_event_dates from anon, authenticated;

notify pgrst, 'reload schema';
