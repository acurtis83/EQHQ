// Roster parsing, carried over from the legacy EQ Planner.
// parseRoster reads a pasted LDS Tools / Ward Directory export and is the
// fastest way to populate the roster — keep it.

export const OFFICES = [
  "High Priest", "Elder", "Priest", "Teacher",
  "Deacon", "Unordained", "Bishop", "Patriarch", "Seventy",
];

export const BANDS = ["18–35", "36–45", "46–64", "65+", "Unknown"];

export function bandForAge(a) {
  if (a == null || isNaN(a)) return "Unknown";
  if (a <= 35) return "18–35";
  if (a <= 45) return "36–45";
  if (a <= 64) return "46–64";
  return "65+";
}

// Turn "Last, First Middle" (or "Last, First, Middle") into "First Last"
export function normalizeName(raw) {
  const s = (raw || "").replace(/\s+/g, " ").trim();
  if (!s.includes(",")) return s;
  const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  const last = parts[0] || "";
  const rest = parts.slice(1).join(" ").trim();
  const first = rest.split(" ")[0] || "";
  return (first ? first + " " : "") + last;
}

export function lastNameOf(raw) {
  const s = (raw || "").trim();
  if (!s) return "";
  return s.includes(",") ? s.split(",")[0].trim() : s.split(/\s+/).pop();
}

export function parseRoster(text) {
  const skip = /^(Ward Directory|Directory|Description|Edit Report|Count:|Search|Your report|Preferred Name|Priesthood|Birth Date|Name\b|Age\b)/i;
  const reFull = /^(.+?)\s+([MF])\s+(\d{1,3})\s+(\d{1,2}\s+[A-Za-z]{3,}\.?\s+\d{4})(.*)$/;
  const reDate = /(\d{1,2}\s+[A-Za-z]{3,}\.?\s+\d{4}|[A-Za-z]{3,}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})/;
  const out = [];

  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/\t/g, " ").replace(/\s+/g, " ").trim();
    if (!line || skip.test(line)) continue;

    // Trailing priesthood office, if present
    let office = "";
    for (const o of OFFICES) {
      const re = new RegExp("\\s" + o.replace(" ", "\\s") + "\\s*$", "i");
      if (re.test(line)) {
        office = o;
        line = line.replace(re, "").trim();
        break;
      }
    }

    // Full LDS export: Name  Sex  Age  BirthDate  phone/email…
    const mf = line.match(reFull);
    if (mf) {
      const age = parseInt(mf[3], 10);
      const rest = mf[5] || "";
      const email = (rest.match(/[\w.+-]+@[\w.-]+\.\w{2,}/) || [])[0] || "";
      const phone = (rest.match(/\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/) || [])[0] || "";
      out.push({
        name: normalizeName(mf[1]),
        last_name: lastNameOf(mf[1]),
        age,
        birth_date: mf[4].trim(),
        phone,
        email,
        office,
        band: bandForAge(age),
        calling: "",
        active: true,
      });
      continue;
    }

    // Trailing birth date, if present
    let birthDate = "";
    const dm = line.match(new RegExp(reDate.source + "\\s*$"));
    if (dm) {
      birthDate = dm[0].trim();
      line = line.slice(0, dm.index).replace(/[,\s]+$/, "").trim();
    }

    // "Name  Age" — name may be "Last, First Middle"; age is the trailing number.
    const am = line.match(/(\d{1,3})\s*$/);
    if (!am) continue;
    const age = parseInt(am[1], 10);
    const namePart = line.slice(0, am.index).replace(/[,\s]+$/, "").trim();
    if (age < 1 || age > 120) continue;
    const looksLikeName =
      /[A-Za-z]/.test(namePart) &&
      (namePart.includes(",") || namePart.split(/\s+/).length >= 2);
    if (!looksLikeName) continue;

    out.push({
      name: normalizeName(namePart),
      last_name: lastNameOf(namePart),
      age,
      birth_date: birthDate,
      phone: "",
      email: "",
      office,
      band: bandForAge(age),
      calling: "",
      active: true,
    });
  }
  return out;
}
