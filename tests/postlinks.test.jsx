import { describe, it, expect } from "vitest";
import { sameTarget, visibleLinks, duplicateLinks } from "../src/lib/domain/postLinks";

/**
 * One link per destination.
 *
 * "if you look at the stake blood drive on the FEED why is there 2 links? we
 *  only need one"
 *
 * A post has two sources of links: `link_url` on the post itself, set by the
 * planner or the composer, and extra rows in post_links added afterwards. The
 * blood drive had both pointing at the same sign-up page, because the extra
 * was added by hand during the stretch when the planner's link was being
 * shown as "Details" and looked like it wasn't the sign-up.
 */

const POST = {
  id: "p1",
  link_url: "https://redcrossblood.org/drive/8th",
  link_label: "Sign Up",
};

describe("two links to the same place", () => {
  it("shows one", () => {
    const links = [
      { id: "l1", post_id: "p1", url: "https://redcrossblood.org/drive/8th", label: "Sign Up Here" },
    ];
    const shown = visibleLinks(POST, links);
    expect(shown).toHaveLength(1);
    expect(shown[0].label).toBe("Sign Up");
  });

  it("and keeps the post's own one, not the copy", () => {
    // The post's own link is the one carrying the meaning: its label is what
    // decides between a Sign Up button and a details link, in the Upcoming row
    // and in the weekly email. Keeping the hand-added copy instead would
    // silently turn a sign-up back into a plain link.
    const links = [
      { id: "l1", post_id: "p1", url: "https://redcrossblood.org/drive/8th", label: "Sign Up Here" },
    ];
    expect(visibleLinks(POST, links)[0].primary).toBe(true);
  });

  it("tells the presidency what's being hidden and why", () => {
    const links = [
      { id: "l1", post_id: "p1", url: "https://redcrossblood.org/drive/8th", label: "Sign Up Here" },
    ];
    const hidden = duplicateLinks(POST, links);
    expect(hidden).toHaveLength(1);
    expect(hidden[0].duplicateOf).toBe("the post's own link");
  });
});

describe("but two links to different places", () => {
  it("both show", () => {
    const links = [
      { id: "l1", post_id: "p1", url: "https://example.org/flyer.pdf", label: "Flyer" },
    ];
    expect(visibleLinks(POST, links)).toHaveLength(2);
    expect(duplicateLinks(POST, links)).toHaveLength(0);
  });

  it("even when the query string is all that differs", () => {
    // Two of our own sign-up forms. /?f=abc and /?f=def are different sheets,
    // so "tidying" the query away would merge two real links into one.
    const post = { id: "p2", link_url: "https://eqhq.netlify.app/?f=abc", link_label: "Sign Up" };
    const links = [
      { id: "l1", post_id: "p2", url: "https://eqhq.netlify.app/?f=def", label: "Saturday sheet" },
    ];
    expect(visibleLinks(post, links)).toHaveLength(2);
  });

  it("and stake conference keeps a link per language", () => {
    const post = { id: "p3", link_url: "", link_label: "" };
    const links = [
      { id: "l1", post_id: "p3", url: "https://example.org/en", label: "Watch in English", sort_order: 0 },
      { id: "l2", post_id: "p3", url: "https://example.org/es", label: "Watch in Spanish", sort_order: 1 },
    ];
    expect(visibleLinks(post, links).map((l) => l.label))
      .toEqual(["Watch in English", "Watch in Spanish"]);
  });
});

describe("what counts as the same place", () => {
  it("ignores a trailing slash and the case of the host", () => {
    expect(sameTarget("https://Example.org/Drive/", "https://example.org/Drive")).toBe(true);
  });

  it("but not a different path", () => {
    // The path's case is left alone: plenty of servers treat /Drive and
    // /drive as different pages, and merging them would hide a real link.
    expect(sameTarget("https://example.org/drive", "https://example.org/Drive")).toBe(false);
  });

  it("or a different site", () => {
    expect(sameTarget("https://example.org/x", "https://example.com/x")).toBe(false);
  });

  it("and nothing matches an empty link", () => {
    expect(sameTarget("", "")).toBe(false);
    expect(sameTarget("", "https://example.org")).toBe(false);
  });
});

describe("the ordinary cases still work", () => {
  it("a post with only its own link", () => {
    expect(visibleLinks(POST, []).map((l) => l.label)).toEqual(["Sign Up"]);
  });

  it("a post with no links at all", () => {
    expect(visibleLinks({ id: "p9" }, [])).toEqual([]);
  });

  it("and links belonging to another post are left out", () => {
    const links = [{ id: "l9", post_id: "somewhere-else", url: "https://example.org/x", label: "X" }];
    expect(visibleLinks(POST, links)).toHaveLength(1);
  });

  it("labels a bare link Details when nobody named it", () => {
    expect(visibleLinks({ id: "p4", link_url: "https://example.org" }, [])[0].label)
      .toBe("Details");
  });

  it("and collapses two hand-added copies of each other", () => {
    const post = { id: "p5" };
    const links = [
      { id: "l1", post_id: "p5", url: "https://example.org/x", label: "One", sort_order: 0 },
      { id: "l2", post_id: "p5", url: "https://example.org/x/", label: "Two", sort_order: 1 },
    ];
    expect(visibleLinks(post, links)).toHaveLength(1);
    expect(duplicateLinks(post, links)[0].duplicateOf).toBe("another link");
  });
});
