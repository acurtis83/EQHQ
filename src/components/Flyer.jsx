import { useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, Btn } from "./ui";
import { BUCKET, storageError } from "./AttachSheet";

// Flyers go in the bucket that already exists, under their own prefix, rather
// than asking for a second bucket to be created in Supabase.
const FOLDER = "flyers";

// Phone cameras produce enormous files and this sits at the top of the feed on
// mobile data. Bishop's flyer is a poster export, comfortably under this.
const MAX_MB = 6;

/**
 * The flyer across the top of a form, an event, or a feed post.
 *
 * Kept unconstrained in height on purpose. A poster like the Summer Soiree one
 * is portrait and taller than it is wide; cropping it to a banner strip would
 * cut off the date and the highlights, which is most of what it says.
 */
export function FlyerHeader({ url, alt, rounded = 14 }) {
  if (!url) return null;
  return (
    <div
      style={{
        marginBottom: 11,
        borderRadius: rounded,
        overflow: "hidden",
        background: T.inset,
        lineHeight: 0,
      }}
    >
      <img
        src={url}
        alt={alt || "Flyer"}
        loading="lazy"
        style={{ width: "100%", height: "auto", display: "block" }}
      />
    </div>
  );
}

/**
 * Upload, replace, or remove a flyer on a row.
 *
 * The table is a prop because forms, events and posts all have a flyer_url and
 * none of them should need its own copy of this.
 */
export function FlyerPicker({ row, table, onSaved, save: saveOverride, label = "Flyer", compact }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const url = row?.flyer_url || "";

  // Some callers already own a save path that keeps their own state in step
  // (the form builder's patchForm). Writing here as well would update the same
  // row twice for one upload, so they hand theirs over instead.
  const save = async (value) => {
    if (saveOverride) { await saveOverride(value); return true; }
    const { error } = await supabase.from(table)
      .update({ flyer_url: value }).eq("id", row.id);
    if (error) { setErr(error.message); return false; }
    onSaved?.(value);
    return true;
  };

  const upload = async (file) => {
    if (!file) return;
    setErr("");

    if (!file.type.startsWith("image/")) {
      setErr("That's not an image. A PDF flyer needs to be exported as a JPG or PNG first.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setErr(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — keep it under ${MAX_MB}MB.`);
      return;
    }

    setBusy(true);
    const path = `${FOLDER}/${table}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
    if (up.error) {
      setErr(storageError(up.error.message));
      setBusy(false);
      return;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    await save(data.publicUrl);
    setBusy(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 6 : 8, minWidth: 0 }}>
      {!compact && (
        <span style={{ fontSize: 13, fontWeight: 700, color: T.sub, letterSpacing: "0.03em" }}>
          {label}
        </span>
      )}

      {/* On a feed card the flyer is already across the top, so repeating it
          inside the control would show the same poster twice. */}
      {url && !compact && (
        <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${T.lineSoft}`, lineHeight: 0 }}>
          <img src={url} alt="Flyer" style={{ width: "100%", height: "auto", display: "block" }} />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: T.inset, border: `1px solid ${T.lineSoft}`, borderRadius: 10,
            padding: compact ? "6px 10px" : "8px 12px", fontSize: compact ? 14 : 14.5, fontWeight: 600,
            color: T.ink, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
          }}
        >
          <ImagePlus size={15} />
          {busy ? "Uploading…" : url ? "Replace" : "Add a flyer"}
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            style={{ display: "none" }}
            onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }}
          />
        </label>

        {url && (
          <Btn size="sm" kind="plain" disabled={busy} onClick={() => save(null)}>
            <Trash2 size={14} />Remove
          </Btn>
        )}
      </div>

      {err && <div style={{ fontSize: 13.5, color: T.red, lineHeight: 1.5 }}>{err}</div>}

      {!url && !err && !compact && (
        <div style={{ fontSize: 13, color: T.faint, lineHeight: 1.5 }}>
          Sits across the top wherever this appears. JPG or PNG, under {MAX_MB}MB.
        </div>
      )}
    </div>
  );
}
