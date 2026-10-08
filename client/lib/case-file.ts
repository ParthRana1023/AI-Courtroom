import type { EvidenceItem } from "@/types";

/**
 * Reads the generated petition (server `case_generation.py`) into the six sections of the
 * indexed case file: I Summary · II Parties · III Facts · IV Charges · V Evidence · VI Issues.
 *
 * The petition marks every main header as a bold upper-case line ending with a colon
 * (`**GROUNDS:**`). If no known header is found, the whole text becomes the summary, so
 * nothing is lost on a case written in another shape.
 */

export type Row = { label: string; text: string };
export type Item = { mark: string; title?: string; text: string };
export type Exhibit = { ref: string; title: string; text: string };

export type CaseFile = {
  court: string;
  charges: string[];
  summary: string[];
  relief: Item[];
  parties: Row[];
  facts: Item[];
  chronology: Row[];
  counts: Row[];
  exhibits: Exhibit[];
  issues: Item[];
};

export const SECTIONS = [
  ["summary", "Case summary"],
  ["parties", "Parties"],
  ["facts", "Facts of the case"],
  ["charges", "Charges"],
  ["evidence", "Evidence"],
  ["issues", "Issues for the court"],
] as const;

export type SectionId = (typeof SECTIONS)[number][0];

export const NUMERALS = ["I", "II", "III", "IV", "V", "VI"];

/** `**bold**` markers removed and whitespace collapsed; the petition uses no other markdown inline. */
export const plain = (s: string) => s.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "NON-APPLICANT NO. 2" → "Non-applicant No. 2", "HIGH COURT OF DELHI" → "High Court of Delhi". */
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, (_, sp: string, c: string) => sp + c.toUpperCase())
    .replace(/ (Of|And|At|The) /g, (w) => w.toLowerCase());

function isHeader(line: string) {
  const m = line.trim().match(/^\*\*(.+):\*\*$/);
  if (!m) return null;
  const letters = m[1].replace(/[^A-Za-z]/g, "");
  return letters && letters.replace(/[^A-Z]/g, "").length / letters.length >= 0.8 ? m[1].trim() : null;
}

function split(text: string) {
  const blocks: { head: string; lines: string[] }[] = [{ head: "", lines: [] }];
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const head = isHeader(line);
    if (head) blocks.push({ head, lines: [] });
    else blocks[blocks.length - 1].lines.push(line);
  }
  const find = (re: RegExp) => blocks.find((b) => re.test(b.head));
  return { blocks, find };
}

const isNote = (line: string) => /^\(.*\)$/.test(line);

/** Numbered ("1. That …") or lettered ("A. **Title:** …") paragraphs, continuation lines joined. */
function paragraphs(lines: string[], marker: RegExp) {
  const out: { mark: string; body: string }[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || isNote(line)) continue;
    const m = line.match(marker);
    if (m) out.push({ mark: m[1], body: line.slice(m[0].length) });
    else if (out.length) out[out.length - 1].body += " " + line;
  }
  return out;
}

/** "- **Label:** text" bullets (top level only), continuation lines joined. */
function bullets(lines: string[]) {
  const out: Row[] = [];
  for (const raw of lines) {
    const m = raw.match(/^-\s+\*\*(.+?):?\*\*:?\s*(.*)$/);
    if (m) out.push({ label: plain(m[1]).replace(/:$/, ""), text: plain(m[2]) });
    else if (out.length && raw.trim() && !isNote(raw.trim())) {
      const last = out[out.length - 1];
      last.text = plain(`${last.text} ${raw}`);
    }
  }
  return out;
}

const SECTION_RE = /^Section\s+(\d+[A-Z]?)\s+BNS\s*[-–—:]\s*/i;

/** "Section 318 BNS - Cheating" → "§ 318 BNS · Cheating" */
const countLabel = (s: string) => s.replace(SECTION_RE, "§ $1 BNS · ");

/** "Section 318 BNS - Cheating" → "§ 318 Cheating", the short line under the title. */
const shortCharge = (s: string) => s.replace(SECTION_RE, "§ $1 ");

const stripThat = (s: string) => sentence(plain(s).replace(/^That\s+/i, ""));

export function readCaseFile(text: string, evidence: EvidenceItem[] = []): CaseFile {
  const { blocks, find } = split(text || "");

  const courtLine = blocks[0].lines.find((l) => /^\*\*IN THE /i.test(l.trim()));
  const court = courtLine ? titleCase(plain(courtLine).replace(/^IN THE\s+/i, "")) : "";

  // II. Parties: "1. **Name**, details ... **APPLICANT**" under IN THE MATTER OF.
  const parties: Row[] = [];
  for (const line of find(/^IN THE MATTER OF/i)?.lines ?? []) {
    const m = line.trim().match(/^\d+\.\s+(.*?)\s*\.{2,}\s*\*\*(.+?)\*\*\s*$/);
    if (m) parties.push({ label: titleCase(plain(m[2])), text: plain(m[1]).replace(/,\s*$/, "") });
  }

  // I and III: the "That …" paragraphs. The first three set out the case; the rest are facts.
  const sheweth = paragraphs(find(/SHEWETH/i)?.lines ?? [], /^(\d+)\.\s+/);
  const summary = sheweth.slice(0, 3).map((p) => stripThat(p.body));
  const facts: Item[] = sheweth.slice(3).map((p, i) => ({ mark: `${i + 1}.`, text: stripThat(p.body) }));

  const relief: Item[] = [];
  for (const raw of find(/^PRAYER/i)?.lines ?? []) {
    const m = raw.trim().match(/^\(([a-z])\)\s+(.*)$/);
    if (m) relief.push({ mark: `(${m[1]})`, text: sentence(plain(m[2]).replace(/[;.]\s*(and)?$/i, "")) });
  }

  const chronology = bullets(find(/CHRONOLOGY/i)?.lines ?? []);

  // IV. Charges: the requested sections, then the related ones.
  const main = bullets(find(/^BNS SECTIONS/i)?.lines ?? []);
  const related = bullets(find(/^RELATED BNS/i)?.lines ?? []).filter((r) => !main.some((m) => m.label === r.label));
  const counts = [...main, ...related].map((r) => ({ label: countLabel(r.label), text: r.text }));

  // V. Evidence: the structured exhibits; the petition's own list if none were extracted.
  const exhibits: Exhibit[] = evidence.length
    ? evidence.map((e) => ({ ref: e.exhibit_ref, title: e.title, text: e.description }))
    : bullets((find(/^EVIDENCE/i)?.lines ?? []).map((l) => l.replace(/^\s{2,}-/, "-")))
        .filter((r) => !/^(Eyewitness|Physical|Witness Name|Testimony)/i.test(r.label))
        .map((r, i) => ({ ref: `E-${i + 1}`, title: r.label, text: r.text.replace(/^\(Annexure [^)]*\)\s*/i, "") }));

  // VI. Issues: the lettered grounds.
  const issues: Item[] = paragraphs(find(/^GROUNDS/i)?.lines ?? [], /^([A-Z])\.\s+/).map((g) => {
    const m = g.body.match(/^\*\*(.+?):?\*\*:?\s*(.*)$/);
    return m
      ? { mark: `${g.mark}.`, title: plain(m[1]).replace(/:$/, ""), text: plain(m[2]) }
      : { mark: `${g.mark}.`, text: plain(g.body) };
  });

  const recognised = parties.length + sheweth.length + counts.length + issues.length > 0;
  const petition = blocks.find((b) => /^PETITION\b/i.test(b.head));
  return {
    court,
    charges: main.map((r) => shortCharge(r.label)),
    summary: !recognised
      ? (text || "").split(/\n{2,}/).map(plain).filter(Boolean)
      : summary.length
        ? summary
        : petition
          ? [sentence(plain(petition.head).toLowerCase())]
          : [],
    relief,
    parties,
    facts,
    chronology,
    counts,
    exhibits,
    issues,
  };
}

/** Who each side represents, for the side dialog: the applicants vs. the non-applicants. */
export function sideNames(parties: Row[]) {
  const name = (r: Row) => r.text.split(",")[0].trim();
  const join = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  const applicants = parties.filter((p) => /^Applicant/i.test(p.label)).map(name);
  const others = parties.filter((p) => /^Non-applicant/i.test(p.label)).map(name);
  return { plaintiff: join(applicants) || "the applicant", defendant: join(others) || "the non-applicants" };
}
