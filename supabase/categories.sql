-- ============================================================
-- POST CATEGORIES
-- ============================================================
-- The four categories used to be a hardcoded array in the app and a CHECK
-- constraint in the database. Adding a fifth meant a code change and a
-- migration, which is a silly thing to need a developer for.
--
-- Safe to run twice. It seeds the four you already have, keeps every existing
-- post working, and never deletes anything.
-- ============================================================

create table if not exists post_categories (
  -- The key is what posts.category holds. Stable: renaming "Activities" to
  -- "Quorum Activities" changes the label, never the key, so no post has to
  -- be rewritten to follow a change of wording.
  key text primary key,
  label text not null,
  -- CSS custom properties, so a category picks up light and dark theming for
  -- free rather than carrying two hex values that somebody has to keep in step.
  accent text not null default 'var(--primary-deep)',
  soft text not null default 'var(--primary-soft)',
  sort_order int not null default 100,
  -- Retired, not deleted. A retired category disappears from the composer and
  -- from Plan, and old posts filed under it keep their label and colour — the
  -- feed's history stays true. Deleting outright would silently restyle a
  -- service project from last year as an announcement.
  retired boolean not null default false,
  -- Whether this category gets its own section under Plan, with dates,
  -- repeats, sign-ups and publishing. Announcements don't: they're written
  -- straight onto the feed and have nothing to plan.
  plans boolean not null default false,
  -- Shown under the section heading in Plan.
  hint text,
  created_at timestamptz not null default now()
);

-- Seed the four that were hardcoded, with the same keys, labels, colours and
-- order they already had. `on conflict do nothing` so re-running never undoes
-- a rename or a recolour somebody has since made.
insert into post_categories (key, label, accent, soft, sort_order, plans, hint) values
  ('announcement', 'Announcements', 'var(--primary-deep)', 'var(--primary-soft)', 10, false,
   null),
  ('activity',     'Activities',    'var(--green)',        'var(--green-soft)',   20, true,
   'Pickleball, basketball, the quorum BBQ.'),
  ('assignment',   'Assignments',   'var(--red)',          'var(--red-soft)',     30, true,
   'Temple cleaning, youth camp, the rodeo — jobs the quorum takes on.'),
  ('temple',       'Temple Trips',  'var(--gold)',         'var(--gold-soft)',    40, true,
   'Sessions the quorum is going to together.')
on conflict (key) do nothing;

-- -------- let posts and events hold a category that didn't exist yesterday --
-- TWO constraints, not one, and missing the second is what made the first
-- version of this migration only half work: adding a category gave it a
-- planner section, and then saving anything into it failed with
--
--   new row for relation "events" violates check constraint "events_kind_check"
--
-- posts.category is what the feed files a post under. events.kind is what the
-- planner files a planned event under. They hold the same values and they had
-- separate constraints, each listing the categories by name.
--
-- Deliberately NOT replaced with foreign keys to post_categories. A foreign
-- key would block retiring a category that still has posts or events, and
-- retiring one with history is exactly the case this is built for. The app
-- resolves an unknown key to a neutral chip rather than crashing — see
-- metaFor().
--
-- The other CHECK constraints in this schema are left alone on purpose:
-- forms.kind, agendas.kind and ministering_contacts.kind are fixed app
-- concepts, not lists the ward edits.
alter table posts drop constraint if exists posts_category_check;
alter table events drop constraint if exists events_kind_check;

do $$
declare t text; c text;
begin
  -- These have been created under more than one name over the life of the
  -- database. Drop whatever is actually there rather than guessing at it.
  foreach t in array array['posts', 'events'] loop
    if to_regclass(t) is null then continue; end if;
    for c in
      select conname from pg_constraint
      where conrelid = t::regclass
        and contype = 'c'
        and (pg_get_constraintdef(oid) ilike '%category%'
          or pg_get_constraintdef(oid) ilike '%kind%')
    loop
      execute format('alter table %I drop constraint %I', t, c);
    end loop;
  end loop;
end
$$;

-- ---------- security ----------
-- Everyone reads: the feed has to colour a chip for a member with no account.
-- Only the presidency writes. Same shape as app_settings.
alter table post_categories enable row level security;

drop policy if exists "Anyone can read categories" on post_categories;
create policy "Anyone can read categories" on post_categories
  for select using (true);

drop policy if exists "Presidency writes categories" on post_categories;
create policy "Presidency writes categories" on post_categories
  for all using (is_presidency()) with check (is_presidency());

notify pgrst, 'reload schema';
