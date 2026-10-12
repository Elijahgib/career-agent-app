// Lexical rules used by the Truth Gate. Kept separate so they are easy to
// audit and extend; every list here is covered by tests/truth-gate.

/** Phrases that assert professional experience or proficiency. */
export const PROFESSIONAL_ASSERTION =
  /\b(experienced|experience (in|with)|professional(ly)?|years? of|proven|expert(ise)?|proficient|proficiency|skilled|hands[ -]on|track record|background in|seasoned|specialist in|extensive)\b/i;

/** Phrases that mark a statement as learning / lab / coursework. */
export const LEARNING_QUALIFIER =
  /\b(learning|studying|study|coursework|course|courses|training|home ?lab|lab|labs|practice|practicing|practiced|self[- ]study|self[- ]taught|in progress|pursuing|preparing|bootcamp|certificate program|class|classes|capstone|personal project|side project|tutorial|exam)\b/i;

/** Credential-holding language for certifications. */
export const CREDENTIAL_ASSERTION = /\b(certified|certificate holder|earned|holds?|credentialed|licensed)\b/i;

/**
 * Responsibility-inflation groups. If a claim uses a word from a group, at least
 * one supporting fact must use a word from the same group.
 */
export const INFLATION_GROUPS: { id: string; label: string; words: string[] }[] = [
  { id: "lead", label: "leadership", words: ["led", "lead", "leading", "leads", "leader", "leadership", "headed", "spearheaded", "directed", "director"] },
  { id: "manage", label: "management responsibility", words: ["managed", "manage", "manages", "managing", "manager", "management"] },
  { id: "supervise", label: "supervision", words: ["supervised", "supervise", "supervising", "supervisor", "oversaw", "oversee", "oversees", "overseeing", "oversight"] },
  { id: "own", label: "ownership", words: ["owned", "owner", "ownership", "accountable"] },
  { id: "architect", label: "design authority", words: ["architected", "architect", "pioneered", "championed", "engineered", "designed"] },
  { id: "senior", label: "seniority", words: ["senior", "principal", "expert", "guru", "veteran", "seasoned"] },
  { id: "mentor", label: "training others", words: ["mentored", "mentoring", "coached", "trained"] },
  { id: "scale", label: "organizational scope", words: ["enterprise-wide", "company-wide", "organization-wide", "companywide", "nationwide", "global", "globally", "all locations", "entire"] },
  { id: "outcome", label: "a measured outcome", words: ["reduced", "increased", "improved", "boosted", "saved", "decreased", "grew", "maximized", "minimized", "optimized", "streamlined", "accelerated", "lowered", "cut"] },
  { id: "implement", label: "implementation responsibility", words: ["implemented", "deployed", "rolled out", "migrated", "administered", "administer", "administering"] },
];

/** Connectives allowed between candidate and target segments of a BRIDGE claim. */
export const BRIDGE_CONNECTIVES = [
  "is relevant to",
  "should transfer well to",
  "transfers to",
  "gives me a foundation for",
  "relates to",
  "is related to",
];

/** Target segments must clearly refer to the employer's role, not the candidate. */
export const TARGET_REFERENCE = /\b(this role|this position|this posting|the role|the position|the posting|your team|the team)\b/i;

export const HONEST_GAP_CONNECTIVES = [
  "i haven't",
  "i have not",
  "i don't yet have",
  "i do not yet have",
  "professionally yet",
  "yet",
  "professionally",
  "but",
  "and",
];

const NUMBER_WORDS: Record<string, string> = {
  two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17",
  eighteen: "18", nineteen: "19", twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60",
  seventy: "70", eighty: "80", ninety: "90",
};

const VAGUE_QUANTITIES = ["dozens", "hundreds", "thousands", "millions", "countless", "numerous"];

export interface NumericToken {
  raw: string;
  core: string; // digits only, e.g. "1200", "35"
  plus: boolean; // "20+", "over 20", "more than 20"
}

/** Extract numbers and vague quantities ("hundreds of") from text. */
export function extractNumbers(text: string): NumericToken[] {
  const out: NumericToken[] = [];
  let t = text;
  for (const [w, d] of Object.entries(NUMBER_WORDS)) t = t.replace(new RegExp(`\\b${w}\\b`, "gi"), d);
  const re = /(over|more than|nearly|almost|approximately|about|~)?\s*\$?(\d[\d,]*(?:\.\d+)?)\s*(%|k\b|m\b|\+|x\b)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const core = m[2].replace(/,/g, "");
    out.push({ raw: m[0].trim(), core, plus: m[3] === "+" || /over|more than/i.test(m[1] ?? "") });
  }
  for (const v of VAGUE_QUANTITIES) {
    if (new RegExp(`\\b${v}\\b`, "i").test(text)) out.push({ raw: v, core: v, plus: false });
  }
  return out;
}

const STOP = new Set([
  "i", "i'm", "i've", "my", "me", "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with", "at", "by",
  "dear", "sincerely", "regards", "thank", "thanks", "hiring", "team", "manager", "position", "role", "posting",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  "present", "current", "us", "usa",
]);

/** Tokens that look like proper nouns, acronyms, product or tool names. */
export function properTerms(text: string): { token: string; index: number }[] {
  const out: { token: string; index: number }[] = [];
  const re = /[A-Za-z0-9][A-Za-z0-9+#.']*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let token = m[0].replace(/[.']+$/, "");
    if (!token) continue;
    if (/^\d[\d.,]*$/.test(token)) continue; // numbers are handled by the metric rule
    const idx = m.index;
    const before = text.slice(0, idx).replace(/\s+$/, "");
    const prev = before.slice(-1);
    const sentenceInitial = before.length === 0 || /[.!?:;•(\-–—"\n]/.test(prev);
    const hasInnerUpper = /[a-z0-9].*[A-Z]/.test(token) || /^[a-z]+[A-Z]/.test(token);
    const allCaps = /^[A-Z][A-Z0-9+#&]+$/.test(token) && /[A-Z].*[A-Z]|[A-Z][0-9+#]/.test(token);
    const alnumMix = /[A-Za-z]/.test(token) && /\d/.test(token);
    const capitalized = /^[A-Z]/.test(token) && !sentenceInitial;
    if (token === "I") continue;
    if (hasInnerUpper || allCaps || alnumMix || capitalized) {
      if (STOP.has(token.toLowerCase())) continue;
      token = token.replace(/'s$/i, "");
      out.push({ token, index: idx });
    }
  }
  return out;
}

export function vocabularyOf(...texts: (string | null | undefined)[]): Set<string> {
  const v = new Set<string>(STOP);
  for (const t of texts) {
    if (!t) continue;
    for (const tok of t.toLowerCase().split(/[^a-z0-9+#.']+/)) {
      const clean = tok.replace(/^[.']+|[.']+$/g, "").replace(/'s$/, "");
      if (clean) v.add(clean);
    }
  }
  return v;
}
