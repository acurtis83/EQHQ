import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * The schema and its migrations, kept in step.
 *
 * A view is defined twice in this repo on purpose: once in schema.sql, which
 * builds a project from nothing, and once in the migration that changed it,
 * which is what an existing project runs. Both have to end up at the same
 * shape or a fresh install and a migrated one quietly differ — and the
 * difference only shows up as a missing field on somebody's phone.
 *
 * This is also the check that would have caught the error Drew hit:
 *
 *   ERROR: cannot change name of view column "talk_title" to "topic"
 *
 * `create or replace view` matches the existing columns BY POSITION and can
 * only add to the end, so inserting a column in the middle reads as renaming
 * whatever was already there. A migration that changes column order has to
 * drop the view first — and if it does, schema.sql has to be brought to the
 * same order, which is what these assertions hold.
 */

// A plain path, not import.meta.url: under jsdom that isn't a file URL and
// readFileSync throws at import time, which vitest reports as "no tests".
const read = (f) => readFileSync(`${process.cwd()}/supabase/${f}`, "utf8");

/**
 * The column list of `create view <name> ... as select <cols> from`.
 *
 * Deliberately crude — a real parser isn't the point. What matters is the
 * order and the names, and both survive this.
 */
function viewColumns(sql, name) {
  const re = new RegExp(
    `create\\s+(or\\s+replace\\s+)?view\\s+${name}\\b[\\s\\S]*?\\bas\\s+select\\b([\\s\\S]*?)\\bfrom\\b`,
    "i"
  );
  const m = re.exec(sql);
  if (!m) return null;
  return m[2]
    .split(",")
    .map((c) => c.replace(/--.*$/gm, "").trim())
    .filter(Boolean)
    // "case when ... end as respondent_name" — the name is what's exposed.
    .map((c) => {
      const alias = /\bas\s+([a-z_][a-z0-9_]*)\s*$/i.exec(c);
      return alias ? alias[1] : c;
    });
}

const SCHEMA = read("schema.sql");
const PRIMER = read("lesson-primer.sql");

describe("public_lessons", () => {
  it("is defined the same way in the schema and in the migration", () => {
    const fresh = viewColumns(SCHEMA, "public_lessons");
    const migrated = viewColumns(PRIMER, "public_lessons");
    expect(fresh, "no public_lessons in schema.sql").toBeTruthy();
    expect(migrated, "no public_lessons in lesson-primer.sql").toBeTruthy();
    expect(migrated, "a fresh project and a migrated one would differ").toEqual(fresh);
  });

  it("sends everything the member card reads", () => {
    // ThisWeeksLesson falls back to the topic as its headline when no talk has
    // been chosen. The view didn't send `topic` for months, so a week set up
    // with a teacher and a subject showed the bare word "Lesson" on every
    // member's phone — less than the weekly email said about the same week.
    const cols = viewColumns(SCHEMA, "public_lessons");
    for (const need of [
      "date", "teacher_name", "topic", "talk_title", "speaker", "talk_link",
      "primer_idea", "primer_takeaways", "primer_scripture", "primer_question",
    ]) {
      expect(cols, `public_lessons doesn't send ${need}`).toContain(need);
    }
  });

  it("and still doesn't send the presidency's private notes", () => {
    // The whole reason this is a view rather than a policy: RLS is row-level,
    // so a select policy on teaching_assignments would publish every column of
    // every row. The column list is the security boundary.
    expect(viewColumns(SCHEMA, "public_lessons")).not.toContain("notes");
    expect(viewColumns(PRIMER, "public_lessons")).not.toContain("notes");
    expect(viewColumns(SCHEMA, "public_lessons")).not.toContain("teacher_id");
  });

  it("is dropped before it's rebuilt, because the column order changed", () => {
    // Without the drop this migration fails outright: a replace can only
    // append, and `topic` goes in the middle.
    expect(PRIMER).toMatch(/drop\s+view\s+if\s+exists\s+public_lessons\s*;/i);
    // Dropping takes the grant with it, so it has to be given back.
    expect(PRIMER).toMatch(/grant\s+select\s+on\s+public_lessons/i);
  });
});

describe("the primer columns", () => {
  it("are added by the migration and present in a fresh schema", () => {
    for (const col of [
      "primer_idea", "primer_takeaways", "primer_scripture", "primer_question",
    ]) {
      expect(PRIMER, `${col} isn't added by the migration`)
        .toMatch(new RegExp(`add column if not exists\\s+${col}\\b`, "i"));
      expect(SCHEMA, `${col} is missing from teaching_assignments`)
        .toMatch(new RegExp(`\\b${col}\\s+text`, "i"));
    }
  });

  it("and the migration is safe to run twice", () => {
    // Every statement in it either guards itself or is a replace.
    const statements = PRIMER
      .replace(/--.*$/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const s of statements) {
      const safe =
        /add column if not exists/i.test(s) ||
        /drop view if exists/i.test(s) ||
        /^create view/i.test(s) ||          // preceded by the drop above
        /^grant\b/i.test(s) ||
        /^revoke\b/i.test(s) ||
        /^notify\b/i.test(s);
      expect(safe, `not safe to re-run: ${s.slice(0, 60)}…`).toBe(true);
    }
  });
});
