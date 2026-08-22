import { useState } from "react";
import { Link2, Plus, Trash2, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, Btn, Input } from "../components/ui";

/**
 * The links on a post.
 *
 * One `link_url` isn't enough — stake conference has a streaming link per
 * language, a temple trip might carry directions and a schedule. The post's
 * own link still shows first so nothing that already exists disappears.
 */
export default function PostLinks({ post, links, isPresidency, onReload }) {
  const [editing, setEditing] = useState(false);

  const mine = (links || [])
    .filter((l) => l.post_id === post.id)
    .sort((a, b) => a.sort_order - b.sort_order);

  const hasOwn = !!post.link_url;
  if (!mine.length && !hasOwn && !isPresidency) return null;

  return (
    <>
      {(mine.length > 0 || hasOwn) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 9 }}>
          {hasOwn && (
            <LinkRow href={post.link_url} label={post.link_label || "Details"} primary />
          )}
          {mine.map((l) => <LinkRow key={l.id} href={l.url} label={l.label} />)}
        </div>
      )}

      {isPresidency && (
        <Btn size="sm" kind="plain" onClick={() => setEditing(true)}
          style={{ marginBottom: 9, paddingLeft: 0 }}>
          <Plus size={13} />Link
        </Btn>
      )}

      {editing && (
        <LinkEditor post={post} links={mine} onClose={() => setEditing(false)} onReload={onReload} />
      )}
    </>
  );
}

function LinkRow({ href, label, primary }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 14.5, fontWeight: 700, color: T.primaryDeep,
        textDecoration: "none", minWidth: 0,
      }}
    >
      <Link2 size={13} style={{ flex: "0 0 auto" }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      {primary ? " →" : ""}
    </a>
  );
}

function LinkEditor({ post, links, onClose, onReload }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const add = async () => {
    const u = url.trim();
    if (!u) return;
    setBusy(true); setErr("");
    // Someone pasting "eqhq.netlify.app/..." means a URL; without a scheme the
    // browser would treat it as a path on this site and 404.
    const href = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    const { error } = await supabase.from("post_links").insert({
      post_id: post.id,
      label: label.trim() || href.replace(/^https?:\/\//, "").split("/")[0],
      url: href,
      sort_order: links.length,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setLabel(""); setUrl("");
    onReload();
  };

  const remove = async (id) => {
    await supabase.from("post_links").delete().eq("id", id);
    onReload();
  };

  return (
    <div onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(10,12,16,.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60,
      }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          background: T.bg, width: "100%", maxWidth: 520, borderRadius: "18px 18px 0 0",
          padding: 18, display: "flex", flexDirection: "column", gap: 11,
          maxHeight: "88vh", overflowY: "auto",
        }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 18.5, fontWeight: 800, color: T.ink }}>Links</div>
          <Btn kind="plain" size="sm" onClick={onClose}><X size={18} /></Btn>
        </div>
        <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.5 }}>{post.title}</div>

        {links.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {links.map((l) => (
              <div key={l.id} data-post-link={l.id}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: T.panel, border: `1px solid ${T.lineSoft}`,
                  borderRadius: 10, padding: "8px 10px",
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink }}>{l.label}</div>
                  <div style={{ fontSize: 12.5, color: T.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.url}
                  </div>
                </div>
                <Btn size="sm" kind="plain" onClick={() => remove(l.id)}><Trash2 size={13} /></Btn>
              </div>
            ))}
          </div>
        )}

        <Lbl label="What is it?">
          <Input value={label} onChange={setLabel} placeholder="Watch in English" />
        </Lbl>
        <Lbl label="Link">
          <Input value={url} onChange={setUrl} placeholder="https://…" />
        </Lbl>

        {err && <div style={{ fontSize: 13.5, color: T.red }}>{err}</div>}

        <Btn kind="primary" size="lg" style={{ justifyContent: "center" }}
          onClick={add} disabled={busy || !url.trim()}>
          Add Link
        </Btn>
        <Btn kind="plain" onClick={onClose}>Done</Btn>
      </div>
    </div>
  );
}

function Lbl({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: T.sub }}>
        {label}
      </span>
      {children}
    </label>
  );
}
