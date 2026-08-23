import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { T, card, Btn, Input, Area, Chip } from "../components/ui";
import { FlyerHeader } from "../components/Flyer";
import { newId } from "../lib/newId";

import {
  capacityState, normalizeOptions, optionLabel, validateResponse,
} from "../lib/domain/forms";

/**
 * A blocked submission, in words a member can act on.
 *
 * The remaining way to trip the policy is an unpublished form: the check is
 * "does a published form with this id exist". Members can't tell that from the
 * raw message, and neither could the presidency.
 */
function submitError(message) {
  const m = String(message || "");
  if (/row-level security|violates row-level/i.test(m)) {
    // With the presidency now able to submit to a draft, a member seeing this
    // means the form really isn't live — or the database predates that rule.
    return "This form isn't accepting responses. It may not be published yet — " +
      "ask the presidency to publish it. (Presidency: run supabase/public-forms.sql.)";
  }
  return m;
}

// Renders a published form for a member and takes their submission.
// Used both inside the app and on the ?f=<id> share route.
export default function FormFill({ formId, onDone, embedded }) {
  const [form, setForm] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [picks, setPicks] = useState({}); // question_id -> existing capacity answers
  const [answers, setAnswers] = useState({});
  const [name, setName] = useState(() => localStorage.getItem("eq_member_name") || "");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const [f, q] = await Promise.all([
      supabase.from("forms").select("*").eq("id", formId).maybeSingle(),
      supabase.from("form_questions").select("*").eq("form_id", formId).order("sort_order"),
    ]);
    if (f.error || !f.data) { setErr("That form isn't available."); setLoading(false); return; }
    setForm(f.data);
    setQuestions(q.data || []);

    // Capacity counts come from a view that exposes only capacity answers.
    const cap = await supabase.from("public_form_capacity").select("question_id,value").eq("form_id", formId);
    const byQ = {};
    for (const row of cap.data || []) (byQ[row.question_id] ||= []).push(row.value);
    setPicks(byQ);
    setLoading(false);
  }, [formId]);

  useEffect(() => { load(); }, [load]);

  // Name the browser tab and anything the phone's own share sheet picks up
  // after the app has loaded. The link preview itself is handled at the edge,
  // since Messages never gets this far.
  useEffect(() => {
    if (!embedded && form?.title) {
      const was = document.title;
      document.title = form.title;
      return () => { document.title = was; };
    }
    return undefined;
  }, [embedded, form?.title]);

  const closed = useMemo(() => {
    if (!form?.closes_on) return false;
    return form.closes_on < new Date().toISOString().slice(0, 10);
  }, [form]);

  const set = (qid, v) => {
    setAnswers((a) => ({ ...a, [qid]: v }));
    setErrors((e) => ({ ...e, [qid]: undefined }));
  };

  const submit = async () => {
    const check = validateResponse(form, questions, answers, name);
    setErrors(check.errors);
    if (!check.ok) return;

    setBusy(true);
    if (!form.anonymous) localStorage.setItem("eq_member_name", name.trim());

    // The id is decided here rather than read back — see lib/newId.js. Asking
    // Postgres to return the new row runs it past the SELECT policy, and there
    // isn't one for members by design, so the insert was being rejected.
    const responseId = newId();
    const { error: e1 } = await supabase
      .from("form_responses")
      .insert({ id: responseId, form_id: form.id, respondent_name: form.anonymous ? null : name.trim() });
    if (e1) { setErr(submitError(e1.message)); setBusy(false); return; }

    const rows = questions
      .filter((q) => answers[q.id] !== undefined && answers[q.id] !== "")
      .map((q) => ({ response_id: responseId, question_id: q.id, value: answers[q.id] }));
    if (rows.length) {
      const { error: e2 } = await supabase.from("form_answers").insert(rows);
      if (e2) { setErr(submitError(e2.message)); setBusy(false); return; }
    }
    setBusy(false);
    setDone(true);
  };

  if (loading) {
    return <div style={{ color: T.sub, fontSize: 15, padding: 24, textAlign: "center" }}>Loading…</div>;
  }
  if (err && !form) {
    return <div style={{ ...card, color: T.sub, fontSize: 15 }}>{err}</div>;
  }

  if (done) {
    return (
      <div style={{ ...card, textAlign: "center", padding: 28 }}>
        <Check size={26} style={{ color: T.green }} />
        <div style={{ fontSize: 18, fontWeight: 800, color: T.ink, marginTop: 8 }}>Thanks — You're In</div>
        <div style={{ fontSize: 15, color: T.sub, marginTop: 6 }}>
          {form.anonymous ? "Your answers were submitted anonymously." : "We've got your response."}
        </div>
        {onDone && (
          <Btn kind="soft" style={{ marginTop: 14 }} onClick={onDone}>Close</Btn>
        )}
      </div>
    );
  }

  return (
    <div style={{ ...card, padding: 17 }}>
      <FlyerHeader url={form.flyer_url} alt={form.title} />
      <div style={{ fontSize: 19.5, fontWeight: 800, color: T.ink }}>{form.title}</div>
      {form.description && (
        <div style={{ fontSize: 15, color: T.sub, marginTop: 5, lineHeight: 1.55 }}>{form.description}</div>
      )}
      {/* Only the presidency can load an unpublished form at all — members
          get "That form isn't available" — so reaching this means you're
          looking at your own draft. Say so at the top, where it's useful,
          rather than letting you fill the whole thing in and find out at the
          Submit button. */}
      {!form.published && (
        <div style={{
          background: T.goldSoft, border: `1px solid ${T.gold}`, color: T.gold,
          borderRadius: 10, padding: "9px 12px", fontSize: 14,
          marginTop: 10, lineHeight: 1.5, fontWeight: 600,
        }}>
          Draft — members can't open this link yet. Publish it on the Share tab.
          You can still submit a test response.
        </div>
      )}

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 9 }}>
        {form.anonymous && <Chip color={T.primaryDeep} bg={T.primarySoft}>Anonymous</Chip>}
        {form.closes_on && (
          <Chip color={closed ? T.red : T.sub} bg={closed ? T.redSoft : T.inset}>
            {closed ? "Closed" : `Closes ${form.closes_on}`}
          </Chip>
        )}
      </div>

      {closed ? (
        <div style={{ fontSize: 15, color: T.sub, marginTop: 14 }}>
          This form is closed. Reach out to the presidency if you still need to get on.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
            {!form.anonymous && (
              <Field label="Your name" required error={errors._name}>
                <Input value={name} onChange={(v) => { setName(v); setErrors((e) => ({ ...e, _name: undefined })); }}
                  placeholder="First and last" />
              </Field>
            )}

            {questions.map((q) => (
              <Field key={q.id} label={q.label} help={q.help} required={q.required} error={errors[q.id]}>
                <QuestionInput
                  q={q}
                  value={answers[q.id]}
                  onChange={(v) => set(q.id, v)}
                  picks={picks[q.id] || []}
                />
              </Field>
            ))}
          </div>

          {err && (
            <div style={{
              background: T.redSoft, border: `1px solid ${T.red}`, color: T.red,
              borderRadius: 10, padding: "9px 12px", fontSize: 14, marginTop: 14,
            }}>
              {err}
            </div>
          )}

          <Btn kind="primary" size="lg" style={{ justifyContent: "center", marginTop: 18 }}
            onClick={submit} disabled={busy}>
            {busy ? "Submitting…" : "Submit"}
          </Btn>
        </>
      )}

      {embedded && onDone && (
        <Btn kind="plain" style={{ marginTop: 8, width: "100%", justifyContent: "center" }} onClick={onDone}>
          Cancel
        </Btn>
      )}
    </div>
  );
}

function Field({ label, help, required, error, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: T.ink, marginBottom: help ? 2 : 7 }}>
        {label}
        {required && <span style={{ color: T.red, marginLeft: 4 }}>*</span>}
      </div>
      {help && <div style={{ fontSize: 14, color: T.sub, marginBottom: 7 }}>{help}</div>}
      {children}
      {error && <div style={{ fontSize: 14, color: T.red, marginTop: 5 }}>{error}</div>}
    </div>
  );
}

function QuestionInput({ q, value, onChange, picks }) {
  const options = normalizeOptions(q.type, q.options);

  if (q.type === "long") {
    return <Area value={value || ""} onChange={onChange} rows={3} />;
  }
  if (q.type === "short") {
    return <Input value={value || ""} onChange={onChange} />;
  }
  if (q.type === "number") {
    return <Input type="number" value={value ?? ""} onChange={onChange} />;
  }
  if (q.type === "date") {
    return <Input type="date" value={value || ""} onChange={onChange} />;
  }
  if (q.type === "yesno") {
    return (
      <div style={{ display: "flex", gap: 8 }}>
        {["Yes", "No"].map((o) => (
          <Btn key={o} kind={value === o ? "primary" : "ghost"} onClick={() => onChange(o)}>{o}</Btn>
        ))}
      </div>
    );
  }
  if (q.type === "scale") {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Btn
            key={n}
            kind={String(value) === String(n) ? "primary" : "ghost"}
            onClick={() => onChange(String(n))}
            style={{ flex: 1, justifyContent: "center" }}
          >
            {n}
          </Btn>
        ))}
      </div>
    );
  }
  if (q.type === "choice") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {options.map((o) => {
          const label = optionLabel(o);
          const on = value === label;
          return (
            <button
              key={label}
              onClick={() => onChange(on ? "" : label)}
              style={pickStyle(on)}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  }
  if (q.type === "checkboxes") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {options.map((o) => {
          const label = optionLabel(o);
          const on = arr.includes(label);
          return (
            <button
              key={label}
              onClick={() => onChange(on ? arr.filter((x) => x !== label) : [...arr, label])}
              style={pickStyle(on)}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  }
  if (q.type === "capacity") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {options.map((o) => {
          const label = optionLabel(o);
          const st = capacityState(o, picks);
          const on = value === label;
          const disabled = st.full && !on;
          return (
            <button
              key={label}
              disabled={disabled}
              onClick={() => onChange(on ? "" : label)}
              style={{
                ...pickStyle(on),
                opacity: disabled ? 0.55 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: st.full ? T.red : T.sub }}>
                {st.full ? "Full" : `${st.remaining} left`}
              </span>
            </button>
          );
        })}
      </div>
    );
  }
  return <Input value={value || ""} onChange={onChange} />;
}

function pickStyle(on) {
  return {
    textAlign: "left",
    background: on ? T.primarySoft : T.panel,
    border: `1px solid ${on ? T.primary : T.line}`,
    borderRadius: 10,
    padding: "11px 13px",
    fontSize: 15.5,
    fontWeight: on ? 700 : 500,
    color: on ? T.primaryDeep : T.ink,
    cursor: "pointer",
    width: "100%",
    fontFamily: "inherit",
  };
}
