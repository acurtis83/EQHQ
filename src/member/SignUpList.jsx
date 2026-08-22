import { useState } from "react";
import { Check, Plus, Trash2, X, ClipboardList } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, Btn, Input, Chip } from "../components/ui";
import { SIGNUP_TEMPLATES, slotStatus, signupSummary } from "./signupTemplates";

export default function SignUpList({
  post, slots, claims, name, setName, isPresidency, onReload,
}) {
  const [openSlot, setOpenSlot] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [manage, setManage] = useState(false);

  const mySlots = slots.filter((s) => s.post_id === post.id)
    .sort((a, b) => a.sort_order - b.sort_order);

  // A post that already points at a sign-up form doesn't need the inline slot
  // builder as well — two competing ways to sign up for the same thing is
  // worse than one. The link on the post is the sign-up.
  const linksToForm = /[?&]f=/.test(post.link_url || "");

  if (!mySlots.length) {
    if (linksToForm) return null;
    return isPresidency ? (
      <>
        <div style={{ borderTop: `1px solid ${T.lineSoft}`, marginTop: 10, paddingTop: 10 }}>
          <Btn size="sm" kind="soft" onClick={() => setManage(true)}>
            <ClipboardList size={14} />Add a Sign-Up
          </Btn>
        </div>
        {manage && (
          <SlotBuilder post={post} slots={mySlots} claims={claims}
            onClose={() => setManage(false)} onReload={onReload} />
        )}
      </>
    ) : null;
  }

  const summary = signupSummary(mySlots, claims);

  const claim = async (slot) => {
    if (!name.trim()) return;
    setBusy(true);
    localStorage.setItem("eq_member_name", name.trim());
    const { error } = await supabase.from("signup_claims").insert({
      slot_id: slot.id,
      claimant_name: name.trim(),
      note: note.trim() || null,
    });
    setBusy(false);
    if (!error) { setOpenSlot(null); setNote(""); onReload(); }
  };

  return (
    <div style={{ borderTop: `1px solid ${T.lineSoft}`, marginTop: 10, paddingTop: 11 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, letterSpacing: "0.02em" }}>
          Sign-Up
        </span>
        {summary && (
          <Chip
            color={summary.complete ? T.green : T.gold}
            bg={summary.complete ? T.greenSoft : T.goldSoft}
          >
            {summary.complete ? "All covered" : `${summary.remaining} still needed`}
          </Chip>
        )}
        {isPresidency && (
          <Btn size="sm" kind="plain" style={{ marginLeft: "auto" }} onClick={() => setManage(true)}>
            Manage
          </Btn>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {mySlots.map((slot) => {
          const st = slotStatus(slot, claims);
          const mine = claims.filter((c) => c.slot_id === slot.id);
          const isOpen = openSlot === slot.id;

          return (
            <div
              key={slot.id}
              style={{
                background: st.full ? T.greenSoft : T.inset,
                border: `1px solid ${st.full ? T.green : T.lineSoft}`,
                borderRadius: 12,
                padding: "10px 11px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: T.ink, minWidth: 0 }}>
                  {slot.label}
                </span>
                <span style={{ fontSize: 13.5, color: st.full ? T.green : T.sub, fontWeight: 600 }}>
                  {st.taken} of {st.needed}
                </span>
                {!st.full && !isOpen && (
                  <Btn
                    size="sm" kind="primary" style={{ marginLeft: "auto" }}
                    onClick={() => { setOpenSlot(slot.id); setNote(""); }}
                  >
                    <Plus size={13} />I'll bring it
                  </Btn>
                )}
                {st.full && (
                  <Check size={15} style={{ marginLeft: "auto", color: T.green, flex: "0 0 auto" }} />
                )}
              </div>

              {mine.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                  {mine.map((c) => (
                    <span
                      key={c.id}
                      style={{
                        background: T.panel, border: `1px solid ${T.lineSoft}`, borderRadius: 999,
                        padding: "3px 9px", fontSize: 13, color: T.ink, display: "inline-flex",
                        alignItems: "center", gap: 5,
                      }}
                    >
                      {c.claimant_name}
                      {c.note ? <span style={{ color: T.faint }}>· {c.note}</span> : null}
                    </span>
                  ))}
                </div>
              )}

              {isOpen && (
                <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 7 }}>
                  <Input value={name} onChange={setName} placeholder="Your name" style={{ fontSize: 14.5 }} />
                  <Input value={note} onChange={setNote} placeholder="Bringing what? (optional)" style={{ fontSize: 14.5 }} />
                  <div style={{ display: "flex", gap: 7 }}>
                    <Btn kind="primary" disabled={busy || !name.trim()} onClick={() => claim(slot)}>
                      Sign up
                    </Btn>
                    <Btn kind="plain" onClick={() => setOpenSlot(null)}>Cancel</Btn>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {manage && (
        <SlotBuilder post={post} slots={mySlots} claims={claims}
          onClose={() => setManage(false)} onReload={onReload} />
      )}
    </div>
  );
}

function SlotBuilder({ post, slots, claims, onClose, onReload }) {
  const [label, setLabel] = useState("");
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const addSlot = async () => {
    if (!label.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("signup_slots").insert({
      post_id: post.id,
      label: label.trim(),
      quantity_needed: Math.max(1, Number(qty) || 1),
      sort_order: slots.length,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else { setLabel(""); setQty("1"); onReload(); }
  };

  const applyTemplate = async (tpl) => {
    setBusy(true);
    const rows = tpl.slots.map((s, i) => ({
      post_id: post.id,
      label: s.label,
      quantity_needed: s.quantity_needed,
      sort_order: slots.length + i,
    }));
    const { error } = await supabase.from("signup_slots").insert(rows);
    setBusy(false);
    if (error) setErr(error.message);
    else onReload();
  };

  const removeSlot = async (slot) => {
    const st = slotStatus(slot, claims);
    if (st.taken > 0 && !confirm(`${slot.label} has ${st.taken} signed up. Remove it anyway?`)) return;
    await supabase.from("signup_slots").delete().eq("id", slot.id);
    onReload();
  };

  const removeClaim = async (c) => {
    if (!confirm(`Take ${c.claimant_name} off this slot?`)) return;
    await supabase.from("signup_claims").delete().eq("id", c.id);
    onReload();
  };

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
          <div style={{ fontSize: 18.5, fontWeight: 800, color: T.ink }}>Sign-Up Slots</div>
          <Btn kind="plain" size="sm" onClick={onClose}><X size={18} /></Btn>
        </div>

        {err && (
          <div style={{
            background: T.redSoft, border: `1px solid ${T.red}`, color: T.red,
            borderRadius: 10, padding: "9px 12px", fontSize: 14,
          }}>
            {err}
          </div>
        )}

        {!slots.length && (
          <>
            <div style={{ fontSize: 14.5, color: T.sub, lineHeight: 1.6 }}>
              Start from a template, or add slots one at a time.
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {SIGNUP_TEMPLATES.map((t) => (
                <Btn key={t.key} size="sm" kind="soft" disabled={busy} onClick={() => applyTemplate(t)}>
                  {t.label}
                </Btn>
              ))}
            </div>
          </>
        )}

        {slots.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {slots.map((s) => {
              const st = slotStatus(s, claims);
              const mine = claims.filter((c) => c.slot_id === s.id);
              return (
                <div key={s.id} style={{ background: T.panel, border: `1px solid ${T.lineSoft}`, borderRadius: 12, padding: 11 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: T.ink, flex: 1, minWidth: 0 }}>{s.label}</span>
                    <span style={{ fontSize: 13.5, color: T.sub }}>{st.taken}/{st.needed}</span>
                    <Btn size="sm" kind="plain" onClick={() => removeSlot(s)}><Trash2 size={14} /></Btn>
                  </div>
                  {mine.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                      {mine.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => removeClaim(c)}
                          title="Remove"
                          style={{
                            background: T.inset, border: `1px solid ${T.lineSoft}`, borderRadius: 999,
                            padding: "3px 9px", fontSize: 13, color: T.ink, cursor: "pointer",
                            display: "inline-flex", alignItems: "center", gap: 5,
                          }}
                        >
                          {c.claimant_name}
                          <X size={11} style={{ color: T.faint }} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ borderTop: `1px solid ${T.lineSoft}`, paddingTop: 12, display: "flex", gap: 8 }}>
          <Input value={label} onChange={setLabel} placeholder="Add a slot — e.g. Dessert" />
          <Input
            type="number" value={qty} onChange={setQty}
            style={{ width: 72, flex: "0 0 auto" }} min="1"
          />
          <Btn kind="primary" onClick={addSlot} disabled={busy || !label.trim()}>
            <Plus size={15} />
          </Btn>
        </div>

        <div style={{ fontSize: 13.5, color: T.faint, lineHeight: 1.55 }}>
          Members sign up without an account, so only the presidency can take
          someone off a slot — tap a name above to remove it.
        </div>
      </div>
    </div>
  );
}
