// Conservative, local, dependency-free resume text → structured data.
//
// Design rules (match the product's truth stance):
// - Never invent. If a field isn't clearly present, leave it undefined and flag `uncertain`.
// - Do not infer employers, titles, technologies, metrics, or duties that aren't written.
// - Output is a *proposal* for review; everything it produces is imported UNVERIFIED and must
//   still pass the Truth Gate before it can appear in a document.
//
// Experience parsing is ANCHORED ON DATE RANGES: each job has one date range, so we segment the
// experience section at each date line, take the 1–3 non-bullet lines just before it (plus an
// optional location line just after) as the role header, and treat everything up to the next
// role's header as that role's bullets — robust to employer/title/location being on separate
// lines and to bullet glyphs that don't survive PDF extraction.

export interface ParsedContact {
  name?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  location?: string;
}

export interface ParsedPosition {
  employer?: string;
  title?: string;
  startDate?: string; // YYYY-MM
  endDate?: string | null; // YYYY-MM, null = current
  location?: string;
  bullets: string[];
  uncertain: boolean;
}

export interface ParsedEducation {
  institution?: string;
  credential?: string;
  field?: string;
  endDate?: string;
  gpa?: string;
  honors?: string;
  uncertain: boolean;
}

export interface ParsedResume {
  contact: ParsedContact;
  positions: ParsedPosition[];
  education: ParsedEducation[];
  skills: string[];
  certifications: string[];
  /** Lines we could not confidently classify — imported as generic UNVERIFIED facts for review. */
  otherBullets: string[];
  warnings: string[];
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
};

const BULLET_RE = /^\s*([-*•·▪◦‣▸●○»※∙·‣⁃]|\d+[.)])\s+/u;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /\+?\(?\d[\d\s().-]{7,}\d/;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s)]+/i;
// Words that mark a line as a JOB TITLE (vs an employer) when they appear on their own line.
const TITLE_HINT = /\b(engineer|technician|tech|analyst|administrator|admin|manager|specialist|developer|support|coordinator|consultant|associate|assistant|intern|internship|lead|representative|rep|director|architect|designer|operator|clerk|agent|supervisor|officer|installer|electrician|welder|fabricator|apprentice|trainee|staff|help ?desk|service desk|desktop)\b/i;

type Section = "experience" | "education" | "skills" | "certifications" | "other";

function sectionOf(line: string): Section | null {
  const l = line.trim().toLowerCase().replace(/[:•|]/g, "").trim();
  if (l.length > 42 || l.length < 3) return null; // section headers are short
  if (/^(work|professional|relevant|employment)?\s*(experience|history|employment|background)$/.test(l) && /(experience|history|employment|background)/.test(l)) return "experience";
  if (/^(education|academics?|education (and|&) training|education (and|&) certifications?)$/.test(l)) return "education";
  if (/^((technical|core|key|relevant) )?(skills|competenc(ies|y)|technologies|technical proficienc(ies|y)|areas of expertise|proficiencies)$/.test(l)) return "skills";
  if (/^(certifications?|licenses?|licen[cs]es? (and|&) certifications?|certifications? (and|&) licenses?|credentials)$/.test(l)) return "certifications";
  return null;
}

function cleanBullet(line: string): string {
  return line.replace(BULLET_RE, "").replace(/^[•●▪‣⁃·\s*-]+/, "").trim();
}

/** A line that is just "City, ST" (US) — a location, not an employer/title. */
function isLocationLine(s: string): boolean {
  const t = s.trim().replace(/\.$/, "");
  return /^[A-Za-z.\s'-]{2,40},\s*[A-Z]{2}$/.test(t) || /^(remote|hybrid|on-?site)$/i.test(t);
}

/** Extract a month+year or year into YYYY-MM. Returns undefined when nothing usable is present. */
function toYm(token: string): string | undefined {
  const t = token.trim().toLowerCase();
  if (/^(present|current|now|ongoing|date)$/.test(t)) return undefined;
  let m = t.match(/^([a-z]{3,9})\.?\s+(\d{4})$/); // "June 2022" / "Jun 2022"
  if (m) {
    const key = m[1].slice(0, m[1] === "sept" ? 4 : 3);
    if (MONTHS[key]) return `${m[2]}-${MONTHS[key]}`;
  }
  m = t.match(/^(\d{1,2})\/(\d{4})$/); // "06/2022"
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{4})$/); // "2022" — year only
  if (m) return `${m[1]}-01`;
  return undefined;
}

interface DateRange { start?: string; end?: string | null; raw: string; yearOnly: boolean; }

const DATE_TOKEN = "(?:[A-Za-z]{3,9}\\.?\\s+\\d{4}|\\d{1,2}/\\d{4}|\\d{4})";
const DATE_RANGE_RE = new RegExp(`(${DATE_TOKEN})\\s*(?:–|—|-|to|through|\\u2013|\\u2014)\\s*(${DATE_TOKEN}|present|current|now|ongoing)`, "i");

function extractDateRange(line: string): DateRange | null {
  const m = line.match(DATE_RANGE_RE);
  if (!m) return null;
  const current = /^(present|current|now|ongoing)$/i.test(m[2].trim());
  return { start: toYm(m[1]), end: current ? null : toYm(m[2]), raw: m[0], yearOnly: /^\d{4}$/.test(m[1].trim()) };
}

/** Classify a header fragment as a title (job-title words) or an employer. */
function classifyHeaderPart(text: string, title: string[], employer: string[]) {
  const t = text.trim();
  if (!t) return;
  (TITLE_HINT.test(t) ? title : employer).push(t);
}

/** Build one position from its header lines (employer/title/dates/location) and bullets. */
function buildPosition(headerLines: string[], bullets: string[], warnings: string[]): ParsedPosition {
  let start: string | undefined;
  let end: string | null | undefined;
  let location: string | undefined;
  let yearOnly = false;
  const titles: string[] = [];
  const employers: string[] = [];

  for (const h of headerLines) {
    let text = h.trim();
    const dr = extractDateRange(text);
    if (dr) {
      if (start === undefined) { start = dr.start; end = dr.end; }
      if (dr.yearOnly) yearOnly = true;
      text = text.replace(dr.raw, " ").replace(/\s+/g, " ").trim();
    }
    text = text.replace(/^[•·|,\-–—\s]+|[|,\-–—\s]+$/g, "").trim();
    if (!text) continue;
    // Trailing ", City, ST" location on a combined line.
    const locM = text.match(/,\s*([A-Za-z.\s'-]{2,40},\s*[A-Z]{2})\.?$/);
    if (locM) {
      if (!location) location = locM[1].trim();
      text = text.slice(0, locM.index).trim();
    } else if (isLocationLine(text)) {
      if (!location) location = text.trim();
      continue;
    }
    if (!text) continue;
    // Split "Title — Employer" / "Title | Employer" / "Title at Employer" / tab-separated columns.
    const parts = text.split(/\t+|\s+(?:—|–|@|\bat\b|\||·)\s+/).map((s) => s.trim()).filter(Boolean);
    for (const p of parts) classifyHeaderPart(p, titles, employers);
  }

  let title = titles[0];
  let employer = employers[0];
  if (!title && employers.length > 1) title = employers[1];
  if (!employer && titles.length > 1) employer = titles[1];
  if (!employer && employers.length > 1) employer = employers.filter((e) => e !== title)[0];

  if (yearOnly) warnings.push("A role listed only a year; the start month was set to January — check it in review.");
  const uncertain = !title || !employer || titles.length > 1 || employers.length > 1 || yearOnly;
  return { employer, title, startDate: start, endDate: end, location, bullets, uncertain };
}

const ACTION_VERB = /^(led|ran|built|set|oversaw|drove|grew|won|troubleshot|spoke|met|sold|made|gave|took|wrote|managed|owned|headed|founded|launched|shipped|fixed|handled|ensured|drafted|authored|taught|provided|performed|assisted|operated|maintained|configured|installed|repaired|supported|resolved|developed|created|designed|coordinated|monitored|documented|analyzed|implemented)/i;

/** Does a line read like a short header (employer/title/location) rather than a duty sentence? */
function isHeaderish(s: string): boolean {
  const t = s.trim();
  // A combined "Title — Employer[, City, ST]" line is a header even when it's long.
  if (!/[.]$/.test(t) && /\s[—–|·@]\s/.test(t)) return true;
  if (/,\s*[A-Za-z.\s'-]{2,40},\s*[A-Z]{2}\.?$/.test(t)) return true; // trailing "City, ST"
  const words = t.split(/\s+/);
  const first = words[0] ?? "";
  // Sentence/bullet signals — a duty bullet is never a header.
  if (/[.]$/.test(t)) return false;
  if (first.length >= 4 && /ed$/i.test(first)) return false; // "Installed …", "Logged …"
  if (ACTION_VERB.test(t)) return false;
  if (t.length > 45 || words.length > 7) return false;
  // Header signals.
  if (isLocationLine(t)) return true;
  if (TITLE_HINT.test(t)) return true;
  return words.length <= 4; // a short noun phrase is probably an employer
}

/** Merge PDF-wrapped duty lines: a continuation starts lowercase and has no bullet glyph; a
 *  glyph or capitalized line starts a new bullet. Turns 18 wrapped lines back into real bullets. */
function mergeBullets(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const glyph = BULLET_RE.test(raw);
    const l = cleanBullet(raw).replace(/\t/g, " ").replace(/\s+/g, " ").trim();
    if (l.length < 2) continue;
    if (out.length > 0 && !glyph && /^[a-z]/.test(l)) out[out.length - 1] = `${out[out.length - 1]} ${l}`;
    else out.push(l);
  }
  return out;
}

function parseExperience(lines: string[], warnings: string[]): ParsedPosition[] {
  const L = lines.map((l) => l.trim()).filter(Boolean);
  const n = L.length;
  if (!n) return [];
  const isBullet = L.map((l) => BULLET_RE.test(l));
  const isLoc = L.map((l) => isLocationLine(l));
  const dateIdx = L.map((l, i) => (extractDateRange(l) ? i : -1)).filter((i) => i >= 0);

  // No dated roles: fall back to a single uncertain role if there's any title-ish header, else nothing.
  if (dateIdx.length === 0) {
    const bullets = L.filter((l) => BULLET_RE.test(l)).map(cleanBullet).filter((b) => b.length >= 2);
    const headers = L.filter((l) => !BULLET_RE.test(l)).slice(0, 4);
    if (!headers.some((h) => TITLE_HINT.test(h)) && !bullets.length) return [];
    warnings.push("Couldn't find dates for a role — review its details.");
    const pos = buildPosition(headers, bullets, warnings);
    pos.uncertain = true;
    return pos.title || pos.employer || pos.bullets.length ? [pos] : [];
  }

  // Walk back over the role's header block before a date line: short header-ish lines only
  // (stop at a glyph bullet or a duty sentence), capped at 3 lines.
  const headerStart = (d: number, lower: number): number => {
    let i = d - 1;
    let c = 0;
    while (i > lower && !isBullet[i] && isHeaderish(L[i]) && c < 3) { i--; c++; }
    return i + 1;
  };

  const roles: ParsedPosition[] = [];
  let cursor = 0;
  for (let k = 0; k < dateIdx.length; k++) {
    const d = dateIdx[k];
    const hStart = headerStart(d, cursor - 1);
    const headerLines = L.slice(hStart, d + 1);
    let b = d + 1;
    // Consume header lines that appear AFTER the date (title, location): real resumes put
    // "Employer <tab> Date" on one row, then the title and location on the lines below it.
    let afterCount = 0;
    while (b < n && extractDateRange(L[b]) == null && afterCount < 3 && (isLoc[b] || (!isBullet[b] && isHeaderish(L[b])))) {
      headerLines.push(L[b]);
      b++;
      afterCount++;
    }
    let bulletEnd: number;
    if (k + 1 < dateIdx.length) bulletEnd = headerStart(dateIdx[k + 1], b - 1) - 1;
    else bulletEnd = n - 1;
    roles.push(buildPosition(headerLines, mergeBullets(L.slice(b, bulletEnd + 1)), warnings));
    cursor = bulletEnd + 1;
  }
  return roles;
}

const DEGREE_RE = /\b(associate|bachelor|master|doctor|ph\.?d|a\.?a\.?s|a\.?a\.?|a\.?s\.?|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?|m\.?b\.?a|certificate|certification|diploma|degree|g\.?e\.?d)\b/i;
const INSTITUTION_RE = /\b(college|university|institute|academy|school|seminary|polytechnic)\b/i;

function parseEducation(lines: string[]): ParsedEducation[] {
  const L = lines.map((l) => cleanBullet(l).replace(/\t/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  const out: ParsedEducation[] = [];
  let pending: { institution?: string; endDate?: string; gpa?: string; honors?: string } = {};

  const yearOf = (s: string) => { const m = s.match(/\b(19|20)\d{2}\b/); return m ? `${m[0]}-01` : undefined; };
  const gpaOf = (s: string) => { const m = s.match(/\bGPA[:\s]*([0-4]\.\d{1,2})/i) ?? s.match(/\b([0-4]\.\d{2})\s*GPA/i); return m ? m[1] : undefined; };
  const honorsOf = (s: string) => { const m = s.match(/\b(summa cum laude|magna cum laude|cum laude|dean'?s list|with honors|honou?rs|valedictorian|salutatorian)\b/i); return m ? m[0] : undefined; };

  for (const line of L) {
    const year = yearOf(line);
    const gpa = gpaOf(line);
    const honors = honorsOf(line);
    if (DEGREE_RE.test(line)) {
      // A single line may pack "Credential, School, City ST, Year, GPA" — split on commas and
      // pick out the institution segment; otherwise the whole line is the credential and the
      // institution arrives on its own line (pending).
      const segs = line.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
      const instSeg = segs.length > 1 ? segs.find((s) => INSTITUTION_RE.test(s)) : undefined;
      const credSeg = segs.find((s) => DEGREE_RE.test(s)) ?? segs[0] ?? line;
      const credential = (instSeg ? credSeg : line).replace(/\s{2,}/g, " ").replace(/,?\s*(19|20)\d{2}.*$/, "").trim();
      const fieldM = credSeg.match(/\b(?:in|of)\s+([A-Za-z][A-Za-z&\s/-]{2,60})$/i);
      out.push({
        credential,
        field: fieldM ? fieldM[1].trim() : undefined,
        institution: instSeg ?? (INSTITUTION_RE.test(line) ? undefined : pending.institution),
        endDate: year ?? pending.endDate,
        gpa: gpa ?? pending.gpa,
        honors: honors ?? pending.honors,
        uncertain: true,
      });
      pending = {};
    } else if (INSTITUTION_RE.test(line)) {
      if (out.length && !out[out.length - 1].institution) {
        out[out.length - 1].institution = line;
        if (year && !out[out.length - 1].endDate) out[out.length - 1].endDate = year;
      } else pending.institution = line;
    } else if (out.length) {
      const e = out[out.length - 1];
      if (year && !e.endDate) e.endDate = year;
      if (gpa && !e.gpa) e.gpa = gpa;
      if (honors && !e.honors) e.honors = honors;
    } else {
      if (year) pending.endDate = year;
      if (gpa) pending.gpa = gpa;
      if (honors) pending.honors = honors;
    }
  }
  // Deduplicate education (same credential + institution, ignoring case/punctuation).
  const seen = new Set<string>();
  return out.filter((e) => {
    const key = `${(e.credential ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${(e.institution ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function splitSkills(lines: string[]): string[] {
  const parts: string[] = [];
  for (const raw of lines) {
    for (const seg of cleanBullet(raw).split(/[,;|•·\t\n]+|\s{3,}/)) {
      // Drop a leading "Category:" label (e.g. "Tools: Jira" → "Jira"); keep the skill itself.
      const s = seg.replace(/^[A-Za-z][A-Za-z /&-]{1,28}:\s*/, "").replace(/\s+/g, " ").trim();
      if (s.length >= 2 && s.length <= 60) parts.push(s);
    }
  }
  // Case/whitespace/punctuation-insensitive dedupe; keep the first casing seen.
  const seen = new Map<string, string>();
  for (const p of parts) {
    const key = p.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (key && !seen.has(key)) seen.set(key, p);
  }
  return [...seen.values()];
}

export function parseResumeText(text: string): ParsedResume {
  const warnings: string[] = [];
  const rawLines = text.replace(/\r/g, "").split("\n").map((l) => l.replace(/ /g, " ").trimEnd());
  const lines = rawLines.filter((l) => l.trim().length > 0);

  const contact: ParsedContact = {};
  const whole = lines.join("\n");
  const email = whole.match(EMAIL_RE);
  if (email) contact.email = email[0];
  const linkedin = whole.match(LINKEDIN_RE);
  if (linkedin) contact.linkedin = linkedin[0];
  for (const l of lines.slice(0, 8)) {
    const m = l.match(PHONE_RE);
    if (m) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length >= 10 && digits.length <= 13) { contact.phone = m[0].trim(); break; }
    }
  }
  for (const l of lines.slice(0, 5)) {
    if (EMAIL_RE.test(l) || LINKEDIN_RE.test(l) || /\d/.test(l)) continue;
    const words = l.trim().split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && /^[A-Za-z][A-Za-z.'-]*$/.test(words[0])) { contact.name = l.trim(); break; }
  }
  for (const l of lines.slice(0, 8)) {
    const m = l.match(/\b([A-Za-z.]+(?:\s[A-Za-z.]+)*),\s*([A-Z]{2})\b/);
    if (m && !EMAIL_RE.test(l)) { contact.location = `${m[1]}, ${m[2]}`; break; }
  }

  // Partition the body into sections by header lines.
  const buckets: Record<Section, string[]> = { experience: [], education: [], skills: [], certifications: [], other: [] };
  let current: Section = "other";
  for (const l of lines) {
    const sec = sectionOf(l);
    if (sec) { current = sec; continue; }
    buckets[current].push(l);
  }

  const positions = parseExperience(buckets.experience, warnings);
  const education = parseEducation(buckets.education);
  const skills = splitSkills(buckets.skills);
  const certifications = buckets.certifications.map((l) => cleanBullet(l).trim()).filter((l) => l.length >= 2);

  const otherBullets = buckets.other.filter((l) => BULLET_RE.test(l)).map((l) => cleanBullet(l)).filter((l) => l.length >= 8);

  if (!positions.length && !education.length && !skills.length && !certifications.length && !otherBullets.length) {
    warnings.push("No work history, education, or skills could be confidently extracted. Add them manually, or paste the relevant sections.");
  }
  if (!contact.name) warnings.push("Couldn't confidently detect your name — enter it in the identity step.");

  return { contact, positions, education, skills, certifications, otherBullets, warnings };
}
