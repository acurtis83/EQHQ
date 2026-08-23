import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, ChevronLeft, Copy, Download, ChevronUp, ChevronDown, X, Eye, CalendarPlus } from "lucide-react";
import { supabase } from "../lib/supabase";
import { REPEAT_RULES, occurrencesBetween, slotLabel } from "../lib/domain/repeat";
import { toIso } from "../lib/domain/dates";
import { useAuth } from "../lib/useAuth";
import { T, card, Btn, Input, Area, Select, Chip, SectionTitle, Empty } from "../components/ui";
import {
  QUESTION_TYPES, needsOptions, normalizeOptions, optionLabel, capacityState,
  FORM_TEMPLATES, responsesToCsv, summarize, capacityTotals, namesByOption,
} from "../lib/domain/forms";
import FormFill from "../member/FormFill";
import { FlyerPicker } from "../components/Flyer";

export default function Forms() {
  const { presidency } = useAuth();
  const [forms, setForms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("forms").select("*").order("created_at", { ascending: false });
    if (error) setErr(error.message);
    else setForms(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createFrom = async (tpl) => {
    const { data: f, error } = await supabase
      .from("forms")
      .insert({ ...tpl.form, title: tpl.form.title || "Untitled Form", created_by: presidency?.name || "Presidency" })
      .select().single();
    if (error) { setErr(error.message); return; }
    if (tpl.questions.length) {
      await supabase.from("form_questions").insert(
        tpl.questions.map((q, i) => ({
          form_id: f.id, type: q.type, label: q.label, required: !!q.required,
          options: normalizeOptions(q.type, q.options), sort_order: i,
        }))
      );
    }
    setNewOpen(false);
    await load();
    setSelected(f);
  };

  if (loading) {
    return <div style={{ color: T.sub, fontSize: 15, padding: 24, textAlign: "center" }}>Loading forms…</div>;
  }

  if (selected) {
    return (
      <FormDetail
        form={selected}
        onBack={() => { setSelected(null); load(); }}
        onChanged={(f) => setSelected(f)}
        onDeleted={() => { setSelected(null); load(); }}
      />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <SectionTitle sub="Sign-Ups, assignments, and surveys. Share by link or post to the feed.">
            Forms
          </SectionTitle>
        </div>
        <Btn kind="primary" style={{ marginLeft: "auto", flex: "0 0 auto" }} onClick={() => setNewOpen(true)}>
          <Plus size={15} />New
        </Btn>
      </div>

      {err && (
        <div style={{ ...card, background: T.redSoft, borderColor: T.red, color: T.red, marginBottom: 12, fontSize: 14.5 }}>
          {err}
        </div>
      )}

      {!forms.length ? (
        <Empty title="No Forms Yet" hint="Start from a template — temple cleaning shifts, volunteer sign-up, or the ministering check-in." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {forms.map((f) => (
            <button key={f.id} onClick={() => setSelected(f)}
              style={{ ...card, padding: 14, textAlign: "left", cursor: "pointer", width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 16.5, fontWeight: 700, color: T.ink }}>{f.title}</span>
                <Chip color={f.published ? T.green : T.sub} bg={f.published ? T.greenSoft : T.inset}>
                  {f.published ? "Live" : "Draft"}
                </Chip>
                {f.anonymous && <Chip color={T.primaryDeep} bg={T.primarySoft}>Anonymous</Chip>}
              </div>
              {f.description && (
                <div style={{ fontSize: 14, color: T.sub, marginTop: 4 }}>{f.description}</div>
              )}
            </button>
          ))}
        </div>
      )}

      {newOpen && (
        <Sheet title="Start a Form" onClose={() => setNewOpen(false)}>
          <div style={{ fontSize: 14.5, color: T.sub, lineHeight: 1.6 }}>
            Pick a starting point — everything is editable afterwards.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {FORM_TEMPLATES.map((t) => (
              <button key={t.key} onClick={() => createFrom(t)}
                style={{
                  ...card, padding: 13, textAlign: "left", cursor: "pointer", width: "100%",
                }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: T.ink }}>{t.label}</div>
                <div style={{ fontSize: 13.5, color: T.sub, marginTop: 3 }}>
                  {t.questions.length ? `${t.questions.length} questions` : "Empty — build it yourself"}
                  {t.form.anonymous ? " · anonymous" : ""}
                </div>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function FormDetail({ form, onBack, onChanged, onDeleted }) {
  const [tab, setTab] = useState("build");
  const [questions, setQuestions] = useState([]);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState(false);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  const loadQs = useCallback(async () => {
    const { data, error } = await supabase
      .from("form_questions").select("*").eq("form_id", form.id).order("sort_order");
    if (error) setErr(error.message);
    else setQuestions(data || []);
  }, [form.id]);

  useEffect(() => { loadQs(); }, [loadQs]);

  const patchForm = async (fields) => {
    const { error } = await supabase.from("forms").update(fields).eq("id", form.id);
    if (error) setErr(error.message);
    else onChanged({ ...form, ...fields });
  };

  const shareUrl = `${window.location.origin}/?f=${form.id}`;

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareUrl); } catch {
      const ta = document.createElement("textarea");
      ta.value = shareUrl; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
    }
    flash("Link copied");
  };

  const postToFeed = async () => {
    const { error } = await supabase.from("posts").insert({
      category: form.kind === "survey" ? "announcement" : "activity",
      title: form.title,
      body: form.description || null,
      link_url: shareUrl,
      link_label: form.kind === "survey" ? "Take the survey" : "Sign up",
      created_by: "Presidency",
    });
    if (error) setErr(error.message);
    else flash("Posted to the feed");
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Btn kind="plain" size="sm" onClick={onBack}><ChevronLeft size={16} />All forms</Btn>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <Btn size="sm" kind="plain" onClick={() => setPreview(true)}><Eye size={14} />Preview</Btn>
          <Btn size="sm" kind="plain" onClick={async () => {
            if (!confirm("Delete this form and every response?")) return;
            await supabase.from("forms").delete().eq("id", form.id);
            onDeleted();
          }}><Trash2 size={14} /></Btn>
        </div>
      </div>

      {err && (
        <div style={{ ...card, background: T.redSoft, borderColor: T.red, color: T.red, marginBottom: 12, fontSize: 14.5 }}>{err}</div>
      )}
      {toast && (
        <div style={{ ...card, background: T.greenSoft, borderColor: T.green, color: T.green, marginBottom: 12, fontSize: 14.5, padding: "10px 14px" }}>{toast}</div>
      )}

      <div role="tablist" style={{ display: "flex", gap: 4, background: T.inset, borderRadius: 12, padding: 4, marginBottom: 14 }}>
        {[["build", "Build"], ["share", "Share"], ["results", "Results"]].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            style={{
              flex: 1, padding: "9px 12px", borderRadius: 9, border: "none",
              background: tab === id ? T.panel : "transparent",
              color: tab === id ? T.ink : T.sub,
              fontSize: 15, fontWeight: 700, cursor: "pointer",
              boxShadow: tab === id ? "var(--card-shadow)" : "none",
            }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "build" && (
        <Builder
          form={form} questions={questions} patchForm={patchForm}
          reload={loadQs} adding={adding} setAdding={setAdding} setErr={setErr}
        />
      )}

      {tab === "share" && (
        <ShareTab
          form={form} shareUrl={shareUrl} patchForm={patchForm}
          copyLink={copyLink} postToFeed={postToFeed} questionCount={questions.length}
        />
      )}

      {tab === "results" && <Results form={form} questions={questions} />}

      {preview && (
        <Sheet title="How Members See It" onClose={() => setPreview(false)}>
          <FormFill formId={form.id} onDone={() => setPreview(false)} embedded />
        </Sheet>
      )}
    </div>
  );
}

// The options textarea and the stored option rows, both directions. Editing a
// question needs to go backwards — turn saved slots into the text you typed —
// which adding never did.
function optionsToText(type, options) {
  return normalizeOptions(type, options)
    .map((o) => (type === "capacity" ? `${optionLabel(o)} ×${o.limit}` : optionLabel(o)))
    .join("\n");
}

function textToOptions(type, text) {
  if (!needsOptions(type)) return [];
  return normalizeOptions(type, text.split("\n").map((l) => l.trim()).filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)\s*[x×]\s*(\d+)$/i);
      return m ? { label: m[1].trim(), limit: Number(m[2]) } : { label: line, limit: 1 };
    }));
}

/**
 * The question editor, used for both adding and changing.
 *
 * It was inline in the add path only, which is why a typo in a question meant
 * deleting it and starting again — and deleting a question takes its answers
 * with it.
 */
function QuestionForm({ draft, setDraft, optText, setOptText, onSave, onCancel, saveLabel, existing }) {
  return (
    <div style={{ ...card, marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
      <Lbl label="Question">
        <Input value={draft.label} onChange={(v) => setDraft({ ...draft, label: v })}
          placeholder="Which shift can you take?" />
      </Lbl>
      <Lbl label="Type">
        <Select value={draft.type} onChange={(v) => setDraft({ ...draft, type: v })}>
          {QUESTION_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
        </Select>
      </Lbl>
      {needsOptions(draft.type) && (
        <Lbl label={draft.type === "capacity" ? "Slots — one per line, add ×N for spots" : "Options — one per line"}>
          <Area value={optText} onChange={setOptText} rows={4}
            placeholder={draft.type === "capacity" ? "Saturday 6:00 AM ×4\nSaturday 8:00 AM ×4" : "Truck\nTrailer\nNeither"} />
        </Lbl>
      )}

      {/* Sign-ups are recorded against the slot's name, so a rename leaves
          them behind. Changing the ×N is safe; changing the words is not. */}
      {existing && needsOptions(draft.type) && (
        <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.55 }}>
          Changing a number is safe. Renaming a slot won't move anyone already
          signed up under the old name.
        </div>
      )}

      {/* Temple cleaning and the like: the same job on a run of dates,
          each needing its own sign-ups. Rather than typing twelve
          Saturdays by hand, generate them and let the existing capacity
          machinery handle the spots and the "full" state. */}
      {draft.type === "capacity" && (
        <DateSlots onGenerate={(lines) =>
          setOptText((prev) => (prev.trim() ? prev.replace(/\s+$/, "") + "\n" : "") + lines)} />
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color: T.ink }}>
        <input type="checkbox" checked={draft.required}
          onChange={(e) => setDraft({ ...draft, required: e.target.checked })} />
        Required
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn kind="primary" onClick={onSave} disabled={!draft.label.trim()}>{saveLabel}</Btn>
        <Btn kind="plain" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

function Builder({ form, questions, patchForm, reload, adding, setAdding, setErr }) {
  const [draft, setDraft] = useState({ type: "short", label: "", required: false, options: [] });
  const [optText, setOptText] = useState("");
  const [editing, setEditing] = useState(null);
  const [eDraft, setEDraft] = useState(null);
  const [eOptText, setEOptText] = useState("");

  const startEdit = (q) => {
    setAdding(false);
    setEditing(q.id);
    setEDraft({ type: q.type, label: q.label, required: !!q.required });
    setEOptText(optionsToText(q.type, q.options));
  };

  const saveEdit = async (q) => {
    if (!eDraft?.label.trim()) return;
    const { error } = await supabase.from("form_questions").update({
      type: eDraft.type,
      label: eDraft.label.trim(),
      required: eDraft.required,
      options: textToOptions(eDraft.type, eOptText),
    }).eq("id", q.id);
    if (error) { setErr(error.message); return; }
    setEditing(null);
    reload();
  };

  const addQuestion = async () => {
    if (!draft.label.trim()) return;
    const opts = textToOptions(draft.type, optText);
    const { error } = await supabase.from("form_questions").insert({
      form_id: form.id, type: draft.type, label: draft.label.trim(),
      required: draft.required, options: opts, sort_order: questions.length,
    });
    if (error) { setErr(error.message); return; }
    setDraft({ type: "short", label: "", required: false, options: [] });
    setOptText("");
    setAdding(false);
    reload();
  };

  const move = async (q, dir) => {
    const i = questions.findIndex((x) => x.id === q.id);
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    await Promise.all([
      supabase.from("form_questions").update({ sort_order: j }).eq("id", q.id),
      supabase.from("form_questions").update({ sort_order: i }).eq("id", questions[j].id),
    ]);
    reload();
  };

  return (
    <div>
      <div style={{ ...card, marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <Lbl label="Title">
          <Input value={form.title} onChange={(v) => patchForm({ title: v })} />
        </Lbl>
        <Lbl label="Description">
          <Area value={form.description || ""} onChange={(v) => patchForm({ description: v })} rows={2} />
        </Lbl>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Lbl label="Type">
            <Select value={form.kind} onChange={(v) => patchForm({ kind: v })}>
              <option value="signup">Sign-Up / assignment</option>
              <option value="survey">Survey</option>
            </Select>
          </Lbl>
          <Lbl label="Closes on">
            <Input type="date" value={form.closes_on || ""} onChange={(v) => patchForm({ closes_on: v || null })} />
          </Lbl>
        </div>
        {/* Bishop's poster, the activity flyer — whatever was already made
            for the event. It heads the form and the shared link. */}
        <FlyerPicker
          row={form}
          table="forms"
          save={(url) => patchForm({ flyer_url: url })}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color: T.ink }}>
          <input type="checkbox" checked={form.anonymous}
            onChange={(e) => patchForm({ anonymous: e.target.checked })} />
          Anonymous — don't collect names
        </label>
        {form.anonymous && (
          <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.55 }}>
            Sign-Up Slots still work, but you won't know who took which one.
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {questions.map((q, i) => (
          editing === q.id ? (
            <QuestionForm
              key={q.id}
              draft={eDraft} setDraft={setEDraft}
              optText={eOptText} setOptText={setEOptText}
              onSave={() => saveEdit(q)} onCancel={() => setEditing(null)}
              saveLabel="Save changes" existing
            />
          ) : (
          <div key={q.id} data-question={q.id} style={{ ...card, padding: 13 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: T.ink }}>
                  {q.label}{q.required && <span style={{ color: T.red, marginLeft: 4 }}>*</span>}
                </div>
                <div style={{ fontSize: 13.5, color: T.sub, marginTop: 3 }}>
                  {QUESTION_TYPES.find((t) => t.type === q.type)?.label || q.type}
                </div>
                {needsOptions(q.type) && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                    {normalizeOptions(q.type, q.options).map((o, k) => (
                      <Chip key={k} color={T.sub} bg={T.inset}>
                        {optionLabel(o)}{q.type === "capacity" ? ` ×${o.limit}` : ""}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Btn size="sm" kind="plain" onClick={() => move(q, -1)} disabled={i === 0}><ChevronUp size={14} /></Btn>
                <Btn size="sm" kind="plain" onClick={() => move(q, 1)} disabled={i === questions.length - 1}><ChevronDown size={14} /></Btn>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Btn size="sm" kind="plain" onClick={() => startEdit(q)}><Pencil size={14} /></Btn>
                <Btn size="sm" kind="plain" onClick={async () => {
                  await supabase.from("form_questions").delete().eq("id", q.id);
                  reload();
                }}><Trash2 size={14} /></Btn>
              </div>
            </div>
          </div>
          )
        ))}
      </div>

      {adding ? (
        <QuestionForm
          draft={draft} setDraft={setDraft}
          optText={optText} setOptText={setOptText}
          onSave={addQuestion} onCancel={() => setAdding(false)}
          saveLabel="Add question"
        />
      ) : (
        <Btn kind="soft" style={{ marginTop: 10 }} onClick={() => setAdding(true)}>
          <Plus size={15} />Add question
        </Btn>
      )}
    </div>
  );
}

function ShareTab({ form, shareUrl, patchForm, copyLink, postToFeed, questionCount }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...card }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 16.5, fontWeight: 700, color: T.ink }}>
            {form.published ? "This Form Is Live" : "Not Published Yet"}
          </span>
          <Chip color={form.published ? T.green : T.sub} bg={form.published ? T.greenSoft : T.inset}>
            {form.published ? "Live" : "Draft"}
          </Chip>
        </div>
        <div style={{ fontSize: 14.5, color: T.sub, lineHeight: 1.6, marginBottom: 12 }}>
          {form.published
            ? "Anyone with the link can fill it out — no account needed."
            : "Publish it before sharing, or the link will show nothing."}
        </div>
        {questionCount === 0 && (
          <div style={{
            background: T.goldSoft, color: T.gold, borderRadius: 10,
            padding: "9px 12px", fontSize: 14, marginBottom: 12,
          }}>
            This form has no questions yet.
          </div>
        )}
        <Btn kind={form.published ? "ghost" : "primary"} size="lg"
          style={{ justifyContent: "center" }}
          onClick={() => patchForm({ published: !form.published })}>
          {form.published ? "Unpublish" : "Publish"}
        </Btn>
      </div>

      {form.published && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
          <Lbl label="Share Link">
            <Input value={shareUrl} onChange={() => {}} readOnly />
          </Lbl>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn kind="soft" onClick={copyLink}><Copy size={15} />Copy link</Btn>
            <Btn kind="soft" onClick={postToFeed}>Post to the feed</Btn>
          </div>
          <div style={{ fontSize: 13.5, color: T.faint, lineHeight: 1.55 }}>
            Posting adds a card to the home feed linking here. Copy the link to
            send it in GroupMe or a text.
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A sign-up question, answered.
 *
 * Counts alone don't tell you what you need to know before a barbecue: which
 * slots are still open, and who said they'd cover the ones that aren't. Both
 * are here — a filled/needed line at the top, then each option with the names
 * under it.
 */
function TallySummary({ q, summary, values, rows }) {
  const isCapacity = q.type === "capacity";
  const totals = isCapacity ? capacityTotals(q, values) : null;
  const names = namesByOption(q, rows);
  const options = normalizeOptions(q.type, q.options);

  // Every option, not just the ones somebody picked — an empty slot is the
  // most important thing on this list.
  const shown = options.length
    ? options.map((o) => optionLabel(o))
    : summary.tally.map(([label]) => label);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {totals && totals.needed > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15.5, fontWeight: 800, color: T.ink }}>
            {totals.taken} of {totals.needed} filled
          </span>
          <Chip
            color={totals.complete ? T.green : T.gold}
            bg={totals.complete ? T.greenSoft : T.goldSoft}
          >
            {totals.complete ? "All covered" : `${totals.remaining} still needed`}
          </Chip>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {shown.map((label) => {
          const opt = options.find((o) => optionLabel(o) === label);
          const cap = isCapacity && opt ? capacityState(opt, values) : null;
          const who = names[label] || { names: [], anonymous: 0 };
          const n = who.names.length + who.anonymous;

          return (
            <div
              key={label}
              style={{
                background: cap?.full ? T.greenSoft : T.inset,
                border: `1px solid ${cap?.full ? T.green : T.lineSoft}`,
                borderRadius: 10,
                padding: "8px 10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: T.ink, flex: 1, minWidth: 0 }}>
                  {label}
                </span>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: cap?.full ? T.green : T.sub }}>
                  {cap ? `${cap.taken}/${cap.limit}` : n}
                </span>
              </div>

              {/* Who took it. An anonymous form has no names to show, so it
                  falls back to a count rather than inventing people. */}
              {(who.names.length > 0 || who.anonymous > 0) && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                  {who.names.map((nm, i) => (
                    <Chip key={`${nm}-${i}`} color={T.ink} bg={T.panel}>{nm}</Chip>
                  ))}
                  {who.anonymous > 0 && (
                    <Chip color={T.faint} bg={T.panel}>
                      {who.anonymous} anonymous
                    </Chip>
                  )}
                </div>
              )}

              {cap && !cap.full && (
                <div style={{ fontSize: 13, color: T.gold, fontWeight: 700, marginTop: 6 }}>
                  {cap.limit - cap.taken} still needed
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Results({ form, questions }) {
  const [responses, setResponses] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("summary");

  useEffect(() => {
    (async () => {
      const [r, a] = await Promise.all([
        supabase.from("form_responses").select("*").eq("form_id", form.id).order("created_at", { ascending: false }),
        supabase.from("form_answers").select("*"),
      ]);
      setResponses(r.data || []);
      const ids = new Set((r.data || []).map((x) => x.id));
      setAnswers((a.data || []).filter((x) => ids.has(x.response_id)));
      setLoading(false);
    })();
  }, [form.id]);

  const byResponse = useMemo(() => {
    const out = {};
    for (const a of answers) (out[a.response_id] ||= {})[a.question_id] = a.value;
    return out;
  }, [answers]);

  const valuesFor = (qid) => answers.filter((a) => a.question_id === qid).map((a) => a.value);

  // Each answer paired with who gave it, so a sign-up can say who is bringing
  // what rather than just how many.
  const nameById = useMemo(() => {
    const out = {};
    for (const r of responses) out[r.id] = r.respondent_name || "";
    return out;
  }, [responses]);

  const rowsFor = (qid) => answers
    .filter((a) => a.question_id === qid)
    .map((a) => ({ value: a.value, name: nameById[a.response_id] || "" }));

  const download = () => {
    const csv = responsesToCsv(form, questions, responses, byResponse);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div style={{ color: T.sub, fontSize: 15, padding: 24, textAlign: "center" }}>Loading results…</div>;
  }

  if (!responses.length) {
    return <Empty title="No Responses Yet" hint={form.published ? "Share the link and they'll show up here." : "Publish the form first."} />;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>
          {responses.length} response{responses.length === 1 ? "" : "s"}
        </span>
        <Btn size="sm" kind="plain" style={{ marginLeft: "auto" }}
          onClick={() => setView(view === "summary" ? "individual" : "summary")}>
          {view === "summary" ? "See each one" : "See summary"}
        </Btn>
        <Btn size="sm" kind="soft" onClick={download}><Download size={14} />CSV</Btn>
      </div>

      {view === "summary" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {questions.map((q) => {
            const s = summarize(q, valuesFor(q.id));
            return (
              <div key={q.id} style={{ ...card, padding: 14 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: T.ink }}>{q.label}</div>
                <div style={{ fontSize: 13.5, color: T.faint, marginTop: 3, marginBottom: 8 }}>
                  {s.count} answered
                </div>
                {s.kind === "number" && (
                  /* "How many will attend" wants the total — that's the
                     headcount. A 1-5 rating wants the average, where adding
                     the scores up says nothing. Both are shown; which one
                     leads depends on the question. */
                  <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: T.ink }}>
                      {q.type === "number"
                        ? (s.total == null ? "—" : s.total)
                        : (s.average == null ? "—" : s.average)}
                      <span style={{ fontSize: 14, fontWeight: 600, color: T.sub, marginLeft: 6 }}>
                        {q.type === "number" ? "total" : "average"}
                      </span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.sub }}>
                      {q.type === "number"
                        ? (s.average == null ? "" : `${s.average} average`)
                        : (s.total == null ? "" : `${s.total} total`)}
                    </div>
                  </div>
                )}
                {s.kind === "tally" && (
                  <TallySummary q={q} summary={s} values={valuesFor(q.id)} rows={rowsFor(q.id)} />
                )}
                {s.kind === "text" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {s.samples.map((t, i) => (
                      <div key={i} style={{ fontSize: 14.5, color: T.sub, lineHeight: 1.5, background: T.inset, borderRadius: 8, padding: "8px 10px" }}>
                        {t}
                      </div>
                    ))}
                    {!s.samples.length && <div style={{ fontSize: 14, color: T.faint, fontStyle: "italic" }}>No answers.</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {responses.map((r) => (
            <div key={r.id} style={{ ...card, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 15.5, fontWeight: 700, color: T.ink }}>
                  {form.anonymous ? "Anonymous" : r.respondent_name || "—"}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 13, color: T.faint }}>
                  {new Date(r.created_at).toLocaleDateString("en-US")}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {questions.map((q) => {
                  const v = byResponse[r.id]?.[q.id];
                  if (v == null || v === "") return null;
                  return (
                    <div key={q.id}>
                      <div style={{ fontSize: 13.5, color: T.faint }}>{q.label}</div>
                      <div style={{ fontSize: 15, color: T.ink }}>
                        {Array.isArray(v) ? v.join(", ") : String(v)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Sheet({ title, children, onClose }) {
  return (
    <div onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(10,12,16,.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60,
      }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          background: T.bg, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto",
          borderRadius: "18px 18px 0 0", padding: 18, display: "flex", flexDirection: "column", gap: 12,
        }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 18.5, fontWeight: 800, color: T.ink }}>{title}</div>
          <Btn kind="plain" size="sm" onClick={onClose}><X size={18} /></Btn>
        </div>
        {children}
      </div>
    </div>
  );
}

// Builds "Sat, Sep 12 8:00 AM ×4" lines from a start date and a repeat.
function DateSlots({ onGenerate }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [rule, setRule] = useState("weekly");
  const [count, setCount] = useState(6);
  const [time, setTime] = useState("");
  const [spots, setSpots] = useState(4);

  const preview = useMemo(() => {
    if (!start) return [];
    const n = Math.max(1, Math.min(30, Number(count) || 1));
    const dates = occurrencesBetween(
      { event_date: start, repeat_rule: rule },
      start,
      // far enough ahead that `count` is what actually limits it
      toIso(new Date(new Date(`${start}T00:00:00`).getTime() + 400 * 86400000)),
      n
    ).slice(0, n);
    return dates.map((d) =>
      `${slotLabel(d)}${time.trim() ? ` ${time.trim()}` : ""} ×${Math.max(1, Number(spots) || 1)}`);
  }, [start, rule, count, time, spots]);

  if (!open) {
    return (
      <Btn kind="plain" size="sm" onClick={() => setOpen(true)}>
        <CalendarPlus size={14} />Generate Dated Slots
      </Btn>
    );
  }

  return (
    <div style={{ background: T.inset, borderRadius: 10, padding: 11, display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ fontSize: 13, color: T.sub }}>
        One slot per date — for a job that runs on several dates, like temple cleaning.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Lbl label="First date">
          <Input type="date" value={start} onChange={setStart} />
        </Lbl>
        <Lbl label="Repeats">
          <Select value={rule} onChange={setRule}>
            {REPEAT_RULES.filter((r) => r.key).map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </Select>
        </Lbl>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Lbl label="How many">
          <Input type="number" value={count} onChange={setCount} />
        </Lbl>
        <Lbl label="Time (optional)">
          <Input value={time} onChange={setTime} placeholder="8:00 AM" />
        </Lbl>
        <Lbl label="Spots each">
          <Input type="number" value={spots} onChange={setSpots} />
        </Lbl>
      </div>

      {preview.length > 0 && (
        <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.6, fontFamily: "ui-monospace, monospace" }}>
          {preview.slice(0, 4).map((l) => <div key={l}>{l}</div>)}
          {preview.length > 4 && <div style={{ color: T.faint }}>…and {preview.length - 4} more</div>}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <Btn kind="primary" size="sm" disabled={!preview.length}
          onClick={() => { onGenerate(preview.join("\n")); setOpen(false); }}>
          Add {preview.length || ""} Slots
        </Btn>
        <Btn kind="plain" size="sm" onClick={() => setOpen(false)}>Cancel</Btn>
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
