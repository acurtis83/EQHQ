import { useState } from "react";
import { ChevronDown, ChevronUp, MessageCircle } from "lucide-react";
import { T, card, Btn } from "../components/ui";
import QrCode from "../components/QrCode";
import { useSettings, SETTING_KEYS, safeUrl } from "../lib/useSettings";

/**
 * Join the quorum's GroupMe.
 *
 * Sits between the lesson banner and Upcoming at the top of the feed, rather
 * than among the posts: it's not news, it's a standing invitation, and as a
 * post it would scroll away behind three weeks of announcements exactly when
 * a new brother goes looking for it.
 *
 * No bottom margin of its own — the feed spaces the hubs with a single flex
 * gap (HUB_GAP in Feed.jsx), and a margin here would sit on top of it. This
 * card had none back when a two-column top block supplied the gap; that block
 * was deleted with the tiles and nothing replaced it, so the card spent a
 * while flush against Upcoming. The gap is one number in one file now.
 *
 * Returning null rather than an empty div matters to that gap: a flex gap
 * only appears between elements that exist, so a ward with no GroupMe link
 * gets no card and no hole where one would have been.
 *
 * Compact by default — the code is a tap away rather than taking a third of
 * the screen every time anybody opens the feed. Shows nothing at all until
 * the presidency has set a link, so a ward that doesn't use GroupMe never
 * sees a card about it.
 */
export default function GroupMeCard() {
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const url = safeUrl(settings[SETTING_KEYS.GROUPME_URL]);
  if (!url) return null;

  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <div style={{ ...card, padding: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <MessageCircle size={17} style={{ flex: "0 0 auto", color: T.sub }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: T.ink }}>
            EQ GroupMe
          </div>
          <div style={{ fontSize: 13.5, color: T.sub, marginTop: 1 }}>
            Day-to-day chat for the quorum.
          </div>
        </div>

        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          style={{
            flex: "0 0 auto", textDecoration: "none",
            background: T.primary, color: "var(--on-primary)",
            border: `1px solid ${T.primary}`, borderRadius: 10,
            padding: "7px 13px", fontSize: 14.5, fontWeight: 700,
          }}
        >
          Join
        </a>
        <Btn
          size="sm"
          kind="plain"
          aria-label={open ? "Hide the QR code" : "Show the QR code"}
          onClick={() => setOpen((o) => !o)}
        >
          <Chevron size={15} />QR
        </Btn>
      </div>

      {open && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
          <QrCode value={url} size={190} label="Join the EQ GroupMe" />
        </div>
      )}
    </div>
  );
}
