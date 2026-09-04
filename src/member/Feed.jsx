import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pin, Trash2, X, History, EyeOff, MessageSquare } from "lucide-react";
import { supabase } from "../lib/supabase";
import Rsvp from "./Rsvp";
import GroupMeCard from "./GroupMeCard";
import { useAuth } from "../lib/useAuth";
import { T, card, Btn, Input, Area, Select, Chip, Empty } from "../components/ui";
import { fmtShort, timeAgo, toIso } from "../lib/domain/dates";
import ThisWeeksLesson from "./ThisWeeksLesson";
import Upcoming from "./Upcoming";
import { FlyerHeader, FlyerPicker } from "../components/Flyer";
import { categoryMeta, isPast, sortForFeed, splitByPast, STALE_DAYS } from "./categories";
import { upcomingFrom } from "../lib/domain/upcomingAction";
import SignUpList from "./SignUpList";
import PostLinks from "./PostLinks";


/**
 * The space between the hubs at the top of the feed — lesson, GroupMe,
 * Upcoming — and between the last of them and Recent Activity.
 *
 * One number for all of it. The cards are three separate files and when each
 * carried its own bottom margin they drifted apart (14, then none, then 12),
 * which is how the GroupMe card came to sit flush against Upcoming.
 */
const HUB_GAP = 18;

const emptyDraft = {
  category: "announcement", title: "", body: "", link_url: "", link_label: "",
  event_date: "", event_time: "", event_location: "", pinned: false,
  allow_signup: false,
};

export default function Feed({ focus, onFocusHandled }) {
  const { isPresidency, presidency } = useAuth();
  const [posts, setPosts] = useState([]);
  // Set when a Home Hub card sent you to a specific post.
  const [focusId, setFocusId] = useState(null);
  const [comments, setComments] = useState([]);
  const [slots, setSlots] = useState([]);
  const [claims, setClaims] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState(null);
  const [openComments, setOpenComments] = useState({});
  const [name, setName] = useState(() => localStorage.getItem("eq_member_name") || "");
  // Deliberately not remembered between visits. Opening the app should always
  // show what's current; looking back is a thing you choose to do, not a state
  // you can get stuck in without noticing.
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(async () => {
    const [p, c, sl, cl, lk] = await Promise.all([
      // Ordered in JS rather than SQL: "soonest first, but undated posts still
      // near the top" isn't a single ORDER BY.
      supabase.from("posts").select("*"),
      supabase.from("comments").select("*").order("created_at", { ascending: true }),
      supabase.from("signup_slots").select("*").order("sort_order", { ascending: true }),
      supabase.from("signup_claims").select("*").order("created_at", { ascending: true }),
      supabase.from("post_links").select("*").order("sort_order", { ascending: true }),
    ]);
    if (p.error) setErr(p.error.message);
    else setPosts(p.data || []);
    if (!c.error) setComments(c.data || []);
    if (!sl.error) setSlots(sl.data || []);
    if (!cl.error) setClaims(cl.data || []);
    if (!lk.error) setLinks(lk.data || []);
    setLoading(false);
  }, []);

  // Jump to the post the Home Hub pointed at, once it's actually rendered.
  useEffect(() => {
    const id = focus?.postId;
    if (!id || loading) return;
    const target = posts.find((p) => p.id === id);
    if (!target) { onFocusHandled?.(); return; }
    // A link from the weekly email can point at something that has since gone
    // past. Scrolling to a post that isn't rendered lands nowhere and looks
    // like a broken link, so a deep link opens the past for itself.
    if (isPast(target, toIso(new Date()), Date.now())) setShowPast(true);
    setFocusId(id);
    const t = setTimeout(() => {
      document.getElementById(`post-${id}`)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    }, 60);
    const clear = setTimeout(() => setFocusId(null), 2600);
    onFocusHandled?.();
    return () => { clearTimeout(t); clearTimeout(clear); };
  }, [focus, loading, posts, onFocusHandled]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("eq-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "signup_slots" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "signup_claims" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_links" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  // Split before sorting, so the count on the toggle is the number of posts it
  // would actually reveal.
  //
  // There used to be a category filter here, driven by the tiles above. The
  // tiles went when Upcoming started separating the dated things out on its
  // own — there was nothing left for a filter to reveal — and the state went
  // with them rather than being left behind with no way to set it.
  const { visible, pastCount } = useMemo(() => {
    const today = toIso(new Date());
    const { current, past } = splitByPast(posts, today, Date.now());
    return {
      visible: sortForFeed(showPast ? posts : current, today, Date.now()),
      pastCount: past.length,
    };
  }, [posts, showPast]);

  // Everything dated and still ahead, soonest first — regardless of which
  // category it's filed under — Upcoming is the calendar, and a calendar that
  // shows only one kind of thing isn't one.
  const upcoming = useMemo(
    () => upcomingFrom(posts, toIso(new Date())),
    [posts]
  );

  const commentsFor = (id) => comments.filter((c) => c.post_id === id);

  const publish = async () => {
    if (!draft.title.trim()) return;
    const payload = {
      category: draft.category,
      title: draft.title.trim(),
      body: draft.body.trim() || null,
      link_url: draft.link_url.trim() || null,
      link_label: draft.link_label.trim() || null,
      event_date: draft.event_date || null,
      event_time: draft.event_time.trim() || null,
      event_location: draft.event_location.trim() || null,
      pinned: draft.pinned,
      allow_signup: !!draft.allow_signup,
      created_by: presidency?.name || "Presidency",
    };
    const { error } = await supabase.from("posts").insert(payload);
    if (error) setErr(error.message);
    else { setDraft(null); load(); }
  };

  const addComment = async (postId, body) => {
    if (!name.trim() || !body.trim()) return;
    localStorage.setItem("eq_member_name", name.trim());
    const { error } = await supabase
      .from("comments")
      .insert({ post_id: postId, author_name: name.trim(), body: body.trim() });
    if (error) setErr(error.message);
    else load();
  };

  return (
    <div>
      {/* The three hubs, in the order somebody opening the app wants them:
          what's on this Sunday, what's coming up and what to do about it,
          then everything people have been saying.

          The gap between them lives here rather than as a marginBottom on each
          card, and that's the whole point: it used to be spread across three
          files, drifted to 14 / 0 / 12, and the GroupMe card ended up flush
          against Upcoming because the rule that had been spacing it was
          deleted with the old two-column top block. One number, one place.

          A flex gap also handles the card that isn't there. GroupMeCard
          returns null until a link is set, and a gap only appears between
          elements that exist — a marginBottom would have left a hole.

          The category tiles used to sit here. They were a filter over a feed
          that now separates the dated things out on its own, so there was
          nothing left for them to reveal. */}
      <div style={{
        display: "flex", flexDirection: "column", gap: HUB_GAP, marginBottom: HUB_GAP,
      }}>
        <ThisWeeksLesson />

        <GroupMeCard />

        <Upcoming
          posts={upcoming}
          name={name}
          setName={setName}
          onOpen={(id) => setFocusId(id)}
        />
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
      }}>
        <MessageSquare size={15} style={{ color: T.sub, flex: "0 0 auto" }} />
        <span style={{
          fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em",
          textTransform: "uppercase", color: T.sub,
        }}>
          Recent Activity
        </span>
      </div>

      {(pastCount > 0 || showPast) && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap",
        }}>
          {/* Nothing is deleted — it's still all here, one tap away. The count
              is on the button so the choice is informed: "12 earlier" is worth
              a look, "1 earlier" usually isn't. Only shown when there is
              something to reveal, or something already revealed to put back. */}
          {(pastCount > 0 || showPast) && (
            <Btn
              size="sm"
              kind={showPast ? "soft" : "plain"}
              style={{ marginLeft: "auto" }}
              aria-pressed={showPast}
              onClick={() => setShowPast((v) => !v)}
            >
              {showPast ? <EyeOff size={14} /> : <History size={14} />}
              {showPast ? "Hide earlier" : `Show ${pastCount} earlier`}
              {showPast && (
                <span style={{ fontWeight: 500, color: T.faint, marginLeft: 4 }}>
                  {`· past dates and notices over ${STALE_DAYS} days old`}
                </span>
              )}
            </Btn>
          )}
        </div>
      )}

      {err && (
        <div style={{ ...card, background: T.redSoft, borderColor: T.red, color: T.red, marginBottom: 12, fontSize: 14.5 }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ color: T.sub, fontSize: 15, padding: 30, textAlign: "center" }}>Loading…</div>
      ) : !visible.length ? (
        <Empty
          // An empty feed with a dozen past posts behind it isn't empty, and
          // "check back soon" over a full archive reads as a fault. The reason
          // it's empty decides what to say about it.
          title={pastCount > 0 ? "Nothing Current" : "Nothing Here Yet"}
          hint={
            pastCount > 0
              ? `Nothing recent right now — ${pastCount} earlier ${pastCount === 1 ? "post is" : "posts are"} behind the button above.`
              : isPresidency
                ? "Tap the + button to post the first announcement."
                : "Check back soon."
          }
        />
      ) : (
        <div className="eq-feed-grid">
          {visible.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              comments={commentsFor(post.id)}
              slots={slots}
              claims={claims}
              links={links}
              open={!!openComments[post.id]}
              onToggle={() => setOpenComments((o) => ({ ...o, [post.id]: !o[post.id] }))}
              name={name}
              setName={setName}
              onComment={addComment}
              isPresidency={isPresidency}
              onReload={load}
              highlight={focusId === post.id}
            />
          ))}
        </div>
      )}

      {isPresidency && (
        <button
          onClick={() => setDraft({ ...emptyDraft })}
          aria-label="New Post"
          style={{
            position: "fixed", right: 18, bottom: "calc(88px + env(safe-area-inset-bottom))",
            width: 54, height: 54, borderRadius: "50%", background: T.primary,
            color: "var(--on-primary)", border: "none", fontSize: 28, cursor: "pointer",
            boxShadow: "0 4px 16px rgba(10,30,60,.28)", zIndex: 40,
          }}
        >
          <Plus size={24} style={{ verticalAlign: "middle" }} />
        </button>
      )}


      {draft && (
        <Composer
          draft={draft}
          setDraft={setDraft}
          onPublish={publish}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  );
}

function PostCard({ post, comments, slots, claims, links, open, onToggle, name, setName, onComment, isPresidency, onReload, highlight }) {
  const m = categoryMeta(post.category);
  const [body, setBody] = useState("");

  const togglePin = async () => {
    await supabase.from("posts").update({ pinned: !post.pinned }).eq("id", post.id);
    onReload();
  };
  const remove = async () => {
    if (!confirm(`Delete "${post.title}"?`)) return;
    await supabase.from("posts").delete().eq("id", post.id);
    onReload();
  };

  return (
    <div
      id={`post-${post.id}`}
      style={{
        ...card, borderLeft: `5px solid ${m.accent}`, padding: 15,
        // Ring when the Home Hub sent you straight to this post.
        boxShadow: highlight ? `0 0 0 3px ${T.primarySoft}` : card.boxShadow,
        borderColor: highlight ? T.primary : card.borderColor,
        transition: "box-shadow 200ms ease",
      }}
    >
      {/* The flyer heads the post — above the category chip, so it reads as
          the poster it is rather than an attachment hung off the bottom. */}
      <FlyerHeader url={post.flyer_url} alt={post.title} rounded={10} />

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <Chip color={m.accent} bg={m.soft}>{m.label}</Chip>
        {post.pinned && <Chip color={T.sub} bg={T.inset}>Pinned</Chip>}
        <span style={{ marginLeft: "auto", fontSize: 13, color: T.faint }}>{timeAgo(post.created_at)}</span>
      </div>

      <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, marginBottom: 5 }}>{post.title}</div>
      {post.body && (
        <div style={{ fontSize: 15.5, lineHeight: 1.55, color: T.sub, whiteSpace: "pre-wrap", marginBottom: 9 }}>
          {post.body}
        </div>
      )}

      {(post.event_date || post.event_location) && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 9 }}>
          {post.event_date && (
            <Chip color={T.ink} bg={T.inset}>
              {fmtShort(post.event_date)}{post.event_time ? ` · ${post.event_time}` : ""}
            </Chip>
          )}
          {post.event_location && <Chip color={T.ink} bg={T.inset}>{post.event_location}</Chip>}
        </div>
      )}

      <PostLinks post={post} links={links} isPresidency={isPresidency} onReload={onReload} />

      <SignUpList
        post={post}
        slots={slots}
        claims={claims}
        name={name}
        setName={setName}
        isPresidency={isPresidency}
        onReload={onReload}
      />

      <div style={{ borderTop: `1px solid ${T.lineSoft}`, marginTop: 8, paddingTop: 9 }}>
        {post.rsvp && <Rsvp postId={post.id} name={name} setName={setName} />}

        <button
          onClick={onToggle}
          style={{ background: "none", border: "none", padding: 0, fontSize: 14, fontWeight: 600, color: T.sub, cursor: "pointer" }}
        >
          {comments.length ? `${comments.length} comment${comments.length === 1 ? "" : "s"}` : "Add a comment"}
        </button>

        {open && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            {comments.map((c) => (
              <div key={c.id} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <div style={{
                  flex: "0 0 auto", width: 26, height: 26, borderRadius: "50%",
                  background: T.primarySoft, color: T.primaryDeep, fontSize: 13, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {c.author_name.trim().charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{c.author_name}</span>
                    <span style={{ fontSize: 12.5, color: T.faint }}>{timeAgo(c.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 15, color: T.sub, lineHeight: 1.45 }}>{c.body}</div>
                </div>
              </div>
            ))}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Input value={name} onChange={setName} placeholder="Your name" style={{ fontSize: 14.5 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <Input value={body} onChange={setBody} placeholder="Write a comment…" style={{ fontSize: 14.5 }} />
                <Btn
                  kind="primary" disabled={!name.trim() || !body.trim()}
                  onClick={() => { onComment(post.id, body); setBody(""); }}
                >
                  Post
                </Btn>
              </div>
            </div>
          </div>
        )}
      </div>

      {isPresidency && (
        <div style={{
          display: "flex", gap: 8, marginTop: 11, paddingTop: 11,
          borderTop: `1px solid ${T.lineSoft}`, alignItems: "center", flexWrap: "wrap",
        }}>
          <Btn size="sm" kind="plain" onClick={togglePin}><Pin size={14} />{post.pinned ? "Unpin" : "Pin"}</Btn>
          {/* A post written straight into the feed has no row until it's saved,
              so the flyer gets attached here rather than in the composer. */}
          <FlyerPicker row={post} table="posts" onSaved={onReload} compact />
          <Btn size="sm" kind="plain" onClick={remove}><Trash2 size={14} /></Btn>
        </div>
      )}
    </div>
  );
}

function Composer({ draft, setDraft, onPublish, onClose }) {
  const set = (k) => (v) => setDraft({ ...draft, [k]: v });
  const isEvent = draft.category === "activity" || draft.category === "temple";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(10,12,16,.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.bg, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto",
          borderRadius: "18px 18px 0 0", padding: 18, display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 19.5, fontWeight: 700, color: T.ink }}>New Post</div>
          <Btn kind="plain" size="sm" onClick={onClose}><X size={18} /></Btn>
        </div>

        <Lbl label="Category">
          <Select value={draft.category} onChange={set("category")}>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </Select>
        </Lbl>

        <Lbl label="Title">
          <Input value={draft.title} onChange={set("title")} placeholder="Quorum BBQ" />
        </Lbl>

        <Lbl label="Details">
          <Area value={draft.body} onChange={set("body")} placeholder="Anything members should know…" />
        </Lbl>

        {isEvent && (
          <div style={{ display: "flex", gap: 10 }}>
            <Lbl label="Date">
              <Input type="date" value={draft.event_date} onChange={set("event_date")} />
            </Lbl>
            {isEvent && (
              <Lbl label="Time">
                <Input value={draft.event_time} onChange={set("event_time")} placeholder="6:00 PM" />
              </Lbl>
            )}
          </div>
        )}

        {isEvent && (
          <Lbl label="Location">
            <Input value={draft.event_location} onChange={set("event_location")} placeholder="Ryan's backyard" />
          </Lbl>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <Lbl label="Link URL">
            <Input value={draft.link_url} onChange={set("link_url")} placeholder="https://…" />
          </Lbl>
          <Lbl label="Link text">
            <Input value={draft.link_label} onChange={set("link_label")} placeholder="Sign up" />
          </Lbl>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color: T.ink }}>
          <input type="checkbox" checked={draft.pinned} onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })} />
          Pin to top of feed
        </label>

        {/* Opt-in. This used to appear on every post that didn't already have
            one, which put a call to action on notices that only needed
            reading. */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color: T.ink }}>
          <input type="checkbox" checked={!!draft.allow_signup}
            onChange={(e) => setDraft({ ...draft, allow_signup: e.target.checked })} />
          Add a sign-up sheet
        </label>

        <Btn kind="primary" size="lg" onClick={onPublish} disabled={!draft.title.trim()} style={{ justifyContent: "center" }}>
          Post to feed
        </Btn>
      </div>
    </div>
  );
}

function Lbl({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: T.sub }}>
        {label}
      </span>
      {children}
    </label>
  );
}

// Group chat is the next build. The tile is here so the home screen is
// complete; this explains rather than doing nothing when tapped.
function GroupsSheet({ onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(10,12,16,.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.bg, width: "100%", maxWidth: 520, borderRadius: "18px 18px 0 0",
          padding: 20, display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        <div style={{ fontSize: 19.5, fontWeight: 800, color: T.ink }}>Groups</div>
        <div style={{ fontSize: 15, color: T.sub, lineHeight: 1.6 }}>
          Group chat is being built next — brotherhood groups with their own
          conversation inside the app.
        </div>
        <Btn kind="primary" size="lg" onClick={onClose} style={{ justifyContent: "center" }}>
          Got it
        </Btn>
      </div>
    </div>
  );
}
