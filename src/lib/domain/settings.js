/**
 * The handful of things the quorum sets up once, and what counts as valid.
 *
 * Separate from useSettings.js, which does the fetching: this half is pure, so
 * it can be checked without a database or a browser. The rule about which
 * links are safe is the sort of thing that should be tested directly rather
 * than through three layers of React.
 */

export const SETTING_KEYS = {
  GROUPME_URL: "groupme_url",
};

/**
 * Whether a link is one we're willing to put behind a button.
 *
 * Only http(s). A setting is typed into a box by a person, and a `javascript:`
 * URL in an href that every member taps is the one place in this app where
 * that would actually matter.
 */
export function safeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
}
