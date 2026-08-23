import { T, Btn } from "./ui";

/** The bottom sheet used for anything that needs the whole screen's attention. */
export default function Sheet({ title, onClose, children }) {
  return (
    <div onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(10,12,16,.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60,
      }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          background: T.bg, width: "100%", maxWidth: 560, borderRadius: "18px 18px 0 0",
          padding: 18, display: "flex", flexDirection: "column", gap: 11,
          maxHeight: "90vh", overflowY: "auto",
        }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 18.5, fontWeight: 800, color: T.ink }}>{title}</div>
          <Btn kind="plain" size="sm" onClick={onClose}>Close</Btn>
        </div>
        {children}
      </div>
    </div>
  );
}
