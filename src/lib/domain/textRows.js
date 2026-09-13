/**
 * How tall a text box has to be to show what's in it.
 *
 * "I need to see the full text box so i can read the announcement."
 *
 * Announcements were edited in a single-line input. Anything longer than the
 * box scrolled sideways inside a field about forty characters wide, so the
 * only way to read one was to click into it and arrow along — on the screen
 * the presidency uses to check what's going out to the whole quorum.
 *
 * A textarea fixes the reading, but a fixed `rows` just moves the problem: too
 * few and long notices still hide, too many and four short announcements push
 * the rest of the agenda off the screen. So the box is sized to its content.
 *
 * Estimated here rather than measured, for the same reason the printed agenda
 * estimates: this has to be right before anything is laid out, and it has to
 * be checkable without a browser. The component measures scrollHeight
 * afterwards and takes over when there's a real layout engine to ask.
 */

/** Never smaller than this, so the box reads as somewhere text can grow. */
export const MIN_ROWS = 2;

/**
 * ...and never taller than this. One brother pasting three paragraphs into an
 * announcement shouldn't push the prayers, the lesson and everything else off
 * the screen — past a dozen lines the box scrolls, which is the right
 * behaviour for the outlier and the wrong one for everything else.
 */
export const MAX_ROWS = 12;

/**
 * Characters per line at the width these boxes get on a phone: the card's
 * content column, less the bullet and the buttons either side, at 16px.
 * Approximate on purpose — being a character or two out costs nothing here,
 * because a wrong guess is one row and the browser corrects it on layout.
 */
export const PER_LINE = 38;

/**
 * How many rows `text` needs.
 *
 * Wrapping is counted per hard line rather than over the whole string. Two
 * short lines separated by a newline take two rows, not one — dividing the
 * total length by the line width would say one, and the second line would be
 * the one that disappeared.
 */
export function rowsFor(text, perLine = PER_LINE) {
  const width = Math.max(8, Number(perLine) || PER_LINE);
  const rows = String(text ?? "")
    .split("\n")
    .reduce((n, line) => n + Math.max(1, Math.ceil(line.length / width)), 0);
  return Math.min(MAX_ROWS, Math.max(MIN_ROWS, rows));
}
