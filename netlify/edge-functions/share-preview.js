/**
 * Puts the form's name on a shared link.
 *
 * A link to /?f=<id> was previewing as "Elders Quorum" in Messages, because
 * that's the <title> baked into index.html. The app sets a better title once
 * it loads, but nothing that generates a link preview — Messages, Slack,
 * Facebook, Twitter — runs JavaScript. They fetch the HTML, read the meta
 * tags, and leave. So the title has to be right in the first response.
 *
 * This runs at the edge, before the HTML is sent: if the URL carries ?f=, it
 * looks the form up and rewrites the title and Open Graph tags. Forms generated
 * from an event are already named after it ("Temple Cleaning — Sign-Up"), so
 * the event's name comes through without a second lookup.
 *
 * Only published forms are readable with the anon key, which is the same rule
 * the share link itself follows — an unpublished form shows nothing either way.
 */

const TIMEOUT_MS = 1500;

function env(name) {
  // Netlify's own global in production; Deno.env when running netlify dev.
  try {
    if (typeof Netlify !== "undefined" && Netlify.env) return Netlify.env.get(name);
  } catch { /* fall through */ }
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function lookupForm(id) {
  const base = env("VITE_SUPABASE_URL");
  const key = env("VITE_SUPABASE_ANON_KEY");
  if (!base || !key) return null;

  const url = `${base}/rest/v1/forms` +
    `?id=eq.${encodeURIComponent(id)}` +
    `&published=is.true` +
    `&select=title,description&limit=1`;

  // A crawler that waits gives up and shows nothing, so cap the wait and let
  // the generic preview through rather than holding the page.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default async function sharePreview(request, context) {
  const url = new URL(request.url);
  const id = url.searchParams.get("f");

  // Every other request is untouched — no lookup, no rewrite, no delay.
  if (!id) return;

  const response = await context.next();
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;

  const form = await lookupForm(id);
  if (!form || !form.title) return response;

  const title = escapeHtml(form.title);
  const description = escapeHtml(
    form.description || "Tap to sign up — no account needed."
  );
  const image = `${url.origin}/icons/icon-512.png`;

  const tags = [
    `<title>${title}</title>`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:url" content="${escapeHtml(url.href)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="EQ Hub" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ].join("\n    ");

  let html = await response.text();

  // Drop the defaults first, or Messages picks whichever it saw first and the
  // rewrite does nothing.
  html = html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, "")
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, "")
    .replace(/<meta\s+name="description"[^>]*>/gi, "")
    .replace("</head>", `  ${tags}\n  </head>`);

  return new Response(html, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers),
      "content-type": "text/html; charset=utf-8",
      // Previews get cached hard by Messages and Slack. Keep it short so a
      // renamed form doesn't preview under its old name for a week.
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}

export const config = { path: "/" };
