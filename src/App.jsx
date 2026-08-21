import { useEffect, useState } from "react";
import {
  Home, Users, ClipboardList, CalendarDays, GraduationCap,
  HeartHandshake, LayoutGrid, Settings, LogOut, Lock, FileText, LayoutDashboard,
} from "lucide-react";
import { useAuth } from "./lib/useAuth";
import { T, Btn, Stub } from "./components/ui";
import Feed from "./member/Feed";
import FormFill from "./member/FormFill";
import Roster from "./presidency/Roster";
import Presidency from "./presidency/Presidency";
import Teaching from "./presidency/Teaching";
import Forms from "./presidency/Forms";
import Callings from "./presidency/Callings";
import HomeHub from "./presidency/HomeHub";
import ImportLegacy from "./presidency/ImportLegacy";
import TalkLibrary from "./presidency/TalkLibrary";
import SignIn from "./presidency/SignIn";
import Splash from "./components/Splash";

// Member tabs are always present. Presidency tabs only mount when signed in —
// and even if someone forced them open, RLS returns nothing without a session.
const MEMBER_TABS = [{ id: "feed", label: "Feed", icon: Home }];

const PRESIDENCY_TABS = [
  { id: "hub", label: "Home", icon: LayoutDashboard },
  { id: "presagenda", label: "Presidency", icon: ClipboardList },
  { id: "sunday", label: "Sunday", icon: CalendarDays },
  { id: "teaching", label: "Teaching", icon: GraduationCap },
  { id: "forms", label: "Forms", icon: FileText },
  { id: "ministering", label: "Ministering", icon: HeartHandshake },
  { id: "callings", label: "Callings", icon: LayoutGrid },
  { id: "roster", label: "Roster", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
];

// ?f=<id> — a shareable form link. Renders on its own so someone who has never
// opened the app (or isn't in the quorum) can still fill it out.
function sharedFormId() {
  try {
    return new URLSearchParams(window.location.search).get("f") || "";
  } catch {
    return "";
  }
}

export default function App() {
  const { isPresidency, presidency, ready, signOut } = useAuth();
  const [sharedForm] = useState(sharedFormId);
  const [splashDone, setSplashDone] = useState(() => !!sharedFormId());
  const [tab, setTab] = useState("feed");
  const [showSignIn, setShowSignIn] = useState(false);

  // Theme, per device — same behaviour as the old app.
  const [themeMode] = useState(() => localStorage.getItem("eq_theme") || "auto");
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = themeMode === "dark" || (themeMode === "auto" && mq.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, [themeMode]);

  // Drop back to the feed if the session ends while on a presidency tab.
  useEffect(() => {
    if (!isPresidency && tab !== "feed") setTab("feed");
  }, [isPresidency, tab]);

  // Signing in lands on the presidency hub rather than the member feed.
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (isPresidency && !landed) { setTab("hub"); setLanded(true); }
    if (!isPresidency && landed) setLanded(false);
  }, [isPresidency, landed]);

  const tabs = isPresidency ? [...MEMBER_TABS, ...PRESIDENCY_TABS] : MEMBER_TABS;

  if (!splashDone) {
    return <Splash onDone={() => setSplashDone(true)} />;
  }

  if (sharedForm) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, padding: "20px 16px 40px" }}>
        <div className="eq-scale" style={{ maxWidth: 620, margin: "0 auto" }}>
          <div style={{ fontSize: 10.5, letterSpacing: "0.14em", color: T.faint, fontWeight: 700 }}>
            HOLBROOK FARMS 8TH WARD
          </div>
          <div style={{ fontSize: 21, fontWeight: 800, color: T.ink, letterSpacing: "-0.02em", margin: "2px 0 16px" }}>
            Elders Quorum
          </div>
          <FormFill formId={sharedForm} />
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: T.sub, fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, paddingBottom: isPresidency ? 92 : 24 }}>
      <header
        style={{
          position: "sticky", top: 0, zIndex: 30, background: "var(--chrome)",
          backdropFilter: "saturate(180%) blur(12px)",
          borderBottom: `1px solid ${T.lineSoft}`, padding: "14px 16px",
        }}
      >
        <div className="eq-shell" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10.5, letterSpacing: "0.14em", color: T.faint, fontWeight: 700 }}>
              HOLBROOK FARMS 8TH WARD
            </div>
            <div style={{ fontSize: 21, fontWeight: 800, color: T.ink, letterSpacing: "-0.02em", marginTop: 2 }}>
              Elders Quorum
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            {isPresidency ? (
              <Btn kind="plain" size="sm" onClick={signOut} title={presidency?.name}>
                <LogOut size={15} />Sign out
              </Btn>
            ) : (
              <Btn kind="ghost" size="sm" onClick={() => setShowSignIn(true)}>
                <Lock size={14} />Presidency
              </Btn>
            )}
          </div>
        </div>
      </header>

      <main className="eq-main eq-shell eq-scale" style={{ padding: "18px 16px" }}>
        {tab === "feed" && <Feed />}
        {tab === "hub" && <HomeHub onGo={setTab} />}
        {tab === "roster" && <Roster />}
        {tab === "settings" && (
          <>
            <TalkLibrary />
            <div style={{ height: 28 }} />
            <ImportLegacy />
          </>
        )}
        {tab === "presagenda" && <Presidency />}
        {tab === "sunday" && (
          <Stub title="Sunday quorum meeting agenda" note="The 25-minute block — cadence-aware, with the teaching schedule and talk link pulled in." />
        )}
        {tab === "teaching" && <Teaching />}
        {tab === "forms" && <Forms />}
        {tab === "ministering" && (
          <Stub title="Ministering" note="Districts, companionships, households, and quarterly interviews. Presidency-only, enforced in the database." />
        )}
        {tab === "callings" && <Callings />}
      </main>

      {isPresidency && (
        <nav
          style={{
            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50,
            background: "var(--chrome)", backdropFilter: "saturate(180%) blur(12px)",
            borderTop: `1px solid ${T.lineSoft}`,
            padding: "8px 8px calc(8px + env(safe-area-inset-bottom))",
            overflowX: "auto",
          }}
        >
          <div className="eq-nav-inner" style={{ display: "flex", gap: 4, maxWidth: 720, margin: "0 auto", minWidth: "min-content" }}>
            {tabs.map((t) => {
              const Icon = t.icon;
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); window.scrollTo(0, 0); }}
                  style={{
                    flex: "1 0 auto", display: "flex", flexDirection: "column", alignItems: "center",
                    gap: 3, padding: "7px 10px", background: on ? T.primarySoft : "transparent",
                    color: on ? T.primaryDeep : T.sub, border: "none", borderRadius: 10,
                    fontSize: 10.5, fontWeight: 700, cursor: "pointer", minWidth: 62,
                  }}
                >
                  <Icon size={19} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {showSignIn && <SignIn onClose={() => setShowSignIn(false)} />}
    </div>
  );
}
