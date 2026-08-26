import { useEffect, useState } from "react";
import { Check, MessageCircle } from "lucide-react";
import { T, card, Btn, Input, SectionTitle } from "../components/ui";
import QrCode from "../components/QrCode";
import { useSettings, SETTING_KEYS, safeUrl } from "../lib/useSettings";

/**
 * The quorum's own links — currently just the GroupMe.
 *
 * It lives in Settings rather than on the feed because it's set once and then
 * read for months. What members see is the card on the feed and the line in
 * the weekly email; both read this value, so there's one place to change it
 * when the group is rebuilt and the invite link changes.
 */
export default function QuorumSettings() {
  const { settings, save } = useSettings();
  const saved = settings[SETTING_KEYS.GROUPME_URL] || "";
  const [draft, setDraft] = useState(saved);
  const [state, setState] = useState("");
  const [err, setErr] = useState("");

  // The settings load after the first render, so the box has to catch up —
  // otherwise it sits empty over a link that's already set and the first
  // person to press Save wipes it.
  useEffect(() => { setDraft(saved); }, [saved]);

  const url = safeUrl(draft);
  const dirty = draft.trim() !== saved;

  const onSave = async () => {
    setErr("");
    if (draft.trim() && !url) {
      setErr("That doesn't look like a link — it should start with https://");
      return;
    }
    const problem = await save(SETTING_KEYS.GROUPME_URL, draft);
    if (problem) {
      setErr(/does not exist|schema cache/i.test(problem)
        ? "The database needs updating before this can be saved — run supabase/catch-up.sql."
        : problem);
      return;
    }
    setState("saved");
    setTimeout(() => setState(""), 1800);
  };

  return (
    <div style={{ ...card }}>
      <SectionTitle sub="Members see this on the feed and in the weekly email.">
        Quorum Links
      </SectionTitle>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{
          fontSize: 12.5, fontWeight: 700, color: T.sub,
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}>
          GroupMe invite link
        </span>
        <Input
          value={draft}
          onChange={setDraft}
          placeholder="https://groupme.com/join_group/..."
        />
      </label>

      <div style={{ fontSize: 13.5, color: T.faint, marginTop: 7, lineHeight: 1.5 }}>
        In GroupMe: open the group, Settings, then Share Group. Paste the invite
        link here.
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 11, flexWrap: "wrap" }}>
        <Btn kind="primary" onClick={onSave} disabled={!dirty}>
          {state === "saved" ? <Check size={14} /> : <MessageCircle size={14} />}
          {state === "saved" ? "Saved" : "Save"}
        </Btn>
        {saved && !dirty && (
          <span style={{ fontSize: 13.5, color: T.sub }}>Live on the feed.</span>
        )}
      </div>

      {err && (
        <div style={{ fontSize: 13.5, color: T.red, marginTop: 9, lineHeight: 1.5 }}>{err}</div>
      )}

      {url && (
        <div style={{ marginTop: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <QrCode value={url} size={150} label="Join the EQ GroupMe" />
          <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.55, flex: 1, minWidth: 180 }}>
            Hold this up for someone to scan, or tap it to open the group.
            It's the same code members see on the feed.
          </div>
        </div>
      )}
    </div>
  );
}
