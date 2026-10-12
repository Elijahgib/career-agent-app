import { CONCEPTS } from "./concepts";

// Text normalisation that preserves string length, so spans found in the
// normalised text map 1:1 onto the original text.
export function normalizeText(input: string): string {
  let out = "";
  for (const ch of input) {
    let c = ch;
    if (c === "-" || c === "‐" || c === "–" || c === "—" || c === "_") c = " ";
    else if (c === "’" || c === "‘") c = "'";
    else if (c === "“" || c === "”") c = '"';
    else {
      const lower = c.toLowerCase();
      c = lower.length === c.length ? lower : c;
    }
    out += c;
  }
  // Collapse nothing: length must be preserved. Code points outside the BMP
  // are fine because we iterate and rebuild with the same units.
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Builds a word-boundary regex for a phrase; tolerates plural s/es and flexible whitespace. */
export function phraseRegex(phrase: string, flags = "g"): RegExp {
  const norm = normalizeText(phrase).trim().replace(/\s+/g, " ");
  const body = escapeRegex(norm).replace(/ /g, "\\s+");
  const pluralOk = /[a-z]$/.test(norm);
  return new RegExp(`(?<![a-z0-9])${body}${pluralOk ? "(?:s|es)?" : ""}(?![a-z0-9])`, flags);
}

export interface Span {
  start: number;
  end: number;
}

export interface ConceptMention extends Span {
  conceptId: string;
  text: string;
}

interface AliasMatcher {
  conceptId: string;
  alias: string;
  re: RegExp;
  /** Match against the original text, case-sensitively (acronyms such as "AD"). */
  exact?: boolean;
}

let MATCHERS: AliasMatcher[] | null = null;

function matchers(): AliasMatcher[] {
  if (MATCHERS) return MATCHERS;
  const seen = new Set<string>();
  const list: AliasMatcher[] = [];
  for (const c of CONCEPTS) {
    for (const a of [c.label, ...c.aliases]) {
      // Labels with punctuation (e.g. "Help desk / IT support") are display-only.
      if (a === c.label && /[/()]/.test(a)) continue;
      const key = `${c.id}::${normalizeText(a).trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ conceptId: c.id, alias: a, re: phraseRegex(a) });
    }
    for (const a of c.acronyms ?? []) {
      list.push({ conceptId: c.id, alias: a, re: new RegExp(`(?<![A-Za-z0-9])${escapeRegex(a)}(?![A-Za-z0-9])`, "g"), exact: true });
    }
  }
  MATCHERS = list;
  return list;
}

/** All concept mentions in a text. Same-concept overlaps keep the longest span. */
export function detectConcepts(text: string): ConceptMention[] {
  if (!text) return [];
  const norm = normalizeText(text);
  const raw: ConceptMention[] = [];
  for (const m of matchers()) {
    m.re.lastIndex = 0;
    let r: RegExpExecArray | null;
    while ((r = m.re.exec(m.exact ? text : norm))) {
      raw.push({ conceptId: m.conceptId, start: r.index, end: r.index + r[0].length, text: text.slice(r.index, r.index + r[0].length) });
      if (r[0].length === 0) m.re.lastIndex++;
    }
  }
  raw.sort((a, b) => b.end - b.start - (a.end - a.start));
  const kept: ConceptMention[] = [];
  for (const m of raw) {
    const dup = kept.some((k) => k.conceptId === m.conceptId && k.start <= m.end && m.start <= k.end);
    if (!dup) kept.push(m);
  }
  return kept.sort((a, b) => a.start - b.start);
}

export function detectConceptIds(text: string): Set<string> {
  return new Set(detectConcepts(text).map((m) => m.conceptId));
}

/** Word-boundary search for an arbitrary phrase (case/hyphen-insensitive). */
export function findPhrase(text: string, phrase: string): Span[] {
  if (!phrase.trim()) return [];
  const re = phraseRegex(phrase);
  const norm = normalizeText(text);
  const spans: Span[] = [];
  let r: RegExpExecArray | null;
  while ((r = re.exec(norm))) {
    spans.push({ start: r.index, end: r.index + r[0].length });
    if (r[0].length === 0) re.lastIndex++;
  }
  return spans;
}

export function containsPhrase(text: string, phrase: string): boolean {
  return findPhrase(text, phrase).length > 0;
}

/** Replace spans with spaces (length preserving). */
export function maskSpans(text: string, spans: Span[]): string {
  if (!spans.length) return text;
  // Spans are UTF-16 offsets, so split into UTF-16 units.
  const chars = text.split("");
  for (const s of spans) for (let i = s.start; i < s.end && i < chars.length; i++) chars[i] = " ";
  return chars.join("");
}

export function spanContains(outer: Span, inner: Span): boolean {
  return outer.start <= inner.start && inner.end <= outer.end && (outer.end - outer.start) > (inner.end - inner.start);
}

/** Mentions not strictly contained in a longer mention (e.g. "Windows administration" → only windows-admin). */
export function detectTopLevelConcepts(text: string): ConceptMention[] {
  const all = detectConcepts(text);
  return all.filter((m) => !all.some((o) => o !== m && spanContains(o, m)));
}

export function detectTopLevelConceptIds(text: string): Set<string> {
  return new Set(detectTopLevelConcepts(text).map((m) => m.conceptId));
}

/**
 * Concepts that a short phrase *is* (a mention covering ≥80% of it).
 * "Windows administration" → windows-admin; "Active Directory administration" → none,
 * because it is a narrower phrase than the concept it contains.
 */
export function phraseConceptIds(phrase: string): Set<string> {
  const len = normalizeText(phrase).trim().length;
  const lead = normalizeText(phrase).length - normalizeText(phrase).trimStart().length;
  const out = new Set<string>();
  if (!len) return out;
  for (const m of detectTopLevelConcepts(phrase)) {
    if (m.end - m.start >= Math.max(1, Math.floor(len * 0.8)) && m.start <= lead + Math.ceil(len * 0.2)) out.add(m.conceptId);
  }
  return out;
}
