# Server-side bits

Two functions run on Netlify rather than in the browser, each because the
browser can't do the job:

| function | why it can't be client-side |
| --- | --- |
| `conference-talks.js` | churchofjesuschrist.org sends no CORS headers, so a page can't fetch it |
| `draft-primer.mjs` | holds an API key, which anything in the bundle would publish |

---

## draft-primer — the weekly Quick Summary

Runs **every Tuesday at 13:00 UTC** (6am Mountain in summer, 7am in winter).
It finds the Sunday the quorum next gathers, reads the talk assigned to it,
drafts the primer and writes it into `teaching_assignments`. By midweek the
Quick Summary button is on the feed without anybody having done anything.

It will not overwrite a summary that already exists, will not run without a
talk link, and will not save a draft it couldn't parse. See the header of the
function for why each of those matters.

### What you have to set up, once

Two environment variables to add, in **Netlify → Site configuration →
Environment variables**.

A word on the `VITE_` prefix, since the site already has two of those. Vite
only compiles a variable into the JavaScript the browser downloads if its name
starts with `VITE_` — an opt-in gate, so a secret can't be published by
accident. Netlify hands *functions* every variable whatever its prefix, which
is why this one can reuse the project URL that's already there and why neither
of the keys below may ever be given that prefix.

| variable | where it comes from |
| --- | --- |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys. Needs a card on the account. |
| `SUPABASE_URL` | **Already set** as `VITE_SUPABASE_URL` — the function reads that, so there's nothing to add. |
| `SUPABASE_SECRET_KEY` | Supabase → Settings → API Keys → **Secret key** (`sb_secret_…`). |

On an older project that tab may not exist yet — then it's Settings → API →
Project API keys → **`service_role`** (Reveal), and the variable is called
`SUPABASE_SERVICE_ROLE_KEY` instead. The function takes either name. Supabase
is retiring `service_role`, so use the newer secret key if your project offers
one.

Either way it is **not** the anon / publishable key. That one is meant to be
public and ships in the app; it also can't write to `teaching_assignments`.

A word on that last one. The service role key bypasses row-level security
completely — it can read and write every table regardless of policy. It is the
right key here, because the function has to write to `teaching_assignments`
and there is no logged-in presidency member to borrow rights from. It is also
the key that must never leave the server. If it ever appears in the client
bundle, in git, or in a screenshot, rotate it in Supabase immediately; it is a
key to everything.

### Cost

One talk a week, a few thousand tokens in and under a thousand out. Pennies a
month on the Anthropic side; Netlify's free tier covers the invocation.

### Checking it without waiting for Tuesday

```
# what it would do, writing nothing
curl "https://eqhq.netlify.app/.netlify/functions/draft-primer?dry=1"

# a particular Sunday
curl "https://eqhq.netlify.app/.netlify/functions/draft-primer?date=2026-09-27"
```

Both return JSON with a `did` field saying in words what happened — including
naming a missing environment variable, rather than throwing a stack trace into
a log nobody reads. The scheduled run logs the same line, under
**Netlify → Logs → Functions**.

### If a Sunday has no summary

In rough order of likelihood:

1. No talk link on that Sunday's lesson — the function has nothing to read.
2. `supabase/lesson-primer.sql` hasn't been run, so the columns don't exist.
3. A key is missing or has been rotated. The `?dry=1` call will say which.
4. The lesson was assigned after Tuesday. Run the `?date=` call by hand, or
   wait for next week's run to catch it if it's still the coming Sunday.
