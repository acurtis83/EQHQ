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

-- ---------- let posts hold a category that didn't exist yesterday ----------
-- The CHECK constraint listed the four by name, so any new category would be
-- rejected by the database no matter what the app allowed. It goes.
--
-- Deliberately NOT replaced with a foreign key to post_categories. A foreign
-- key would block retiring a category that still has posts, and retiring one
-- with history is exactly the case this is built for. The app resolves an
-- unknown key to a neutral chip rather than crashing — see categoryMeta().
alter table posts drop constraint if exists posts_category_check;

do $$
declare c text;
begin
  -- The constraint has been created under a couple of names over the life of
  -- this database. Drop whatever is actually there rather than guessing.
  for c in
    select conname from pg_constraint
    where conrelid = 'posts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table posts drop constraint %I', c);
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
