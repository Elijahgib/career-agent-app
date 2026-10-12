// THE TRUTH GATE
//
// Every generated claim must be supported by VERIFIED evidence in the ledger.
// The gate is deliberately conservative: when in doubt it BLOCKS and explains
// the exact unsupported phrase. First-pass correctness beats keyword matching.

import type { LedgerFact, Relation } from "@/lib/domain/types";
import { factRelationsFor, licenseForFact, isProfessional, showsExperience } from "@/lib/evidence/ledger";
import { RELATION_INFO, ceilingSatisfies, describeRelations, productionScope, readClaim, sanitizeText, satisfies } from "@/lib/evidence/relations";
import { conceptLabel, getConcept, impliedClosure, transferBetween, type ConceptKind } from "@/lib/ontology/concepts";
import {
  containsPhrase,
  detectConcepts,
  detectConceptIds,
  phraseConceptIds,
  findPhrase,
  maskSpans,
  normalizeText,
  spanContains,
  type ConceptMention,
  type Span,
} from "@/lib/ontology/detect";
import {
  BRIDGE_CONNECTIVES,
  CREDENTIAL_ASSERTION,
  INFLATION_GROUPS,
  LEARNING_QUALIFIER,
  PROFESSIONAL_ASSERTION,
  TARGET_REFERENCE,
  extractNumbers,
  properTerms,
  vocabularyOf,
} from "./rules";
import type { Claim, ClaimKind, ClaimResult, ClaimSection, GateReport, Violation } from "./types";

export const TRUTH_GATE_VERSION = "truth-gate/1.0.0";

export interface GateContext {
  /** The candidate's full ledger (stored + derived ROLE/EDU facts). */
  facts: LedgerFact[];
  /** Target job, when validating tailored documents. */
  job?: { title: string; company: string; requirementConceptIds?: string[] } | null;
}

interface Prepared {
  byCode: Map<string, LedgerFact>;
  prohibited: { phrase: string; code: string }[];
  jobConcepts: Set<string>;
  jobVocabulary: Set<string>;
}

function prepare(ctx: GateContext): Prepared {
  const byCode = new Map(ctx.facts.map((f) => [f.code, f]));
  const prohibited: { phrase: string; code: string }[] = [];
  for (const f of ctx.facts) for (const p of f.prohibitedExpansions) if (p.trim()) prohibited.push({ phrase: p.trim(), code: f.code });
  const jobConcepts = new Set<string>(ctx.job?.requirementConceptIds ?? []);
  if (ctx.job) for (const id of detectConceptIds(ctx.job.title)) jobConcepts.add(id);
  const reqLabels = [...jobConcepts].flatMap((id) => [conceptLabel(id), ...(getConcept(id)?.aliases ?? [])]);
  const jobVocabulary = vocabularyOf(ctx.job?.title, ctx.job?.company, ...reqLabels);
  return { byCode, prohibited, jobConcepts, jobVocabulary };
}

const EVIDENCE_KINDS: ClaimKind[] = ["EXPERIENCE", "SKILL", "SUMMARY", "CREDENTIAL", "EDUCATION", "LEARNING"];

function q(s: string): string {
  return `“${s.trim()}”`;
}

function short(s: string, n = 90): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// ───────────────────────── Evidence-bearing claims ─────────────────────────

interface EvidenceCheck {
  violations: Violation[];
  licensedBy: Record<string, string[]>;
}

function checkEvidenceText(
  claimId: string,
  text: string,
  codes: string[],
  section: ClaimSection,
  positionId: string | null | undefined,
  prep: Prepared,
  kind?: ClaimKind,
): EvidenceCheck {
  const violations: Violation[] = [];
  const licensedBy: Record<string, string[]> = {};

  if (!codes.length) {
    violations.push({
      claimId,
      rule: "NO_EVIDENCE",
      phrase: text,
      message: "No evidence is attached to this statement. The Truth Gate never allows a claim without supporting facts.",
    });
    return { violations, licensedBy };
  }

  const facts: LedgerFact[] = [];
  for (const code of codes) {
    const f = prep.byCode.get(code);
    if (!f) {
      violations.push({ claimId, rule: "UNKNOWN_FACT", phrase: code, message: `${code} does not exist in this candidate's Evidence Ledger.`, factCodes: [code] });
    } else facts.push(f);
  }
  for (const f of facts) {
    if (f.verificationStatus !== "VERIFIED") {
      violations.push({
        claimId,
        rule: "UNVERIFIED_EVIDENCE",
        phrase: text,
        message: `${f.code} is not verified yet (${q(short(f.canonicalFact))}). Verify it in the Evidence Ledger before it can support generated documents.`,
        factCodes: [f.code],
      });
    }
  }
  const verified = facts.filter((f) => f.verificationStatus === "VERIFIED");
  if (!verified.length) return { violations, licensedBy };

  if (positionId) {
    for (const f of verified) {
      if (f.positionId && f.positionId !== positionId) {
        violations.push({
          claimId,
          rule: "CONTEXT_MISMATCH",
          phrase: text,
          message: `${f.code} belongs to a different job (${f.context ?? "another employer"}). A bullet may only cite evidence from the position it is listed under.`,
          factCodes: [f.code],
        });
      }
    }
  }

  // Hands-on relations only: a fact that merely escalated, observed or studied a subject
  // can be cited for it, but never offered as experience in a transfer hint.
  const experienceBy: Record<string, string[]> = {};
  for (const f of verified) {
    for (const c of licenseForFact(f).concepts) {
      (licensedBy[c] ??= []).push(f.code);
      if (showsExperience(f, c)) (experienceBy[c] ??= []).push(f.code);
    }
  }
  const licensedIds = Object.keys(licensedBy);
  const supportSummary = licensedIds.length
    ? licensedIds.filter((id) => getConcept(id)?.kind !== "title").slice(0, 6).map(conceptLabel).join(", ")
    : "no recognised skills";
  const citedCodes = verified.map((f) => f.code);

  const mentions = detectConcepts(text);
  type Problem = { span: Span; v: Violation };
  const problems: Problem[] = [];

  for (const m of mentions) {
    const concept = getConcept(m.conceptId);
    if (!concept) continue;
    const lic = licensedBy[m.conceptId];
    if (!lic) {
      problems.push({
        span: m,
        v: {
          claimId,
          rule: concept.kind === "title" ? "UNSUPPORTED_TITLE" : "UNSUPPORTED_CONCEPT",
          phrase: m.text,
          conceptId: m.conceptId,
          factCodes: citedCodes,
          message:
            concept.kind === "title"
              ? `${q(m.text)} is a job title the candidate has not held according to the cited evidence (${citedCodes.join(", ")}). Titles must match verified work history.`
              : `${q(m.text)} (${concept.label}) is not supported by the cited evidence (${citedCodes.join(", ")}). That evidence supports: ${supportSummary}.`,
          hint: transferHint(m.conceptId, experienceBy),
        },
      });
      continue;
    }
    const licFacts = lic.map((code) => prep.byCode.get(code)!).filter(Boolean);
    if (licFacts.some(isProfessional)) continue;

    // Only academic / project / learning evidence supports this concept (rule J).
    const basis = licFacts.map((f) => `${f.code} (${f.experienceType.toLowerCase()})`).join(", ");
    if (concept.kind === "certification") {
      const earned = licFacts.some((f) => (f.category === "CERTIFICATION" || f.category === "LICENSE") && f.experienceType !== "LEARNING");
      if (!earned && (CREDENTIAL_ASSERTION.test(text) || !LEARNING_QUALIFIER.test(text))) {
        problems.push({
          span: m,
          v: {
            claimId,
            rule: "CERTIFICATION_NOT_EARNED",
            phrase: m.text,
            conceptId: m.conceptId,
            factCodes: lic,
            message: `${q(m.text)} is only supported as in-progress study (${basis}). It can be listed as “in progress” or “studying for”, never as an earned certification.`,
          },
        });
      }
      continue;
    }
    const inCredentialSection = section === "education" || section === "certifications" || section === "projects";
    const assertsExperience = PROFESSIONAL_ASSERTION.test(text);
    const presentedAsWork = section === "experience" || section === "competencies";
    if (presentedAsWork || assertsExperience || (!inCredentialSection && !LEARNING_QUALIFIER.test(text))) {
      problems.push({
        span: m,
        v: {
          claimId,
          rule: "LEARNING_AS_EXPERIENCE",
          phrase: m.text,
          conceptId: m.conceptId,
          factCodes: lic,
          message: `${q(m.text)} is only supported by learning, lab or academic evidence (${basis}). It may appear under Projects & Training with wording such as “home lab” or “studying”, not as professional experience.`,
        },
      });
    }
  }

  // Prohibited expansions the user explicitly ruled out (any fact in the ledger).
  for (const { phrase, code } of prep.prohibited) {
    const spans = findPhrase(text, phrase);
    if (!spans.length) continue;
    const pConcepts = phraseConceptIds(phrase);
    const textSupport = verified.some(
      (f) =>
        !f.prohibitedExpansions.some((p) => normalizeText(p).trim() === normalizeText(phrase).trim()) &&
        (containsPhrase(f.canonicalFact, phrase) || approvedWording(f).some((w) => containsPhrase(w, phrase))),
    );
    const conceptSupport = pConcepts.size > 0 && [...pConcepts].every((c) => licensedBy[c]);
    if (textSupport || conceptSupport) continue;
    const owner = prep.byCode.get(code);
    for (const span of spans) {
      // Replace any overlapping generic concept problem with this more specific one.
      for (let i = problems.length - 1; i >= 0; i--) {
        const p = problems[i].span;
        if (p.start < span.end && span.start < p.end) problems.splice(i, 1);
      }
      problems.push({
        span,
        v: {
          claimId,
          rule: "PROHIBITED_EXPANSION",
          phrase: text.slice(span.start, span.end),
          factCodes: [code],
          message: `${q(text.slice(span.start, span.end))} is a prohibited expansion recorded on ${code}${owner ? ` (${q(short(owner.canonicalFact, 70))})` : ""}. The ledger says this must not be claimed from that evidence.`,
          hint: pConcepts.size ? transferHint([...pConcepts][0], experienceBy) : undefined,
        },
      });
    }
  }

  // Report the longest offending phrase only (e.g. "enterprise desktop support", not also "desktop support").
  const kept = problems.filter((p) => !problems.some((o) => o !== p && spanContains(o.span, p.span)));
  const seen = new Set<string>();
  for (const p of kept) {
    const key = `${p.v.rule}:${p.span.start}:${p.span.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    violations.push(p.v);
  }

  // Relationship semantics: FACT + RELATIONSHIP + CONTEXT + ALLOWED WORDING.
  violations.push(...checkRelations(claimId, text, verified, section, kind, licensedBy, experienceBy, kept.map((p) => p.span)));

  // Claim-level: experience bullets need at least one professional fact.
  if (section === "experience" && !verified.some(isProfessional)) {
    violations.push({
      claimId,
      rule: "LEARNING_AS_EXPERIENCE",
      phrase: text,
      factCodes: citedCodes,
      message: `This bullet is listed under work experience but its evidence (${citedCodes.join(", ")}) is not professional experience.`,
    });
  }

  const supportTexts = verified.map((f) => [f.canonicalFact, ...approvedWording(f)].join(" \n "));
  const maskedText = maskSpans(text, mentions as ConceptMention[]);

  // Metrics: every number must come from the evidence.
  const factNumbers = extractNumbers(supportTexts.join(" \n "));
  for (const n of extractNumbers(maskedText)) {
    const match = factNumbers.find((fn) => fn.core === n.core);
    if (!match) {
      violations.push({
        claimId,
        rule: "UNSUPPORTED_METRIC",
        phrase: n.raw,
        factCodes: citedCodes,
        message: `${q(n.raw)} does not appear in the cited evidence (${citedCodes.join(", ")}). The Truth Gate never invents numbers, percentages or quantities.`,
      });
    } else if (n.plus && !factNumbers.some((fn) => fn.core === n.core && fn.plus)) {
      violations.push({
        claimId,
        rule: "UNSUPPORTED_METRIC",
        phrase: n.raw,
        factCodes: citedCodes,
        message: `${q(n.raw)} inflates the evidence, which states exactly ${n.core}.`,
      });
    }
  }

  // Responsibility inflation.
  const maskedNorm = normalizeText(maskedText);
  const supportNorm = normalizeText(supportTexts.join(" \n "));
  for (const g of INFLATION_GROUPS) {
    const used = g.words.find((w) => wordRe(w).test(maskedNorm));
    if (!used) continue;
    const supported = g.words.some((w) => wordRe(w).test(supportNorm));
    if (!supported) {
      violations.push({
        claimId,
        rule: "RESPONSIBILITY_INFLATION",
        phrase: used,
        factCodes: citedCodes,
        message: `${q(used)} implies ${g.label} that the cited evidence (${citedCodes.join(", ")}) does not describe.`,
      });
    }
  }

  // Invented tools / products / proper names.
  const licensedVocab = Object.keys(licensedBy).flatMap((id) => [conceptLabel(id), ...(getConcept(id)?.aliases ?? [])]);
  const vocab = vocabularyOf(...verified.flatMap((f) => [f.canonicalFact, ...approvedWording(f), f.context, f.roleContext]), ...licensedVocab);
  for (const t of properTerms(text)) {
    const inMention = mentions.some((m) => t.index >= m.start && t.index < m.end);
    if (inMention) continue;
    if (!vocab.has(t.token.toLowerCase())) {
      violations.push({
        claimId,
        rule: "UNSUPPORTED_TERM",
        phrase: t.token,
        factCodes: citedCodes,
        message: `${q(t.token)} does not appear in the cited evidence (${citedCodes.join(", ")}). Tools, products, employers and other proper names must come from verified facts.`,
      });
    }
  }

  return { violations, licensedBy };
}

// ───────────────────────── Relationship check ─────────────────────────

/** Concept kinds whose claims are about holding something, not doing it (checked by other rules). */
const RELATION_SKIP_KINDS = new Set<ConceptKind>(["certification", "license", "clearance", "environment"]);

/**
 * A claim may not assert a stronger relationship to a subject than the cited evidence shows.
 * "Escalated Active Directory account issues to Tier 2" can be cited for Active Directory,
 * but only for ESCALATED_TO it — never for supporting or administering it.
 */
function checkRelations(
  claimId: string,
  text: string,
  verified: LedgerFact[],
  section: ClaimSection,
  kind: ClaimKind | undefined,
  licensedBy: Record<string, string[]>,
  experienceBy: Record<string, string[]>,
  flagged: Span[],
): Violation[] {
  const out: Violation[] = [];
  // A verbatim restatement of a cited fact carries exactly that fact's relationship — unless the
  // claim adds production scope around it ("…in a test lab, then for every staff laptop").
  let verbatim: Span[] = verified.flatMap((f) => findPhrase(text, sanitize(f.canonicalFact).trim().replace(/[.;:!?]+$/, "")));
  if (verbatim.length && productionScope(maskSpans(text, verbatim))) verbatim = [];
  const within = (s: Span, v: Span) => v.start <= s.start && s.end <= v.end;
  const flaggedOverlap = (s: Span) => flagged.some((p) => p.start < s.end && s.start < p.end);
  // Learning context comes from where the claim sits, never from a stray word in it. When every cited fact is
  // lab or study work, hands-on wording in that section describes the lab — unless it names production work.
  const learningContext = section === "projects" || kind === "LEARNING";
  const reading = readClaim(text, { learningContext, lab: learningContext && verified.every((f) => f.experienceType === "LEARNING") });

  const unbound = [...reading.unbound];
  for (const { binding: b, parts } of reading.items) {
    const concept = getConcept(b.conceptId);
    if (concept && RELATION_SKIP_KINDS.has(concept.kind)) {
      // "Racked servers in the data center": the setting is not the claim, but the verb still is.
      for (const p of parts) if (p.start !== b.start || p.end !== b.end) unbound.push({ cue: { start: p.start, end: p.end, rel: p.rel, form: "past", word: text.slice(p.start, p.end) }, asserted: p.rel });
      continue;
    }
    if (!concept || !licensedBy[b.conceptId] || flaggedOverlap(b)) continue;
    // Words inside the same verbatim restatement as the mention are the fact's own words.
    const v = verbatim.find((x) => within(b, x));
    const live = parts.filter((p) => !(v && within(p, v)));
    const asserted = [...new Set(live.map((p) => p.rel))];
    if (!asserted.length) continue;
    const evidence = verified.map((f) => ({ f, rels: factRelationsFor(f, b.conceptId) })).filter((e) => e.rels.size);
    // "Helped configure X" needs evidence of configuring X, or of assisting with configuring it.
    const assistedOk = (a: Relation) =>
      evidence.some((e) => [...e.rels].some((r) => satisfies(r, a)) || [...(licenseForFact(e.f).analysis.assisted.get(b.conceptId) ?? [])].some((x) => satisfies(x, a)));
    const unmetActivity = live.find((p) => p.rel === "ASSISTED" && p.activity && !assistedOk(p.activity));
    if (unmetActivity?.activity) {
      out.push({
        claimId,
        rule: "RELATION_EXCEEDS_EVIDENCE",
        phrase: b.phrase,
        conceptId: b.conceptId,
        factCodes: evidence.map((e) => e.f.code),
        message: `${q(b.phrase)} claims the candidate helped with work that ${RELATION_INFO[unmetActivity.activity].label} ${concept.label}, but the cited evidence (${evidence.map((e) => `${e.f.code}: ${describeRelations(e.rels)}`).join("; ") || verified.map((f) => f.code).join(", ")}) does not show that activity. A weaker relationship never authorizes a stronger claim.`,
      });
      continue;
    }
    // Report the strongest relationship the evidence cannot back.
    for (const a of asserted.sort((x, y) => RELATION_INFO[y].strength - RELATION_INFO[x].strength)) {
      if (evidence.some((e) => [...e.rels].some((r) => satisfies(r, a)))) continue;
      const shown = evidence.map((e) => `${e.f.code}: ${describeRelations(e.rels)}`).join("; ");
      out.push({
        claimId,
        rule: "RELATION_EXCEEDS_EVIDENCE",
        phrase: b.phrase,
        conceptId: b.conceptId,
        factCodes: evidence.map((e) => e.f.code),
        message: `${q(b.phrase)} claims the candidate ${RELATION_INFO[a].label} ${concept.label}, but the cited evidence only shows ${shown} (${evidence.map((e) => q(short(e.f.canonicalFact, 70))).join(", ")}). A weaker relationship never authorizes a stronger claim.`,
        hint: `Describe it the way the evidence does (restate ${evidence.map((e) => e.f.code).join(" or ")}), or add verified evidence that you ${RELATION_INFO[a].label} ${concept.label}.${experienceBy[b.conceptId] ? "" : ` The cited facts show no hands-on experience with ${concept.label}.`}`,
      });
      break; // one violation per mention
    }
  }

  // Relation words with an object of their own ("trained new hires") need a cited fact that reaches them —
  // and that is about the same thing: another fact's verbs can't back "repaired the mail server".
  const objectWords = (cue: Span) =>
    normalizeText(text.slice(cue.end))
      .split(/[^a-z0-9+#]+/)
      .filter(Boolean)
      .slice(0, 4)
      .filter((w) => w.length > 2 && !OBJECT_STOPWORDS.has(w))
      .map(stem);
  const about = (f: LedgerFact, words: string[]) => {
    if (!words.length) return true;
    const own = new Set(normalizeText([f.canonicalFact, ...approvedWording(f), f.context ?? "", f.roleContext ?? ""].join(" ")).split(/[^a-z0-9+#]+/).map(stem));
    return words.some((w) => own.has(w));
  };
  for (const { cue, asserted } of unbound) {
    if (verbatim.some((v) => within(cue, v)) || flaggedOverlap(cue)) continue;
    const words = objectWords(cue);
    if (verified.some((f) => ceilingSatisfies(licenseForFact(f).analysis, asserted) && about(f, words))) continue;
    const phrase = text.slice(cue.start, cue.end);
    out.push({
      claimId,
      rule: "RELATION_EXCEEDS_EVIDENCE",
      phrase,
      factCodes: verified.map((f) => f.code),
      message: `${q(phrase)} claims the candidate ${RELATION_INFO[asserted].label} something, but none of the cited evidence (${verified.map((f) => `${f.code}: ${describeRelations(licenseForFact(f).analysis.ceiling)}`).join("; ")}) shows that. A weaker relationship never authorizes a stronger claim.`,
    });
  }
  return out;
}

const wordReCache = new Map<string, RegExp>();
function wordRe(w: string): RegExp {
  let re = wordReCache.get(w);
  if (!re) {
    const body = normalizeText(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
    re = new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`);
    wordReCache.set(w, re);
  }
  return re;
}

function transferHint(targetId: string, licensedBy: Record<string, string[]>): string | undefined {
  let best: { from: string; strength: number; note: string } | undefined;
  for (const from of Object.keys(licensedBy)) {
    const t = transferBetween(from, targetId);
    if (t && (!best || t.strength > best.strength)) best = { from, strength: t.strength, note: t.note };
  }
  if (!best) return undefined;
  return `Transferable, not experience: your ${conceptLabel(best.from)} evidence (${licensedBy[best.from].join(", ")}) is relevant to ${conceptLabel(targetId)}. ${best.note} Say it “is relevant to” the role; do not claim ${conceptLabel(targetId)} experience.`;
}

// ───────────────────────── Non-assertive claims ─────────────────────────

function checkNonAssertive(claim: Claim, text: string, prep: Prepared, ctx: GateContext): Violation[] {
  const out: Violation[] = [];
  const maskSpansList: Span[] = [];
  if (ctx.job) {
    maskSpansList.push(...findPhrase(text, ctx.job.title));
    maskSpansList.push(...findPhrase(text, ctx.job.company));
  }
  const masked = maskSpans(text, maskSpansList);
  for (const m of detectConcepts(masked)) {
    out.push({
      claimId: claim.id,
      rule: "ASSERTION_IN_REFERENCE",
      phrase: m.text,
      conceptId: m.conceptId,
      message: `${q(m.text)} appears in a sentence with no supporting evidence. Greetings, closings and role references may not mention skills or experience.`,
    });
  }
  for (const n of extractNumbers(masked)) {
    out.push({ claimId: claim.id, rule: "ASSERTION_IN_REFERENCE", phrase: n.raw, message: `${q(n.raw)} is a number in a sentence with no supporting evidence.` });
  }
  const pa = masked.match(PROFESSIONAL_ASSERTION);
  if (pa) out.push({ claimId: claim.id, rule: "ASSERTION_IN_REFERENCE", phrase: pa[0], message: `${q(pa[0])} asserts experience in a sentence with no supporting evidence.` });
  for (const t of properTerms(masked)) {
    if (!prep.jobVocabulary.has(t.token.toLowerCase())) {
      out.push({ claimId: claim.id, rule: "UNSUPPORTED_TERM", phrase: t.token, message: `${q(t.token)} is not part of the target job reference and has no supporting evidence.` });
    }
  }
  return out;
}

// ───────────────────────── Structured claims ─────────────────────────

function joinSegments(claim: Claim): string {
  return (claim.segments ?? []).map((s) => s.text.trim()).join(" ").replace(/\s+([,.;:!?])/g, "$1").replace(/\s+/g, " ").trim();
}

function sameText(a: string, b: string): boolean {
  return a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
}

function checkTarget(claim: Claim, text: string, prep: Prepared, requireReference: boolean): Violation[] {
  const out: Violation[] = [];
  if (requireReference && !TARGET_REFERENCE.test(text)) {
    out.push({ claimId: claim.id, rule: "MALFORMED_BRIDGE", phrase: text, message: `The target part of a transferable statement must clearly refer to the employer's role (e.g. “this role”), not to the candidate.` });
  }
  const pa = text.match(PROFESSIONAL_ASSERTION);
  if (pa) out.push({ claimId: claim.id, rule: "MALFORMED_BRIDGE", phrase: pa[0], message: `${q(pa[0])} asserts experience inside the job-reference part of a transferable statement.` });
  if (prep.jobConcepts.size) {
    // Top-level mentions only ("Microsoft 365 administration", not also "Microsoft 365"),
    // and anything the posting's requirements imply counts as part of the posting.
    const allowed = impliedClosure(prep.jobConcepts);
    const all = detectConcepts(text);
    const top = all.filter((m) => !all.some((o) => o !== m && spanContains(o, m)));
    for (const m of top) {
      if (!allowed.has(m.conceptId) && getConcept(m.conceptId)?.kind !== "environment") {
        out.push({
          claimId: claim.id,
          rule: "MALFORMED_BRIDGE",
          phrase: m.text,
          conceptId: m.conceptId,
          message: `${q(m.text)} is not a requirement of the target posting, so it cannot be used as the target of a transferable statement.`,
        });
      }
    }
  }
  return out;
}

function checkBridge(claim: Claim, prep: Prepared): EvidenceCheck {
  const violations: Violation[] = [];
  const licensedBy: Record<string, string[]> = {};
  const segs = claim.segments ?? [];
  const cand = segs.filter((s) => s.role === "candidate");
  const conn = segs.filter((s) => s.role === "connective");
  const targ = segs.filter((s) => s.role === "target");
  if (!cand.length || !conn.length || !targ.length || !sameText(joinSegments(claim), claim.text)) {
    violations.push({ claimId: claim.id, rule: "MALFORMED_BRIDGE", phrase: claim.text, message: "Transferable statements must be built from a candidate part, an approved connective and a job-reference part." });
    return { violations, licensedBy };
  }
  for (const c of conn) {
    const n = normalizeText(c.text).replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim();
    if (!BRIDGE_CONNECTIVES.includes(n)) {
      violations.push({ claimId: claim.id, rule: "MALFORMED_BRIDGE", phrase: c.text, message: `${q(c.text)} is not an approved transferable-skill connective (${BRIDGE_CONNECTIVES.join(" / ")}).` });
    }
  }
  for (const c of cand) {
    const r = checkEvidenceText(claim.id, c.text, c.supportingFactCodes ?? claim.supportingFactCodes, "letter", null, prep);
    violations.push(...r.violations);
    for (const [k, v] of Object.entries(r.licensedBy)) licensedBy[k] = [...new Set([...(licensedBy[k] ?? []), ...v])];
  }
  for (const t of targ) violations.push(...checkTarget(claim, t.text, prep, true));
  return { violations, licensedBy };
}

const GAP_OPENERS = ["i haven't", "i have not", "i don't yet have", "i do not yet have"];

function checkHonestGap(claim: Claim, prep: Prepared): EvidenceCheck {
  const violations: Violation[] = [];
  const licensedBy: Record<string, string[]> = {};
  const segs = claim.segments ?? [];
  const first = segs[0];
  const opener = first ? normalizeText(first.text).trim() : "";
  if (!first || first.role !== "connective" || !GAP_OPENERS.some((g) => opener.startsWith(g)) || !sameText(joinSegments(claim), claim.text)) {
    violations.push({ claimId: claim.id, rule: "MALFORMED_BRIDGE", phrase: claim.text, message: "Honest-gap statements must open with an explicit admission such as “I haven't … professionally yet”." });
    return { violations, licensedBy };
  }
  for (const s of segs) {
    if (s.role === "connective") {
      for (const m of detectConcepts(s.text)) violations.push({ claimId: claim.id, rule: "MALFORMED_BRIDGE", phrase: m.text, message: `${q(m.text)} must be in the gap part of the sentence, not the connective.` });
      if (extractNumbers(s.text).length) violations.push({ claimId: claim.id, rule: "MALFORMED_BRIDGE", phrase: s.text, message: "Numbers are not allowed in honest-gap connectives." });
    } else if (s.role === "candidate") {
      const r = checkEvidenceText(claim.id, s.text, s.supportingFactCodes ?? claim.supportingFactCodes, "interview", null, prep);
      violations.push(...r.violations);
      Object.assign(licensedBy, r.licensedBy);
    } else {
      violations.push(...checkTarget(claim, s.text, prep, false));
    }
  }
  return { violations, licensedBy };
}

// ───────────────────────── Public API ─────────────────────────

const sanitize = sanitizeText;

/** Allowed wording the fact's relationship actually supports (overstated wording backs nothing). */
function approvedWording(f: LedgerFact): string[] {
  const issues = licenseForFact(f).wordingIssues;
  return f.allowedWording.filter((w) => !issues.some((i) => i.phrase === w));
}

const OBJECT_STOPWORDS = new Set(["the", "and", "for", "with", "our", "their", "all", "each", "every", "any", "new", "old", "own", "them", "they", "this", "that", "these", "those", "from", "into", "onto", "more", "most", "many", "much", "some", "several", "one", "two", "three", "store", "stores", "staff", "team", "teams", "user", "users", "daily", "weekly", "issues", "issue"]);
function stem(w: string): string {
  return w.replace(/(ies)$/, "y").replace(/(es|s)$/, "");
}

/** Words mixing Latin with look-alike Cyrillic or Greek letters ("Rеpaired" with a Cyrillic е). */
function lookalikeWords(text: string): string[] {
  return (text.match(/\p{L}+/gu) ?? []).filter((w) => /\p{Script=Latin}/u.test(w) && /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(w));
}

export function validateClaim(original: Claim, ctx: GateContext, prepared?: Prepared): ClaimResult {
  const prep = prepared ?? prepare(ctx);
  // Check what a reader sees: hidden characters and look-alike letters must not hide words from the gate.
  const claim: Claim = { ...original, text: sanitize(original.text), segments: original.segments?.map((s) => ({ ...s, text: sanitize(s.text) })) };
  let violations: Violation[] = [];
  let licensedBy: Record<string, string[]> = {};
  switch (claim.kind) {
    case "HEADER":
      break; // contact details come straight from the profile record
    case "COURTESY":
    case "ROLE_REFERENCE":
      violations = checkNonAssertive(claim, claim.text, prep, ctx);
      break;
    case "BRIDGE":
      ({ violations, licensedBy } = checkBridge(claim, prep));
      break;
    case "HONEST_GAP":
      ({ violations, licensedBy } = checkHonestGap(claim, prep));
      break;
    default:
      if (EVIDENCE_KINDS.includes(claim.kind)) {
        ({ violations, licensedBy } = checkEvidenceText(claim.id, claim.text, claim.supportingFactCodes, claim.section, claim.positionId, prep, claim.kind));
      }
  }
  if (claim.kind !== "HEADER") {
    for (const w of lookalikeWords(claim.text)) {
      violations.push({ claimId: claim.id, rule: "UNSUPPORTED_TERM", phrase: w, message: `${q(w)} mixes letters from different alphabets (look-alike characters). Retype it in plain letters so the Truth Gate can read it.` });
    }
  }
  return { claimId: claim.id, status: violations.length ? "BLOCKED" : "PASSED", violations, licensedBy };
}

export function validateClaims(claims: Claim[], ctx: GateContext): GateReport {
  const prep = prepare(ctx);
  const results: Record<string, ClaimResult> = {};
  const all: Violation[] = [];
  for (const c of claims) {
    const r = validateClaim(c, ctx, prep);
    results[c.id] = r;
    all.push(...r.violations);
  }
  return { status: all.length ? "BLOCKED" : "PASSED", engineVersion: TRUTH_GATE_VERSION, checkedClaims: claims.length, violations: all, claims: results };
}

/** Convenience for the claim checker UI and tests: validate free text against chosen facts. */
export function checkStatement(
  text: string,
  supportingFactCodes: string[],
  ctx: GateContext,
  opts: { section?: ClaimSection; kind?: ClaimKind; positionId?: string | null } = {},
): ClaimResult {
  return validateClaim(
    { id: "statement", text, supportingFactCodes, section: opts.section ?? "experience", kind: opts.kind ?? "EXPERIENCE", positionId: opts.positionId ?? null, origin: "user" },
    ctx,
  );
}
