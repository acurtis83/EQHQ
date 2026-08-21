# EQ Hub

One app for the Holbrook Farms 8th Ward Elders Quorum.

- **Members** open the link and see the feed, with **this Sunday's lesson always
  at the top**. No account, nothing to install.
- **Presidency** sign in and get everything else: agendas, teaching, ministering, roster, callings.

This replaces the old EQ Planner. It keeps that app's hard-won domain logic
(conference talk library, meeting cadence, roster parsing, LPCH presets) but
drops the single-JSON-blob storage that would lose edits when two people saved
at once.

## Setup

**1. Database.** In a new Supabase project: SQL Editor → New query → paste
`supabase/schema.sql` → Run.

**2. Env.** `cp .env.example .env` and fill in your project URL and anon key
(Supabase → Project Settings → API).

**3. Presidency accounts.** For each of the four of you, in Supabase →
Authentication → Users → Add user (email + password, auto-confirm). Then in the
SQL editor, grant presidency access:

```sql
insert into presidency_members (user_id, name, role)
values ('<paste-the-user-uuid>', 'Drew Curtis', 'Quorum President');
```

Repeat for Cam (First Counselor), Ryan (Second Counselor), and Carl (Secretary).
**Nobody has presidency access until they have a row in this table** — an auth
account alone gets you nothing.

**4. Run.**

```bash
npm install
npm run dev
```

**5. Bring your old data over.** In the old app: Settings → Download backup.
Then here: sign in → Settings tab → choose that `.json` file. You'll see a count
of what was found before anything is written.

## Deploy

Netlify, same as before: build `npm run build`, publish `dist`. Add
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as site env vars.

## A note on iCloud

This folder syncs via iCloud, which is good for editing across your devices but
bad for `node_modules` (tens of thousands of files). `.gitignore` covers git,
but iCloud ignores that. Either run `npm install` in a local clone outside
iCloud, or right-click `node_modules` in Finder and choose "Remove Download"
when you're done working.

## Where things stand

Built and verified:

- Two-zone shell — open member feed, login-gated presidency zone
- Supabase Auth + row-level security (presidency tables return nothing without a session)
- Home screen — dark lesson hero, four shortcut tiles (Announcements, Temple
  trips, Activities, Groups) with live counts that filter the feed, then the feed
- Feed: post, pin, delete, comment, live updates
- Sign-ups — slots on any post ("Buns ×2", "Driver ×3"); members claim without an
  account, the card shows what's still needed, presidency manage slots and claims
- This Week's Lesson hero — permanently first, driven by the teaching schedule so
  nobody has to post it weekly; names the reason (General Conference, stake
  conference, 5th Sunday) when there's no lesson
- Roster: add/edit/remove, search, age-band filters, paste a ward directory export
- Legacy importer: roster, teaching, running list, agendas + items, callings, ministering districts/companionships/interviews
- Carried over from the old app: conference talk library (33 talks), meeting cadence rules, roster parser, calling stages, LPCH presets, ministering survey template

- Presidency zone — running list (6 buckets) and presidency meeting agendas,
  with pull-from-running-list, carry-over of unfinished items, and copy-to-share
- Teaching schedule — Sunday-by-Sunday assignments, rotation generator,
  conference-talk picker with real Gospel Library links, stake conference marking
- Conference talk library — one-tap import after each General Conference
  (Settings tab), with direct talk links

- Forms — a builder for surveys, sign-ups and assignments with nine question
  types, templates, share links, publish/unpublish, results and CSV export

- Callings — board across the eight stages with move controls, group view by
  committee, auto-stamped stage dates, and editable groups
- Branded splash on launch, using the ward logo
- Presidency Home Hub — this Sunday, upcoming activities and temple trips,
  calling statuses, quorum stats by age band, and open action items per person

Stubbed, with tabs in place:

- Group chat (the Groups tile explains it's coming)
- Sunday quorum meeting agenda
- Ministering


## Layout

The phone layout is the baseline and is untouched. Above 900px the shell widens
to 980px and card lists go two-column; above 1280px it widens to 1120px and the
whole surface scales up ~6%, because everything is sized in px for a phone and
nudging the container is more predictable than re-specifying every size.

Borders and card shadows were strengthened in both themes so cards read as
distinct objects rather than floating text.

## Age bands

18–35, 36–45, 46–55, 56–64, 65+. No overlap — 65 counts in "65+" only, so the
bands always sum to the member total. Counts are computed from `age` at read
time rather than the stored `band`, so rows written under the old four-band
scheme still land in the right bucket without a migration.

## Presidency Meetings and the Planner

- **Planner** is the standing list (six buckets) that feeds agendas.
- **Presidency Meetings** are the dated meetings themselves.

An agenda can be **saved as PDF** — the PDF button opens the browser print
dialog against a print-only layout, so "Save as PDF" produces a real document.
That works everywhere including iOS, unlike generating a file client-side.

Agenda items take a **link or a file**. Files go to a Supabase Storage bucket
named `agenda-files`.

**Create that bucket before attaching anything:** Supabase → Storage → New
bucket → name it `agenda-files` → tick **Public bucket**. Without it, uploads
fail with a clear message rather than silently.

## Logo and splash

`public/logo.png` is the ward mark with the black background removed;
`logo-light.png` recolours the white elements to ink so the mark also reads on
a light background. The originals were designed for dark, so the splash screen
is deliberately dark in both themes.

The splash shows briefly on every launch, and:

- a tap skips it
- the OS "reduce motion" setting skips it entirely
- it never shows on a `?f=` form link, where someone arrived to do one thing

App icons are generated from the same mark. The maskable icon has its own 22%
safe margin and an opaque background, otherwise Android launchers crop into the
artwork.

## Callings

Two views over the same data:

- **Board** — the eight stages as a horizontal pipeline (Need → Proposed →
  Approved → Called → Sustained → Set Apart, plus Need to Release → Released),
  with arrows to move a calling along.
- **By group** — broken down by committee: EQ Presidency, Teachers, Activities
  Committee, Service Committee, Ministering. Groups are rows, so you can rename
  and add them; one holding callings can't be deleted until they're moved.

Moving a stage **stamps the date it was reached** into `stage_dates`, so you can
see how long something has been sitting at Proposed. An existing stamp is never
overwritten if you move backwards and forwards again.

## Post categories

The tiles and the post categories are one list (`src/member/categories.js`), so
they can't drift apart:

| Category | Tile |
| --- | --- |
| `announcement` | Announcements |
| `temple` | Temple trips |
| `activity` | Activities |

There is deliberately no `lesson` category — this Sunday's lesson comes from the
teaching schedule via the hero, not from a post someone has to remember to
write. `groups` is a destination, not a category.

If you already ran an earlier version of `schema.sql`, the old categories were
`announcement, event, lesson, reminder`. A commented migration at the bottom of
that file maps them across.

## Loading conference talks

After each General Conference: **Settings → Conference talks → Fetch talks →
import.** Takes about thirty seconds, twice a year.

The conference dropdown is populated from the
[General Conference collection page](https://www.churchofjesuschrist.org/study/general-conference?lang=eng),
so it only ever lists conferences that have actually been published, newest
first and preselected. (Guessing dates instead would let you pick an October
that hasn't happened yet and get a 404.) If that lookup fails — say you're
running without the function — it quietly falls back to a computed list.

It works by calling `netlify/functions/conference-talks.js`, which fetches the
conference index page server-side (the browser can't — the Church site sends no
CORS headers) and parses it. Talks arrive with their **real** Gospel Library
URLs, e.g. `/study/general-conference/2026/04/13kearon?lang=eng`, not search
links.

Splitting a title from a speaker is the fiddly part, because the page renders
them as one run of text and conference titles are title-case — "About His
Business Patrick Kearon" could plausibly split three ways. The parser handles
this by cross-referencing the two listings on the page, which run in opposite
orders (title-then-speaker in the nav, speaker-then-title in the tiles); the
speaker is the exact string that is both a suffix of one and a prefix of the
other. Anything that can't be resolved that way falls back to a conservative
guess, is flagged in the import preview alongside the raw text from the page,
and never absorbs a title word into the speaker.

Procedural items (sustainings, auditing report, solemn assembly, introduction)
are filtered out; "Closing Remarks" is kept, matching the old app's library.

Re-importing the same conference updates rather than duplicates — `slug` is the
primary key.

**Note:** the function only exists on a deployed Netlify site. `npm run dev`
alone won't serve it — use `netlify dev` locally.

## What members can see

Members have no account, so everything they see comes from tables with a public
read policy: `posts`, `comments`, `signup_slots`, `signup_claims`.

The lesson card needs teaching data, but `teaching_assignments` is
presidency-only because `notes` can hold private prep comments. So two views
expose just the public columns:

```sql
public_lessons             -- date, teacher_name, talk_title, speaker, talk_link
public_calendar_exceptions -- date, kind
```

`notes`, `teacher_id`, and everything else stay unreadable. The column list is
the security boundary — if you add a sensitive column to
`teaching_assignments` later, it is not exposed unless you add it to the view.

## Forms

Presidency tab → **Forms**. Start from a template (temple cleaning shifts,
volunteer shifts, ministering check-in, anonymous feedback, or blank), build
questions, publish, then share.

Question types: short answer, paragraph, multiple choice, checkboxes,
**sign-up slots**, scale 1–5, yes/no, date, number.

**Sign-up slots** are what make assignments work. Each option carries a limit —
type `Saturday 6:00 AM ×4` in the builder — and the option closes itself when
full, so two people can't take the last spot. Results show `4/4` per slot.

**Distribution.** Publishing gives you a link at `/?f=<id>` that renders the
form on its own page with no login and no nav, so you can text it to anyone.
"Post to the feed" also drops a card on the home screen linking to it.

**Anonymity is per-form.** Sign-ups collect names; a candid survey doesn't.

### Why survey answers aren't publicly readable

A capacity question needs public read access to count remaining spots, and a
sign-up sheet should show who took which slot. A survey answer must not be
readable by anyone holding the link, or anonymous mode would be theatre.

So there is no blanket public read on `form_answers`. Instead the
`public_form_capacity` view exposes capacity answers only — the join requires
`type = 'capacity'` — and blanks the name when the form is anonymous.
Everything else needs `is_presidency()`.

## Sign-ups

On any post, presidency can add slots — either from a template (BBQ, temple trip,
service project, meal train) or one at a time. Members tap "I'll bring it",
enter a name and an optional note, and the card shows `2 of 3` per slot plus a
running "N still needed" for the whole post.

**Only presidency can remove a claim.** Members sign up without an account, so
the database has no way to tell whose claim is whose — a public delete policy
would let anyone remove anyone. The `signup_claims` table therefore has public
`insert` but no public `delete`; removal is behind `is_presidency()`. Practically
that means when someone drops out they tell you, and you tap their name in the
manage sheet.

If you already ran an earlier `schema.sql`, drop the old permissive policy —
there's a one-line `drop policy` at the bottom of the file.

## Meeting cadence

Encoded in `src/lib/domain/dates.js`:

- 2nd and 4th Sundays until **Sep 6, 2026**; every Sunday from then on.
- **General Conference** (first Sunday of April and October) — no quorum meeting.
- **Stake conference** — no quorum meeting. Not computable, so these dates are
  stored in `calendar_exceptions`; mark one by opening that Sunday in the
  teaching schedule.
- **5th Sundays** — the quorum still meets, but the bishopric directs it, so no
  teacher is assigned. Shown as "5th Sunday — bishopric directed" rather than
  blank.

Stake conference takes precedence over the other two.

## Verification

Automated checks across the project:

- **40** on the cadence rules — General Conference dates verified against
  the real calendar for 2025–2028, the Sep 6 2026 weekly switch, 5th Sundays,
  stake conference precedence.
- **11** on the roster parser (real LDS export shapes).
- **35** on the member zone and roster in a headless browser.
- **33** on the presidency agenda — pull routing, carry-over dedupe, copy output.
- **37** on the teaching schedule — rotation evenness, skipping of non-teaching
  Sundays, talk picker, stake conference toggling.
- **73** on the conference talk parser — exact title/speaker splits for every
  talk on the real April 2026 page, including accented surnames (Caussé),
  parenthetical nicknames (Chi Hong (Sam) Wong), and titles that open with
  curly quotes; procedural filtering; fallback behaviour.
- **16** on the import function — success, 404, upstream error, bad input,
  layout-change detection, and network failure.
- **17** on conference discovery — real collection-page markup, with decade
  archives, speaker and topic links correctly ignored.
- **10** on the two function modes together, including error paths.
- **22** on the This Week's Lesson card — visible signed-out, always first,
  each no-lesson reason, unassigned state, and that prep notes never appear.
- **25** on the home screen — hero states, tile counts, tile filtering, and that
  no old category survives.
- **29** on sign-ups — claiming, full slots, remaining counts, templates, and
  that members cannot remove a claim while presidency can.
- **47** on the forms logic — question types, capacity counting, validation,
  templates, summaries, and CSV escaping.
- **51** on the forms UI — templates, builder, reorder, publish, share links,
  required validation, capacity closing when full, and anonymity.
- **37** on callings — board ordering, stage moves, date stamping, group view,
  group protection, and editing.
- **26** on the Home Hub — panels, quorum stats using the new bands, action
  items by owner, and the renames.
- **20** on the age bands — every boundary, and that counts never double-count.
- **17** end-to-end regression across feed, sign-ups, agenda, roster, teaching,
  forms, and callings.

`eq-hub-preview.html` (one folder up) is a no-install click-through of the same
UI with sample data.
