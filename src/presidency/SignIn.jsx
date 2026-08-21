import { useState } from "react";
import { Lock, X } from "lucide-react";
import { useAuth } from "../lib/useAuth";
import { T, Btn, Input } from "../components/ui";

export default function SignIn({ onClose }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const msg = await signIn(email.trim(), password);
    setBusy(false);
    if (msg) setErr(msg);
    else onClose?.();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(10,12,16,.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 18,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          background: T.bg, width: "100%", maxWidth: 400, borderRadius: 18,
          padding: 20, display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Lock size={18} color={T.sub} />
            <span style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>Presidency sign in</span>
          </div>
          <Btn kind="plain" size="sm" onClick={onClose}><X size={18} /></Btn>
        </div>

        <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.6 }}>
          For the quorum presidency. Members don't need an account — the feed is open.
        </div>

        <Input value={email} onChange={setEmail} type="email" placeholder="Email" autoComplete="username" />
        <Input value={password} onChange={setPassword} type="password" placeholder="Password" autoComplete="current-password" />

        {err && (
          <div style={{
            background: T.redSoft, border: `1px solid ${T.red}`, color: T.red,
            borderRadius: 10, padding: "9px 12px", fontSize: 13,
          }}>
            {err}
          </div>
        )}

        <Btn type="submit" kind="primary" size="lg" disabled={busy || !email || !password} style={{ justifyContent: "center" }}>
          {busy ? "Signing in…" : "Sign in"}
        </Btn>
      </form>
    </div>
  );
}
