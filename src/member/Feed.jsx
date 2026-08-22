import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pin, Trash2, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import Rsvp from "./Rsvp";
import { useAuth } from "../lib/useAuth";
import { T, card, Btn, Input, Area, Select, Chip, Empty } from "../components/ui";
import { fmtShort, timeAgo, toIso } from "../lib/domain/dates";
import ThisWeeksLesson from "./ThisWeeksLesson";
import HomeTiles from "./HomeTiles";
import { CATEGORIES, categoryMeta, sortForFeed } from "./categories";
import SignUpList from "./SignUpList";


const emptyDraft = {
  category: "announcement", title: "", body: "", link_url: "", link_label: "",
  event_date: "", event_time: "", event_location: "", pinned: false,
};

export default function Feed({ focus, onFocusHandled }) {
  const { isPresidency, presidency } = useAuth();
  const [posts, setPosts] = useState([]);
  // Set when a Home Hub card sent you to a specific post.
  const [focusId, setFocusId] = useState(null);
  const [comments, setComments] = useState([]);
  const [slots, setSlots] = useState([]);
  const [claims, setClaims] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState(null);
  const [openComments, setOpenComments] = useState({});
  const [name, setName] = useState(() => localStorage.getItem("eq_member_name") || "");

  const counts = useMemo(() => {
    const out = {};
    for (const c of CATEGORIES) out[c.key] = 0;
    for (const p of posts) if (out[p.category] != null) out[p.category] += 1;
    return out;
  }, [posts]);

  const load = useCallback(async () => {
    const [p, c, sl, cl] = await Promise.all([
      // Ordered in JS rather than SQL: "soonest first, but undated posts still
      // near the top" isn't a single ORDER BY.
      supabase.from("posts").select("*"),
      supabase.from("comments").select("*").order("created_at", { ascending: true }),
      supabase.from("signup_slots").select("*").order("sort_order", { ascending: true }),
      supabase.from("signup_claims").select("*").order("created_at", { ascending: true }),
    ]);
    if (p.error) setErr(p.error.message);
    else setPosts(p.data || []);
    if (!c.error) setComments(c.data || []);
    if (!sl.error) setSlots(sl.data || []);
    if (!cl.error) setClaims(cl.data || []);
    setLoading(false);
  }, []);

  // Jump to the post the Home Hub pointed at, once it's actually rendered.
  useEffect(() => {
    const id = focus?.postId;
    if (!id || loading) return;
    if (!posts.some((p) => p.id === id)) { onFocusHandled?.(); return; }
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
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const visible = useMemo(() => {
    const today = toIso(new Date());
    const list = filter === "all" ? posts : posts.filter((p) => p.category === filter);
    return sortForFeed(list, today);
  }, [posts, filter]);

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
      {/* Always first, driven by the teaching schedule — no weekly posting needed. */}
      <ThisWeeksLesson />

      <HomeTiles counts={counts} active={filter} onPick={setFilter} />

      {filter !== "all" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: T.ink }}>
            {categoryMeta(filter).label}
          </span>
          <Btn size="sm" kind="plain" onClick={() => setFilter("all")}>Show all</Btn>
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
          title="Nothing Here Yet"
          hint={isPresidency ? "Tap the + button to post the first announcement." : "Check back soon."}
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

function PostCard({ post, comments, slots, claims, open, onToggle, name, setName, onComment, isPresidency, onReload, highlight }) {
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
        height: "100%", display: "flex", flexDirection: "column",
        // Ring when the Home Hub sent you straight to this post.
        boxShadow: highlight ? `0 0 0 3px ${T.primarySoft}` : card.boxShadow,
        borderColor: highlight ? T.primary : card.borderColor,
        transition: "box-shadow 200ms ease",
      }}
    >
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

      {post.link_url && (
        <a
          href={post.link_url} target="_blank" rel="noreferrer"
          style={{ display: "inline-block", fontSize: 15, fontWeight: 700, color: T.primaryDeep, textDecoration: "none", marginBottom: 9 }}
        >
          {post.link_label || "Open link"} →
        </a>
      )}

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
        <div style={{ display: "flex", gap: 8, marginTop: 11, paddingTop: 11, borderTop: `1px solid ${T.lineSoft}` }}>
          <Btn size="sm" kind="plain" onClick={togglePin}><Pin size={14} />{post.pinned ? "Unpin" : "Pin"}</Btn>
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
