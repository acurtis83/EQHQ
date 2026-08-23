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
export function upcomingForSunday({ events, eventDates, sundayIso, limit = 6 }) {
  const cutoff = sundayIso;
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
