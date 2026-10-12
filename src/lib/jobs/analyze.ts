// Turns a job posting into structured, explainable requirements.
// Everything parsed from free text is at most LIKELY; only structured ATS
// fields are VERIFIED (and only as of lastVerifiedAt).

import type { ClearanceLevel, DegreeLevel, EmploymentType, JobRecord, RemoteType } from "@/lib/domain/types";
import { conceptLabel, getConcept, type ConceptKind } from "@/lib/ontology/concepts";
import { detectConcepts, normalizeText, spanContains } from "@/lib/ontology/detect";
import { annualize, parseEmploymentType } from "./normalize";

export const ANALYZER_VERSION = "job-analyzer/1.0.0";

export type ReqImportance = "REQUIRED" | "PREFERRED" | "RESPONSIBILITY" | "UNSPECIFIED";

export interface RequirementItem {
  conceptId: string;
  label: string;
  kind: ConceptKind;
  importance: ReqImportance;
  /** Requirements joined by "or" share a group; any one satisfies it. */
  group?: string;
  /** The posting line this came from. */
  evidenceText: string;
  orEquivalent: boolean;
}

export interface JobAnalysis {
  version: string;
  requirements: RequirementItem[];
  minYears: { years: number; text: string; importance: ReqImportance } | null;
  degree: { level: DegreeLevel; importance: ReqImportance; equivalencyAllowed: boolean; text: string } | null;
  clearance: { level: ClearanceLevel; mustHaveActive: boolean; text: string } | null;
  licenses: { conceptId: string; importance: ReqImportance; text: string }[];
  employmentType: { value: EmploymentType; source: "STRUCTURED" | "TEXT" | "NONE" };
  remote: { value: RemoteType; source: "STRUCTURED" | "TEXT" | "NONE"; restriction?: string };
  salary: {
    min: number | null;
    max: number | null;
    period: "YEAR" | "HOUR" | null;
    annualMin: number | null;
    annualMax: number | null;
    source: "STRUCTURED" | "TEXT" | "NONE";
    text?: string;
  };
  seniority: "ENTRY" | "MID" | "SENIOR" | "LEAD" | "UNKNOWN";
  travelPercent: number | null;
  /** "Must"/"required" lines the analyzer could not interpret — shown as UNKNOWN, never guessed. */
  uninterpretedRequirements: string[];
  environments: string[];
}

const HEADING_DEFS: { alts: string[]; importance: ReqImportance | "OTHER" }[] = [
  {
    alts: ["preferred qualifications", "preferred skills", "preferred experience", "additional qualifications", "nice[ -]to[ -]haves?", "bonus points", "bonus", "pluses", "desired skills", "desired", "preferred", "it would be great if( you have)?"],
    importance: "PREFERRED",
  },
  {
    alts: ["minimum qualifications", "basic qualifications", "required qualifications", "required skills", "required experience", "requirements", "qualifications", "required", "must[ -]haves?", "what you('ll)? need", "what you('ll)? bring", "who you are", "you have", "skills", "experience", "what we('re)? looking for", "about you"],
    importance: "REQUIRED",
  },
  {
    alts: ["key responsibilities", "job responsibilities", "responsibilities", "duties", "job duties", "essential functions", "what you('ll)? do", "the role", "about the role", "day[ -]to[ -]day", "in this role( you will)?"],
    importance: "RESPONSIBILITY",
  },
  {
    alts: ["benefits", "perks", "about us", "about the company", "who we are", "compensation", "pay", "salary", "equal (employment )?opportunity", "eeo", "our values", "why join( us)?", "location", "schedule", "how to apply"],
    importance: "OTHER",
  },
];

const HEADINGS = HEADING_DEFS.map((h) => {
  const alt = h.alts.join("|");
  return {
    // Whole-line heading, optionally joined with "&"/"and" ("Skills & Experience").
    full: new RegExp(`^(?:${alt})(?:\\s*(?:&|and)\\s*[a-z' ]{2,30})?$`, "i"),
    // "Requirements for this role:" — prefix plus trailing colon.
    prefix: new RegExp(`^(?:${alt})\\b`, "i"),
    importance: h.importance,
  };
});

const REQUIRED_CUE = /\b(required|requires|must|mandatory|minimum|need to have|needs to have|essential)\b/i;
const PREFERRED_CUE = /\b(preferred|a plus|is a plus|nice to have|bonus|desired|ideally|advantageous|helpful|plus\b)/i;
const EQUIVALENT_CUE = /\b(or equivalent|equivalent (work )?experience|in lieu of|or (a )?combination of|equivalent combination|or related experience)\b/i;
const BULLET = /^\s*([-*•·▪◦‣]|\d+[.)])\s+/;

const SKIP_KINDS = new Set<ConceptKind>(["environment", "clearance", "title"]);
const IMPORTANCE_RANK: Record<ReqImportance, number> = { REQUIRED: 4, UNSPECIFIED: 3, RESPONSIBILITY: 2, PREFERRED: 1 };

function headingImportance(line: string): ReqImportance | "OTHER" | null {
  const trimmed = line.replace(BULLET, "").replace(/^#+\s*/, "").replace(/\*\*/g, "").trim();
  const endsWithColon = /[:：]\s*$/.test(trimmed);
  const clean = trimmed.replace(/[:：]\s*$/, "").trim();
  if (clean.length > 60 || /[.!?]$/.test(clean)) return null;
  for (const h of HEADINGS) {
    if (h.full.test(clean) || (endsWithColon && h.prefix.test(clean))) return h.importance;
  }
  return null;
}

function lineImportance(line: string, section: ReqImportance | "OTHER"): ReqImportance | "OTHER" {
  if (PREFERRED_CUE.test(line) && !/\bnot (a )?plus\b/i.test(line)) return "PREFERRED";
  if (REQUIRED_CUE.test(line)) return "REQUIRED";
  return section;
}

function detectDegree(line: string): DegreeLevel | null {
  const s = line.toLowerCase();
  if (/\b(ph\.?d|doctorate|doctoral)\b/.test(s)) return "DOCTORATE";
  if (/\b(master'?s|m\.s\.|mba|m\.a\.)\b/.test(s) && /degree|master/.test(s)) return "MASTER";
  if (/\b(bachelor'?s?|b\.s\.|b\.a\.|bs\/ba|ba\/bs|4[- ]year degree|four[- ]year degree|undergraduate degree|college degree)\b/.test(s)) return "BACHELOR";
  if (/\b(associate'?s? degree|associate degree|2[- ]year degree|two[- ]year degree|a\.a\.s\.?)\b/.test(s)) return "ASSOCIATE";
  if (/\b(high school diploma|high school|ged)\b/.test(s)) return "HIGH_SCHOOL";
  return null;
}

function detectClearance(line: string): { level: ClearanceLevel; mustHaveActive: boolean } | null {
  const s = line.toLowerCase();
  if (!/\b(clearance|ts\/sci|top secret|public trust|secret)\b/.test(s)) return null;
  if (/\bclearance (sale|items|rack)\b/.test(s)) return null;
  const level: ClearanceLevel = /ts\/sci|top secret/.test(s) ? "TOP_SECRET" : /\bsecret\b/.test(s) ? "SECRET" : /public trust/.test(s) ? "PUBLIC_TRUST" : "SECRET";
  const obtainable = /\b(ability to obtain|able to obtain|eligible|eligibility|obtain and maintain|willing(ness)? to obtain)\b/.test(s);
  const active = /\b(active|current|existing|must (have|possess|hold)|required)\b/.test(s);
  return { level, mustHaveActive: active && !obtainable };
}

const SALARY_RE =
  /\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d{1,2})?)\s*([kK])?\s*(?:-|–|—|to)\s*\$?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d{1,2})?)\s*([kK])?(\s*(?:\/\s*|per\s+|an?\s+)?(hour|hr|hourly|year|yr|annually|annum))?/i;
const SALARY_SINGLE_RE = /\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d{1,2})?)\s*([kK])?\s*(?:\/\s*|per\s+|an?\s+)(hour|hr|year|yr|annum)/i;

export function parseSalaryText(text: string): JobAnalysis["salary"] {
  const none: JobAnalysis["salary"] = { min: null, max: null, period: null, annualMin: null, annualMax: null, source: "NONE" };
  const toNum = (s: string, k?: string) => Number(s.replace(/,/g, "")) * (k ? 1000 : 1);
  let m = text.match(SALARY_RE);
  let min: number, max: number, unit: string | undefined;
  if (m) {
    min = toNum(m[1], m[2]);
    max = toNum(m[3], m[4] ?? m[2]);
    unit = m[6];
  } else {
    m = text.match(SALARY_SINGLE_RE);
    if (!m) return none;
    min = max = toNum(m[1], m[2]);
    unit = m[3];
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= 0) return none;
  const period: "YEAR" | "HOUR" = unit ? (/h/i.test(unit) ? "HOUR" : "YEAR") : max < 300 ? "HOUR" : "YEAR";
  return { min, max, period, annualMin: annualize(min, period), annualMax: annualize(max, period), source: "TEXT", text: m[0].trim() };
}

export function detectRemote(text: string): { value: RemoteType; restriction?: string } {
  const s = text.toLowerCase();
  const restriction = text.match(/remote\s*\(([^)]{2,40})\)|must (?:reside|live|be located) in ([^.\n]{2,60})/i);
  const r = restriction ? (restriction[1] ?? restriction[2])?.trim() : undefined;
  if (/\bhybrid\b/.test(s)) return { value: "HYBRID", restriction: r };
  if (/\b(not|no) remote\b|\bremote work is not\b/.test(s)) return { value: "ONSITE", restriction: r };
  if (/\b(fully remote|100% remote|remote[- ]first|remote position|remote role|work from home|wfh|this is a remote|remote \(|remote,|remote within|remote - )/.test(s) || /^remote\b/m.test(s)) {
    return { value: "REMOTE", restriction: r };
  }
  if (/\b(on[- ]site|onsite|in[- ]office|in the office|on location|in person|in-person)\b/.test(s)) return { value: "ONSITE", restriction: r };
  return { value: "UNKNOWN", restriction: r };
}

export function detectSeniority(title: string, minYears?: number | null): JobAnalysis["seniority"] {
  const t = title.toLowerCase();
  if (/\b(director|head of|vp|vice president|principal|staff|architect|manager)\b/.test(t)) return "LEAD";
  if (/\b(senior|sr\.?|lead|iii|iv)\b/.test(t)) return "SENIOR";
  if (/\b(junior|jr\.?|entry|intern|trainee|apprentice|associate|tier 1|level 1|tier i)\b/.test(t)) return "ENTRY";
  if (/\b(ii|2)\b/.test(t)) return "MID";
  if (minYears != null) return minYears >= 5 ? "SENIOR" : minYears >= 2 ? "MID" : "ENTRY";
  return "UNKNOWN";
}

export function analyzeJob(job: Pick<JobRecord, "title" | "description" | "employmentType" | "remoteType" | "salaryMin" | "salaryMax" | "salaryPeriod">, structured: { employmentType?: boolean; remoteType?: boolean; salary?: boolean } = {}): JobAnalysis {
  const lines = job.description.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const hasHeadings = lines.some((l) => headingImportance(l) !== null);
  let section: ReqImportance | "OTHER" = hasHeadings ? "UNSPECIFIED" : "UNSPECIFIED";

  const reqs = new Map<string, RequirementItem>();
  const groups: RequirementItem[][] = [];
  let minYears: JobAnalysis["minYears"] = null;
  let degree: JobAnalysis["degree"] = null;
  let clearance: JobAnalysis["clearance"] = null;
  const licenses: JobAnalysis["licenses"] = [];
  const uninterpreted: string[] = [];
  const environments = new Set<string>();
  let groupNo = 0;

  for (const raw of lines) {
    const h = headingImportance(raw);
    if (h) {
      section = h;
      continue;
    }
    if (section === "OTHER") continue;
    const line = raw.replace(BULLET, "");
    const importance = lineImportance(line, section) as ReqImportance | "OTHER";
    if (importance === "OTHER") continue;
    let interpreted = false;

    // Years of experience
    const ym = line.match(/(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*(\d{1,2})\s*\+?\s*)?(?:years?|yrs?)\b/i);
    if (ym && /experience|exp\b|background|working|support|years? (of|in)/i.test(line)) {
      const years = Number(ym[1]);
      if (importance !== "PREFERRED" && (!minYears || years > minYears.years)) minYears = { years, text: line, importance };
      interpreted = true;
    }

    // Degree
    const deg = detectDegree(line);
    if (deg && /degree|diploma|ged|bachelor|associate|master|ph\.?d|b\.s\.|b\.a\./i.test(line)) {
      if (!degree || IMPORTANCE_RANK[importance] > IMPORTANCE_RANK[degree.importance]) {
        degree = { level: deg, importance, equivalencyAllowed: EQUIVALENT_CUE.test(line), text: line };
      }
      interpreted = true;
    }

    // Clearance
    const cl = detectClearance(line);
    if (cl) {
      clearance = { ...cl, text: line };
      interpreted = true;
    }

    // Concepts
    const all = detectConcepts(line);
    const top = all.filter((m) => !all.some((o) => o !== m && spanContains(o, m)));
    const lineItems: { item: RequirementItem; start: number; end: number }[] = [];
    for (const m of top) {
      const c = getConcept(m.conceptId);
      if (!c) continue;
      if (c.kind === "environment") {
        environments.add(c.id);
        continue;
      }
      const ids = c.kind === "title" ? (c.implies ?? []) : [c.id];
      for (const id of ids) {
        const cc = getConcept(id);
        if (!cc || SKIP_KINDS.has(cc.kind)) continue;
        if (cc.kind === "license") {
          licenses.push({ conceptId: id, importance, text: line });
          interpreted = true;
          continue;
        }
        const orEq = EQUIVALENT_CUE.test(line);
        let imp = importance;
        if (cc.kind === "certification" && orEq && imp === "REQUIRED") imp = "PREFERRED";
        const item: RequirementItem = { conceptId: id, label: conceptLabel(id), kind: cc.kind, importance: imp, evidenceText: line, orEquivalent: orEq };
        lineItems.push({ item, start: m.start, end: m.end });
        interpreted = true;
      }
    }

    // "X or Y" alternatives on the same line form a group.
    const norm = normalizeText(line);
    let current: RequirementItem[] = [];
    for (let i = 0; i < lineItems.length; i++) {
      const prev = lineItems[i - 1];
      const cur = lineItems[i];
      if (prev && /^\s*(,\s*)?(or|and\/or|\/)\s*$/.test(norm.slice(prev.end, cur.start))) {
        current.push(cur.item);
      } else {
        if (current.length > 1) groups.push(current);
        current = [cur.item];
      }
    }
    if (current.length > 1) groups.push(current);

    for (const { item } of lineItems) {
      const existing = reqs.get(item.conceptId);
      if (!existing || IMPORTANCE_RANK[item.importance] > IMPORTANCE_RANK[existing.importance]) reqs.set(item.conceptId, item);
    }

    if (!interpreted && importance === "REQUIRED" && REQUIRED_CUE.test(line) && line.length < 200) uninterpreted.push(line);
  }

  for (const g of groups) {
    const id = `g${++groupNo}`;
    for (const item of g) {
      const stored = reqs.get(item.conceptId);
      if (stored && stored.evidenceText === item.evidenceText) stored.group = id;
    }
  }

  // Employment type / remote / salary: structured fields win, text is LIKELY.
  const textAll = `${job.title}\n${job.description}`;
  const etText = parseEmploymentType(textAll.match(/\b(full[\s-]?time|part[\s-]?time|contract(?:-to-hire)?|temporary|temp\b|internship|seasonal)\b/i)?.[0]);
  const employmentType: JobAnalysis["employmentType"] =
    structured.employmentType && job.employmentType !== "UNKNOWN"
      ? { value: job.employmentType, source: "STRUCTURED" }
      : job.employmentType !== "UNKNOWN"
        ? { value: job.employmentType, source: "TEXT" }
        : etText !== "UNKNOWN"
          ? { value: etText, source: "TEXT" }
          : { value: "UNKNOWN", source: "NONE" };

  const remoteText = detectRemote(textAll);
  const remote: JobAnalysis["remote"] =
    structured.remoteType && job.remoteType !== "UNKNOWN"
      ? { value: job.remoteType, source: "STRUCTURED", restriction: remoteText.restriction }
      : job.remoteType !== "UNKNOWN"
        ? { value: job.remoteType, source: "TEXT", restriction: remoteText.restriction }
        : remoteText.value !== "UNKNOWN"
          ? { value: remoteText.value, source: "TEXT", restriction: remoteText.restriction }
          : { value: "UNKNOWN", source: "NONE" };

  let salary: JobAnalysis["salary"];
  if (job.salaryMin != null || job.salaryMax != null) {
    const period = job.salaryPeriod ?? ((job.salaryMax ?? job.salaryMin ?? 0) < 300 ? "HOUR" : "YEAR");
    salary = {
      min: job.salaryMin ?? job.salaryMax ?? null,
      max: job.salaryMax ?? job.salaryMin ?? null,
      period,
      annualMin: annualize(job.salaryMin ?? job.salaryMax, period),
      annualMax: annualize(job.salaryMax ?? job.salaryMin, period),
      source: structured.salary ? "STRUCTURED" : "TEXT",
    };
  } else salary = parseSalaryText(job.description);

  const travel = job.description.match(/(\d{1,3})\s*%\s*(?:of\s+the\s+time\s+)?travel|travel[^.\n]{0,30}?(\d{1,3})\s*%/i);
  const travelPercent = travel ? Number(travel[1] ?? travel[2]) : null;

  return {
    version: ANALYZER_VERSION,
    requirements: [...reqs.values()].sort((a, b) => IMPORTANCE_RANK[b.importance] - IMPORTANCE_RANK[a.importance]),
    minYears,
    degree,
    clearance,
    licenses,
    employmentType,
    remote,
    salary,
    seniority: detectSeniority(job.title, minYears?.years),
    travelPercent,
    uninterpretedRequirements: uninterpreted.slice(0, 8),
    environments: [...environments],
  };
}
