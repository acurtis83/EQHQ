# Start here

Five steps, about 20 minutes. You only do this once.

---

## 1. Database

1. Go to [supabase.com](https://supabase.com) → **New project**. Name it `eq-hub`.
   Save the database password somewhere; you won't need it often.
2. Wait for it to finish setting up (~2 min).
3. Left sidebar → **SQL Editor** → **New query**.
4. Open `supabase/schema.sql` from this folder, copy **all** of it, paste, and
   click **Run**.
5. You should see "Success. No rows returned." That's correct — it creates
   tables, it doesn't return data.

It also seeds five calling groups (EQ Presidency, Teachers, Activities
Committee, Service Committee, Ministering). Re-running the file later is safe —
it won't duplicate them.

### Storage bucket (for agenda attachments)

Supabase → **Storage** → **New bucket** → name it `agenda-files` → tick
**Public bucket** → Create. Skip this and attaching a file to an agenda item
fails with a message telling you the bucket is missing.

---

## 2. Your four logins

Members never sign in. Only the presidency does.

1. Supabase → **Authentication** → **Users** → **Add user** → *Create new user*.
2. Email and password for yourself. Tick **Auto Confirm User**.
3. Repeat for Cam, Ryan, and Carl.
4. Still in Authentication → Users, copy each person's **UID** (long string).
5. Back to **SQL Editor** → New query. Paste this, swap in the real UIDs and
   names, and Run:

```sql
insert into presidency_members (user_id, name, role) values
  ('PASTE-DREW-UID',  'Drew Curtis', 'Quorum President'),
  ('PASTE-CAM-UID',   'Cam',         'First Counselor'),
  ('PASTE-RYAN-UID',  'Ryan',        'Second Counselor'),
  ('PASTE-CARL-UID',  'Carl',        'Secretary');
```

**An account alone gives nobody access.** The row in `presidency_members` is
what grants it. If someone can sign in but sees no tabs, their row is missing.

---

## 3. Your two keys

Supabase → **Project Settings** → **API**. Copy these two — you'll paste them
into Netlify in step 5:

- **Project URL** — looks like `https://abcdefgh.supabase.co`
- **anon public** key — the long one labelled `anon` `public`

Don't use the `service_role` key. That one bypasses all the security rules.

---

## 4. GitHub

1. [github.com/new](https://github.com/new) → name it `eq-hub` → **Private** →
   **Create repository**.
2. On the empty repo page, click **uploading an existing file**.
3. Unzip `eq-hub.zip`, then drag the **contents** of the folder into the browser
   — all the files and the `src`, `public`, `netlify`, and `supabase` folders.
   Not the outer `eq-hub` folder itself.
4. Scroll down, click **Commit changes**.

There's no `.env` in the zip on purpose — keys don't belong in a repo.

---

## 5. Netlify

1. [netlify.com](https://netlify.com) → **Add new site** → **Import an existing
   project** → **GitHub** → pick `eq-hub`.
2. It should already show:
   - Build command: `npm run build`
   - Publish directory: `dist`
3. Before deploying, click **Add environment variables** and add:

   | Key | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | your Project URL from step 3 |
   | `VITE_SUPABASE_ANON_KEY` | your anon public key from step 3 |

4. **Deploy**.

If you deploy first and add the variables after, hit **Trigger deploy → Clear
cache and deploy site** — Vite bakes these in at build time, so they don't take
effect until a rebuild.

---

## Then

- Open the site. You'll see the member feed.
- Tap **Presidency** → sign in with the email and password from step 2.
- **Roster** → *Paste Ward Directory* → paste your directory. Check the per-field
  counts in the preview before importing.
- **Teaching** → *Generate* → set the rotation.
- **Settings** → *Conference talks* → fetch the latest conference.
- **Settings** → *Import from the old app* if you want your old Planner data.

Share the site URL with the quorum. Tell them to add it to their home screen —
iPhone: Share → Add to Home Screen.

---

## Later changes

Once it's running, changes are: edit files → commit to GitHub → Netlify
rebuilds itself in about a minute. You don't repeat any of the above.

## Updating the database later

**Run `supabase/schema.sql` again.** SQL Editor → New query → paste the whole
file → Run. It is safe to re-run: it creates only what's missing, adds columns
that newer features need, and never deletes a table or a row.

That one file handles both kinds of gap — tables you don't have yet, and
columns missing from tables you do have.

`supabase/catch-up.sql` is a shorter alternative that only adds columns. Use it
if you know your tables are all present; otherwise `schema.sql` is the safer
choice and does strictly more.

## If something looks wrong

- **"Could not find the 'X' column of 'Y' in the schema cache"** — your database
  predates that column. Re-run `supabase/schema.sql`, then reload the app. Its
  last line also refreshes Supabase's cached copy of the schema, which is the
  part that makes the error clear immediately rather than minutes later.
- **`relation "something" does not exist`** — your database predates that whole
  feature. Same fix: re-run `supabase/schema.sql`, which creates it.
- **`policy "..." already exists`** — you're on an older copy of `schema.sql`.
  Grab the current one; it drops each policy before creating it, so it re-runs
  cleanly.

- **Blank page or "Couldn't load"** — env vars missing or misspelled in Netlify,
  or you haven't rebuilt since adding them.
- **Sign in works but no tabs appear** — missing `presidency_members` row (step 2).
- **"Fetch talks" fails** — that's a Netlify function; it only exists on the
  deployed site, not on `npm run dev`.
- **Everything empty after signing in** — the SQL in step 1 didn't run. Re-run it;
  it's safe to run twice.
