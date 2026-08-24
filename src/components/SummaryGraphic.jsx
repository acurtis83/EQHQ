import { useCallback, useMemo, useRef, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { T, Btn } from "./ui";
import {
  buildSummaryChart, chartFilename, CHART_W, M,
  INK, SUB, FAINT, RULE, TRACK, FILL, FULL,
} from "../lib/domain/summaryChart";

const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * The sign-up state as a picture, and a PNG of it to send.
 *
 * Plain SVG rectangles and text, not HTML in a foreignObject: this has to
 * rasterise through a canvas so it can be saved or pasted into a message, and
 * foreignObject content is dropped — or taints the canvas — in most browsers.
 * Everything it draws is positioned by buildSummaryChart, which is arithmetic
 * and testable without a browser.
 */
export default function SummaryGraphic({
  form, questions, responses, byResponse, todayIso, showNames = true,
}) {
  const svgRef = useRef(null);
  const [state, setState] = useState("");

  const chart = useMemo(
    () => buildSummaryChart({ form, questions, responses, byResponse, todayIso, showNames }),
    [form, questions, responses, byResponse, todayIso, showNames]
  );

  /**
   * Rasterise at 2x so it isn't soft on a phone screen.
   *
   * The SVG goes in as a data URL rather than a blob URL: a blob URL from
   * another origin taints the canvas and toBlob then throws, which is a
   * miserable thing to debug from a screenshot.
   */
  const toPng = useCallback(async () => {
    const svg = svgRef.current;
    if (!svg) return null;
    const source = new XMLSerializer().serializeToString(svg);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;

    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("render"));
      img.src = url;
    });

    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = chart.width * scale;
    canvas.height = chart.height * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }, [chart.width, chart.height]);

  const flash = (s) => { setState(s); setTimeout(() => setState(""), 2000); };

  const save = async () => {
    try {
      const blob = await toPng();
      if (!blob) throw new Error("render");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = chartFilename(form, todayIso);
      a.click();
      URL.revokeObjectURL(a.href);
      flash("saved");
    } catch {
      flash("failed");
    }
  };

  const copy = async () => {
    try {
      const blob = await toPng();
      if (!blob || !window.ClipboardItem || !navigator.clipboard?.write) throw new Error("clipboard");
      await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
      flash("copied");
    } catch {
      // Safari on iOS won't write an image to the clipboard from a promise it
      // didn't start synchronously. Saving works there, so say so.
      flash("nocopy");
    }
  };

  const text = (x, y, size, weight, fill, anchor) => ({
    x, y, fontFamily: SANS, fontSize: size, fontWeight: weight, fill,
    ...(anchor ? { textAnchor: anchor } : {}),
  });

  return (
    <div>
      <div style={{
        border: `1px solid ${T.lineSoft}`, borderRadius: 12, overflow: "hidden",
        background: "#fff",
      }}>
        <svg
          ref={svgRef}
          xmlns="http://www.w3.org/2000/svg"
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          width="100%"
          style={{ display: "block" }}
        >
          <rect x="0" y="0" width={chart.width} height={chart.height} fill="#ffffff" />

          <text {...text(M.pad, chart.y.titleY, M.titleSize, 800, INK)}>{chart.title}</text>
          <text {...text(M.pad, chart.y.dateY, M.dateSize, 600, FAINT)}>{chart.dateLine}</text>
          <line
            x1={M.pad} y1={chart.y.headRuleY} x2={CHART_W - M.pad} y2={chart.y.headRuleY}
            stroke={INK} strokeWidth="2"
          />

          {chart.empty && (
            <text {...text(M.pad, chart.y.headRuleY + 34, 15, 600, SUB)}>No responses yet.</text>
          )}

          {chart.headcount && (
            <>
              <text {...text(M.pad, chart.y.countY, M.countSize, 800, INK)}>
                {chart.headcount.total}
              </text>
              <text {...text(
                M.pad + String(chart.headcount.total).length * M.countSize * 0.62 + 10,
                chart.y.countY, M.countLabelSize, 700, SUB
              )}>
                COMING
              </text>
              <text {...text(
                M.pad + String(chart.headcount.total).length * M.countSize * 0.62 + 10,
                chart.y.countY + 15, M.countLabelSize, 600, FAINT
              )}>
                {chart.responseCount} response{chart.responseCount === 1 ? "" : "s"}
              </text>
            </>
          )}

          {chart.sections.map((s) => (
            <g key={s.label}>
              <text {...text(M.pad, s.y, M.sectionSize, 800, INK)}>
                {s.label.toUpperCase()}
              </text>
              <text {...text(CHART_W - M.pad, s.y, M.sectionSize, 700, FAINT, "end")}>
                {s.totals.taken} of {s.totals.needed} filled
              </text>

              {s.slots.map((slot) => (
                <g key={slot.label}>
                  <text {...text(M.pad, slot.y, M.slotSize, 700, INK)}>{slot.label}</text>
                  <text {...text(CHART_W - M.pad, slot.y, M.slotSize, 700, slot.full ? FULL : SUB, "end")}>
                    {slot.full ? `${slot.taken} of ${slot.limit} — full` : `${slot.taken} of ${slot.limit}`}
                  </text>

                  {/* The bar is the whole point: a third-full slot has to look
                      different from a full one at a glance. */}
                  <rect
                    x={M.pad} y={slot.barY} width={chart.inner} height={M.barH}
                    rx="2" fill={TRACK}
                  />
                  {slot.taken > 0 && (
                    <rect
                      x={M.pad} y={slot.barY} rx="2" height={M.barH}
                      width={Math.max(3, chart.inner * Math.min(1, slot.taken / slot.limit))}
                      fill={slot.full ? FULL : FILL}
                    />
                  )}

                  {slot.nameLines.map((line, i) => (
                    <text key={i} {...text(M.pad, slot.namesY + i * M.nameLead, M.nameSize, 500, SUB)}>
                      {line}
                    </text>
                  ))}
                </g>
              ))}
            </g>
          ))}

          {chart.gaps.length > 0 && (
            <g>
              <text {...text(M.pad, chart.y.gapsY, M.sectionSize, 800, INK)}>STILL NEEDED</text>
              {chart.gaps.map((line, i) => (
                <text key={i} {...text(M.pad, chart.y.gapsFirstY + i * M.nameLead, M.nameSize, 600, SUB)}>
                  {line}
                </text>
              ))}
            </g>
          )}

          <line
            x1={M.pad} y1={chart.y.footRuleY} x2={CHART_W - M.pad} y2={chart.y.footRuleY}
            stroke={RULE} strokeWidth="1"
          />
          <text {...text(M.pad, chart.y.footY, 10, 600, FAINT)}>
            Elders Quorum · Holbrook Farms 8th Ward
          </text>
        </svg>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 11 }}>
        <Btn kind="primary" onClick={save}>
          {state === "saved" ? <Check size={14} /> : <Download size={14} />}
          {state === "saved" ? "Saved" : "Save Image"}
        </Btn>
        <Btn kind="ghost" onClick={copy}>
          {state === "copied" ? <Check size={14} /> : <Copy size={14} />}
          {state === "copied" ? "Copied" : "Copy Image"}
        </Btn>
      </div>

      {state === "nocopy" && (
        <div style={{ fontSize: 13.5, color: T.sub, marginTop: 8, lineHeight: 1.5 }}>
          This browser wouldn't take the image — use Save Image and attach it instead.
        </div>
      )}
      {state === "failed" && (
        <div style={{ fontSize: 13.5, color: T.red, marginTop: 8, lineHeight: 1.5 }}>
          The image couldn't be made. The text summary still works.
        </div>
      )}
    </div>
  );
}
