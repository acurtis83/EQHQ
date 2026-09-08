import { nextOccurrence } from "./repeat.js";

/**
 * What's still ahead of a given Sunday.
 *
 * Ahead of *that Sunday*, not of today: planning the 6th of September
 * shouldn't list basketball from the 27th of August.
 *
 * Three kinds of event have to come out in one list:
 *   - a single dated event, which is simply itself
 *   - a repeating one, which contributes its next date on or after the cutoff
 *   - one with explicit dates of its own (temple cleaning across the autumn),
 *     which uses the first of those still ahead
 *
 * The last case has a trap worth naming: if every explicit date is behind us
 * the series is finished, and falling back to the event row's own date — which
 * is whatever the first date ever was — would resurrect it months later. So an
 * event that has dates and has used them all drops out entirely.
 *
 * Pulled out of the Sunday agenda so the secretary's email builder derives the
 * same list rather than growing a second, subtly different copy.
 */
/**
 * Where the weekly email's list should start.
 *
 * "The weekly email 'coming up' should include the Service activities also. I
 *  dont see the Blood Drive or its link on the email."
 *
 * The blood drive wasn't dropped for being a Service event — nothing here
 * looks at the category. It was dropped for being on the Friday. The email is
 * written on Monday for the Sunday coming, so counting "ahead" from that
 * Sunday throws away everything happening in between: precisely the week's
 * most urgent items, and the only ones the email can still do anything about.
 *
 * So the email starts from whichever comes first, today or the Sunday:
 *   - writing Monday the 7th for Sunday the 13th → from the 7th, so Friday's
 *     blood drive and Saturday's day of service are in it
 *   - looking back at a Sunday that has passed → from that Sunday, so the
 *     list reads as it did when it went out rather than being rewritten by
 *     today's date
 *
 * The Sunday agenda deliberately does NOT use this. That list is read aloud on
 * the day, where Friday's blood drive is over and announcing it would be
 * worse than silence.
 */
export function emailWindowStart(todayIso, sundayIso) {
  const today = String(todayIso || "").slice(0, 10);
  const sunday = String(sundayIso || "").slice(0, 10);
  if (!today) return sunday;
  if (!sunday) return today;
  return today < sunday ? today : sunday;
}

/**
 * @param {string} [fromIso]  start the window here instead of at the Sunday.
 *   Only the email passes this; see emailWindowStart above.
 */
export function upcomingForSunday({ events, eventDates, sundayIso, limit = 6, fromIso }) {
  const cutoff = String(fromIso || sundayIso || "").slice(0, 10);
  const all = eventDates || [];

  return (events || [])
    .map((e) => {
      const own = all
        .filter((d) => d.event_id === e.id && !d.done && d.event_date >= cutoff)
        .sort((a, b) => a.event_date.localeCompare(b.event_date));
      const hasOwn = all.some((d) => d.event_id === e.id);
      if (own.length) {
        return {
          ...e,
          when: own[0].event_date,
          event_time: own[0].event_time || e.event_time,
          form_id: own[0].form_id || e.form_id,
          remaining: own.length,
        };
      }
      return { ...e, when: hasOwn ? null : nextOccurrence(e, cutoff) };
    })
    .filter((e) => e.when && !e.done)
    .sort((a, b) => a.when.localeCompare(b.when))
    .slice(0, limit);
}

/**
 * Everything still open, from today: what the presidency has on.
 *
 * "Activities is off too i think it should show 3"
 *
 * Presidency Home asked the database for events with
 * `event_date is null or event_date >= today`, and that quietly loses a whole
 * class of them. A repeating event's stored event_date is the FIRST date it
 * ever had — basketball every Thursday since August keeps the August date
 * forever — so a series that is very much still running drops out the moment
 * its first occurrence passes. Same for an event whose real dates live in
 * event_dates: the row's own date is the first of them.
 *
 * So the filtering has to happen here, where the repeat rule and the explicit
 * dates can both be consulted, rather than in a query that can only see one
 * column.
 *
 * An undated event counts as open: it's still being planned, which is exactly
 * the state the presidency needs to see.
 *
 * Each result carries `when` — the next date it actually happens, or null if
 * it hasn't got one yet — so callers can sort and display without redoing any
 * of this.
 */
export function openEvents({ events, eventDates, todayIso }) {
  const today = String(todayIso || "").slice(0, 10);
  const all = eventDates || [];

  return (events || [])
    .filter((e) => !e.done)
    .map((e) => {
      const own = all
        .filter((d) => d.event_id === e.id && !d.done && d.event_date >= today)
        .sort((a, b) => a.event_date.localeCompare(b.event_date));
      if (own.length) return { ...e, when: own[0].event_date, remaining: own.length };

      // Has explicit dates and has used them all: the series is finished.
      // Falling back to the row's own date would resurrect it months later.
      if (all.some((d) => d.event_id === e.id)) return null;

      if (!e.event_date) return { ...e, when: null };
      return { ...e, when: nextOccurrence(e, today) };
    })
    .filter(Boolean)
    // Undated ones survive; dated ones only if they still have a date to come.
    .filter((e) => e.when || !e.event_date);
}
