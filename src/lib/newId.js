/**
 * A uuid generated on the client.
 *
 * Members submit forms and RSVPs without an account, and those tables have no
 * public read policy on purpose — a survey answer must not be readable by
 * whoever has the link. But `insert(...).select()` asks Postgres to hand the
 * new row back, and RETURNING is subject to the SELECT policy. With no policy
 * to satisfy, the whole insert is rejected:
 *
 *     new row violates row-level security policy for table "form_responses"
 *
 * The row was never the problem — reading it back was. So the id is decided
 * here and sent with the insert, and nothing needs returning. It gives away
 * nothing: without a SELECT policy the id can't be used to read anything.
 */
export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();

  // Older Safari. getRandomValues has been around far longer than randomUUID.
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;   // version 4
    b[8] = (b[8] & 0x3f) | 0x80;   // variant 10x
    const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Last resort. Not cryptographically random, but a duplicate would only
  // collide with another submission made in the same millisecond.
  const rnd = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${rnd()}${rnd()}-${rnd()}-4${rnd().slice(1)}-a${rnd().slice(1)}-${rnd()}${rnd()}${rnd()}`;
}
