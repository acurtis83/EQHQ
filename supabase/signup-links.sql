-- ============================================================
-- OUTSIDE SIGN-UP LINKS
-- ============================================================
-- "im not sure why the service events dont show the Sign Up button like the
--  Assignement or Activity"
--
-- Safe to run twice. Adds one column and changes no existing data.
-- ============================================================

-- The feed decides whether to show a Sign Up button from the post's link
-- LABEL. That works for anything written in the feed composer, where the
-- presidency types the label — but not for events published from the Planner,
-- which sets the label itself: "Sign Up" when one of our own forms is
-- attached, and "Details" for everything else.
--
-- So a blood drive pointing at the stake's own sign-up page, or a day of
-- service using a Google form, was labelled "Details" before anything could
-- ask what the link was for, and no button appeared. There was no way to say
-- otherwise from that screen — the only structured field is form_id, and
-- these links aren't our forms.
--
-- Hence a flag on the event. It's a fact about the link that only the person
-- attaching it knows and nothing can infer: the URL looks the same either
-- way, and guessing from the hostname would mean keeping a list of every
-- sign-up service the stake might use.
--
-- Defaults to false, so every event that exists today keeps the label it has
-- and nothing silently sprouts a button.
alter table events add column if not exists link_is_signup boolean not null default false;

comment on column events.link_is_signup is
  'The attached link_url is where people sign up, not just information. '
  'Drives the Sign Up button on the feed post and the wording in the weekly '
  'email. Ignored when form_id is set — one of our own forms is already a '
  'sign-up.';

notify pgrst, 'reload schema';
