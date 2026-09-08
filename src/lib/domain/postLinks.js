/**
 * Which links a post actually shows.
 *
 * A post has two sources of links and they can name the same place twice.
 * There's `link_url` on the post itself — set by the planner when it
 * publishes, or typed in the composer — and there are extra rows in
 * post_links, added on the post afterwards for the cases one link can't cover
 * (stake conference has a streaming link per language).
 *
 * The Stake Blood Drive ended up with both: the planner's sign-up link, and a
 * "Sign Up Here" added by hand during the stretch when the planner's link was
 * being shown as "Details" and looked like it wasn't the sign-up. Once that
 * was fixed the post had two buttons to the same page.
 *
 * Pure, so the rule can be checked without a database or a browser.
 */

/**
 * Two URLs that mean the same page.
 *
 * Deliberately cautious. Case in the host and a trailing slash are noise;
 * everything else is kept, because a query string is exactly what tells one
 * sign-up form from another (/?f=abc and /?f=def are different sheets) and
 * "tidying" those away would merge two real links into one.
 */
export function sameTarget(a, b) {
  const tidy = (u) => {
    const s = String(u || "").trim();
    if (!s) return "";
    const m = /^(https?:\/\/)([^/?#]+)(.*)$/i.exec(s);
    // Not a full URL — compare what we were given, minus a trailing slash.
    if (!m) return s.replace(/\/+$/, "");
    return `${m[1].toLowerCase()}${m[2].toLowerCase()}${m[3]}`.replace(/\/+$/, "");
  };
  const x = tidy(a);
  return !!x && x === tidy(b);
}

/**
 * The post's own link first, then the extras — with any extra that points
 * where the post's own link already points left out.
 *
 * The post's own link wins because it's the one carrying the meaning: its
 * label is what decides between a Sign Up button and a details link, in the
 * feed's Upcoming row and in the weekly email. Dropping it in favour of the
 * hand-added copy would silently turn a sign-up back into a plain link.
 *
 * Extras that duplicate each other are collapsed too, so pasting the same
 * address twice shows once.
 */
export function visibleLinks(post, links = []) {
  const out = [];
  const own = String(post?.link_url || "").trim();
  if (own) {
    out.push({ id: "own", href: own, label: post?.link_label || "Details", primary: true });
  }

  for (const l of (links || []).filter((l) => l?.post_id === post?.id)
    .slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
    const href = String(l?.url || "").trim();
    if (!href) continue;
    if (out.some((o) => sameTarget(o.href, href))) continue;
    out.push({ id: l.id, href, label: l.label || href, primary: false });
  }
  return out;
}

/**
 * The extras that are being hidden, for the presidency's link editor.
 *
 * Hiding a duplicate on the feed is right, but silently is not: somebody
 * added that row on purpose and will add it again next time unless the screen
 * that manages links says what happened to it.
 */
export function duplicateLinks(post, links = []) {
  const own = String(post?.link_url || "").trim();
  const kept = new Set(visibleLinks(post, links).map((l) => l.id));
  return (links || [])
    .filter((l) => l?.post_id === post?.id)
    .filter((l) => !kept.has(l.id) && String(l?.url || "").trim())
    .map((l) => ({ ...l, duplicateOf: sameTarget(own, l.url) ? "the post's own link" : "another link" }));
}
