import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, Btn, Input } from "./ui";

// One storage bucket for everything the presidency attaches. Named for agendas
// because that's what needed it first; the Planner shares it rather than
// asking you to create a second bucket in Supabase.
export const BUCKET = "agenda-files";

/**
 * Attach a web link and/or a file to a row.
 *
 * Used by both the Agenda and the Planner, which are different tables with the
 * same three columns — so the table name is a prop rather than being baked in.
 *
 * @param {object}   item     the row; needs id, text, link_url, attachment_url
 * @param {string}   table    "agenda_items" or "running_items"
 * @param {string}   folder   storage path prefix, keeps uploads grouped
 */
export default function AttachSheet({ item, table, folder, onClose, onSaved }) {
  const [link, setLink] = useState(item.link_url || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setErr("");
    const path = `${folder || table}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
    if (up.error) {
      setErr(
        up.error.message.includes("Bucket not found")
          ? `No storage bucket named "${BUCKET}". Create it in Supabase → Storage, marked public.`
          : up.error.message
      );
      setBusy(false);
      return;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const { error } = await supabase.from(table)
      .update({ attachment_url: data.publicUrl, attachment_name: file.name })
      .eq("id", item.id);
    setBusy(false);
    if (error) setErr(error.message);
    else onSaved();
  };

  const saveLink = async () => {
    setBusy(true);
    const { error } = await supabase.from(table)
      .update({ link_url: link.trim() || null }).eq("id", item.id);
    setBusy(false);
    if (error) setErr(error.message);
    else onSaved();
  };

  const clearFile = async () => {
    await supabase.from(table)
      .update({ attachment_url: null, attachment_name: null }).eq("id", item.id);
    onSaved();
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
          padding: 18, display: "flex", flexDirection: "column", gap: 12,
        }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 18.5, fontWeight: 800, color: T.ink }}>Link Or File</div>
          <Btn kind="plain" size="sm" onClick={onClose}><X size={18} /></Btn>
        </div>
        <div style={{ fontSize: 14.5, color: T.sub, lineHeight: 1.5 }}>{item.text}</div>

        {err && (
          <div style={{
            background: T.redSoft, border: `1px solid ${T.red}`, color: T.red,
            borderRadius: 10, padding: "9px 12px", fontSize: 14, lineHeight: 1.5,
          }}>
            {err}
          </div>
        )}

        <Lbl label="Link">
          <Input value={link} onChange={setLink} placeholder="https://…" />
        </Lbl>
        <Btn kind="soft" onClick={saveLink} disabled={busy}>Save Link</Btn>

        <div style={{ borderTop: `1px solid ${T.lineSoft}`, paddingTop: 12 }}>
          <Lbl label="File">
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt"
              onChange={(e) => upload(e.target.files?.[0])}
              style={{ fontSize: 14.5, color: T.sub }}
            />
          </Lbl>
          {item.attachment_url && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9 }}>
              <a href={item.attachment_url} target="_blank" rel="noreferrer"
                style={{ fontSize: 14, fontWeight: 700, color: T.primaryDeep, textDecoration: "none", flex: 1, minWidth: 0 }}>
                {item.attachment_name || "Attachment"}
              </a>
              <Btn size="sm" kind="plain" onClick={clearFile}><Trash2 size={14} /></Btn>
            </div>
          )}
        </div>

        {busy && <div style={{ fontSize: 14, color: T.sub }}>Working…</div>}
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
