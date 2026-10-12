// Explainable job matching. No single opaque percentage: the score is a
// weighted sum of named components, and hard requirements can override it.

import type { CandidateSnapshot, DegreeLevel, JobRecord, LedgerFact } from "@/lib/domain/types";
import { conceptEvidenceIndex, experienceConcepts, isProfessional, licenseForFact, monthsBetween, type ConceptEvidence } from "@/lib/evidence/ledger";
import { analyzeJob, type JobAnalysis, type ReqImportance } from "@/lib/jobs/analyze";
import { freshness, type FreshnessInfo } from "@/lib/jobs/freshness";
import { normalizeCompany, formatSalary } from "@/lib/jobs/normalize";
import { conceptLabel, getConcept, transferBetween } from "@/lib/ontology/concepts";
import { containsPhrase } from "@/lib/ontology/detect";

export const MATCH_ENGINE_VERSION = "match/1.0.0";

export type Tier = "STRONG" | "GOOD" | "STRETCH" | "SKIP";
/**
 * EXPOSURE_ONLY: the ledger mentions the skill only through a weaker relationship
 * (escalated it, observed it, worked alongside the team that does it) — not experience.
 */
export type RequirementStatus = "VERIFIED" | "PARTIAL" | "LEARNING_ONLY" | "TRANSFERABLE" | "NOT_VERIFIED" | "EXPOSURE_ONLY" | "HARD_GAP" | "GAP";

export interface RequirementMatch {
  conceptId: string;
  label: string;
  importance: ReqImportance;
  group?: string;
  evidenceText: string;
  status: RequirementStatus;
  factCodes: string[];
  transfer?: { fromConceptId: string; fromLabel: string; strength: number; note: string; factCodes: string[] };
}

export interface ScoreComponent {
  key: "verifiedSkills" | "transferableSkills" | "experience" | "education" | "location" | "compensation" | "freshness" | "preferences";
  label: string;
  weight: number;
  score: number;
  explanation: string;
}

export interface Blocker {
  key: "CLEARANCE" | "LICENSE" | "LOCATION" | "DEGREE" | "SALARY_FLOOR" | "SENIORITY" | "EMPLOYMENT_TYPE" | "EXCLUDED_COMPANY" | "EXCLUDED_KEYWORD" | "CLOSED";
  message: string;
}

export interface MatchResult {
  engineVersion: string;
  tier: Tier;
  score: number;
  components: ScoreComponent[];
  requirements: RequirementMatch[];
  counts: { required: number; requiredVerified: number; hardGaps: number; transferable: number; notVerified: number; exposureOnly: number; partial: number; preferredGaps: number };
  blockers: Blocker[];
  caps: string[];
  reasons: string[];
  summary: string;
  freshness: FreshnessInfo;
  candidateYears: { total: number; relevant: number };
  computedAt: string;
}

const WEIGHTS: Record<ScoreComponent["key"], number> = {
  verifiedSkills: 30,
  transferableSkills: 10,
  experience: 15,
  education: 8,
  location: 10,
  compensation: 10,
  freshness: 5,
  preferences: 12,
};

const IMPORTANCE_WEIGHT: Record<ReqImportance, number> = { REQUIRED: 1, UNSPECIFIED: 0.75, RESPONSIBILITY: 0.5, PREFERRED: 0.4 };
const DEGREE_RANK: Record<DegreeLevel, number> = { HIGH_SCHOOL: 1, CERTIFICATE: 2, ASSOCIATE: 3, BACHELOR: 4, MASTER: 5, DOCTORATE: 6 };
const LEVEL_RANK = { ENTRY: 0, EARLY: 1, MID: 2, SENIOR: 3 } as const;
const CLEARANCE_RANK = { NONE: 0, PUBLIC_TRUST: 1, SECRET: 2, TOP_SECRET: 3 } as const;

function evidenceFor(idx: Map<string, ConceptEvidence>, id: string): ConceptEvidence {
  return idx.get(id) ?? { conceptId: id, verified: [], unverified: [], professional: [], partial: [], exposure: [] };
}

/** Merge overlapping date ranges, return total months. */
function mergedMonths(ranges: { start: string; end?: string | null }[], now: Date): number {
  const toIdx = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return y * 12 + ((m || 1) - 1);
  };
  const nowIdx = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const iv = ranges.map((r) => [toIdx(r.start), r.end ? toIdx(r.end) : nowIdx] as [number, number]).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const r of iv) {
    if (!cur || r[0] > cur[1] + 1) {
      if (cur) total += cur[1] - cur[0] + 1;
      cur = [...r];
    } else cur[1] = Math.max(cur[1], r[1]);
  }
  if (cur) total += cur[1] - cur[0] + 1;
  return total;
}

function cityOf(loc: string): { city: string; region: string } {
  const parts = loc.toLowerCase().split(/[,;|/]/).map((s) => s.trim()).filter(Boolean);
  return { city: parts[0] ?? "", region: (parts[1] ?? "").replace(/[^a-z]/g, "") };
}

function locationMatches(jobLoc: string, accepted: string[]): boolean {
  const j = jobLoc.toLowerCase();
  return accepted.some((a) => {
    if (/^remote$/i.test(a.trim())) return false;
    const { city, region } = cityOf(a);
    if (!city) return false;
    if (j.includes(city)) return !region || j.includes(region) || !/,/.test(j);
    return false;
  });
}

export function matchJob(candidate: CandidateSnapshot, job: JobRecord, opts: { analysis?: JobAnalysis; now?: Date } = {}): MatchResult {
  const now = opts.now ?? new Date();
  const analysis = opts.analysis ?? analyzeJob(job);
  const prefs = candidate.preferences;
  const facts = candidate.facts;
  const idx = conceptEvidenceIndex(facts);
  const verifiedConcepts = [...idx.values()].filter((e) => e.verified.length).map((e) => e.conceptId);

  // ── Requirement-level classification ──
  const requirements: RequirementMatch[] = analysis.requirements.map((r) => {
    const ev = evidenceFor(idx, r.conceptId);
    const base = { conceptId: r.conceptId, label: r.label, importance: r.importance, group: r.group, evidenceText: r.evidenceText };
    if (ev.professional.length) return { ...base, status: "VERIFIED" as const, factCodes: ev.professional.map((f) => f.code) };
    // Hands-on, but below what the requirement names (used Intune, posting asks for MDM administration).
    if (ev.partial.length) return { ...base, status: "PARTIAL" as const, factCodes: ev.partial.map((f) => f.code) };
    if (ev.verified.length) {
      const c = getConcept(r.conceptId);
      // An earned certification counts fully; study-only evidence does not.
      const earnedCert = c?.kind === "certification" && ev.verified.some((f) => (f.category === "CERTIFICATION" || f.category === "LICENSE") && f.experienceType !== "LEARNING");
      if (earnedCert) return { ...base, status: "VERIFIED" as const, factCodes: ev.verified.map((f) => f.code) };
      return { ...base, status: "LEARNING_ONLY" as const, factCodes: ev.verified.map((f) => f.code) };
    }
    let best: RequirementMatch["transfer"];
    for (const from of verifiedConcepts) {
      const t = transferBetween(from, r.conceptId);
      if (!t) continue;
      const fe = evidenceFor(idx, from);
      if (!fe.professional.length) continue;
      if (!best || t.strength > best.strength) {
        best = { fromConceptId: from, fromLabel: conceptLabel(from), strength: t.strength, note: t.note, factCodes: fe.professional.map((f) => f.code) };
      }
    }
    // Direct-but-unverified evidence is the most actionable status: verify it to count.
    if (ev.unverified.length) return { ...base, status: "NOT_VERIFIED" as const, factCodes: ev.unverified.map((f) => f.code), transfer: best };
    if (best) return { ...base, status: "TRANSFERABLE" as const, factCodes: best.factCodes, transfer: best };
    if (ev.exposure.length) return { ...base, status: "EXPOSURE_ONLY" as const, factCodes: ev.exposure.map((f) => f.code) };
    return { ...base, status: r.importance === "REQUIRED" ? ("HARD_GAP" as const) : ("GAP" as const), factCodes: [] };
  });

  // Groups ("SCCM or Intune"): best member status represents the group.
  const STATUS_VALUE: Record<RequirementStatus, number> = { VERIFIED: 1, PARTIAL: 0.5, LEARNING_ONLY: 0.35, TRANSFERABLE: 0, NOT_VERIFIED: 0, EXPOSURE_ONLY: 0, HARD_GAP: 0, GAP: 0 };
  const units = new Map<string, RequirementMatch[]>();
  for (const r of requirements) {
    const key = r.group ?? r.conceptId;
    units.set(key, [...(units.get(key) ?? []), r]);
  }
  let totalW = 0,
    verifiedW = 0,
    transferW = 0,
    gapW = 0;
  let requiredUnits = 0,
    requiredVerified = 0,
    hardGaps = 0;
  for (const members of units.values()) {
    const imp = members.reduce((acc, m) => (IMPORTANCE_WEIGHT[m.importance] > IMPORTANCE_WEIGHT[acc] ? m.importance : acc), members[0].importance);
    const w = IMPORTANCE_WEIGHT[imp];
    const best = members.reduce((a, b) => (STATUS_VALUE[b.status] + (b.transfer?.strength ?? 0) * 0.01 > STATUS_VALUE[a.status] + (a.transfer?.strength ?? 0) * 0.01 ? b : a));
    totalW += w;
    verifiedW += w * STATUS_VALUE[best.status];
    if (best.status !== "VERIFIED") {
      gapW += w;
      if (best.status === "TRANSFERABLE") transferW += w * (best.transfer?.strength ?? 0);
    }
    if (imp === "REQUIRED") {
      requiredUnits++;
      if (best.status === "VERIFIED") requiredVerified++;
      // Exposure (escalated / observed / worked alongside) does not meet a requirement.
      if (best.status === "HARD_GAP" || best.status === "EXPOSURE_ONLY") hardGaps++;
    }
    // A group satisfied by one member is not a gap for the others.
    if (members.length > 1 && best.status === "VERIFIED") {
      for (const m of members) if (m !== best && (m.status === "HARD_GAP" || m.status === "GAP")) m.status = "GAP";
    }
  }
  const counts = {
    required: requiredUnits,
    requiredVerified,
    hardGaps,
    transferable: requirements.filter((r) => r.status === "TRANSFERABLE").length,
    notVerified: requirements.filter((r) => r.status === "NOT_VERIFIED").length,
    exposureOnly: requirements.filter((r) => r.status === "EXPOSURE_ONLY").length,
    partial: requirements.filter((r) => r.status === "PARTIAL").length,
    preferredGaps: requirements.filter((r) => r.status === "GAP").length,
  };

  const components: ScoreComponent[] = [];
  const blockers: Blocker[] = [];
  const caps: string[] = [];

  // ── Verified skills ──
  const verifiedScore = totalW ? Math.round((verifiedW / totalW) * 100) : 50;
  components.push({
    key: "verifiedSkills",
    label: "Verified skill match",
    weight: WEIGHTS.verifiedSkills,
    score: verifiedScore,
    explanation: totalW
      ? `${requiredVerified} of ${requiredUnits} required items are backed by verified professional evidence; ${requirements.filter((r) => r.status === "VERIFIED").length} of ${requirements.length} recognised requirements overall.`
      : "No recognisable skill requirements were found in the posting.",
  });

  // ── Transferable ──
  const transferScore = gapW ? Math.round(Math.min(1, transferW / gapW) * 100) : 100;
  components.push({
    key: "transferableSkills",
    label: "Transferable experience",
    weight: WEIGHTS.transferableSkills,
    score: transferScore,
    explanation: counts.transferable
      ? `${counts.transferable} unmet requirement${counts.transferable === 1 ? "" : "s"} have related verified experience (transferable, not claimable).`
      : gapW
        ? "None of the unmet requirements have related verified experience."
        : "Every requirement is already covered by verified evidence.",
  });

  // ── Experience years ──
  const profPositions = candidate.positions.filter((p) => p.verificationStatus === "VERIFIED" && p.employmentType !== "INTERNSHIP");
  const totalMonths = mergedMonths(profPositions.map((p) => ({ start: p.startDate, end: p.endDate })), now);
  const reqConcepts = new Set(analysis.requirements.map((r) => r.conceptId));
  const relevantPositions = profPositions.filter((p) =>
    facts.some((f) => f.positionId === p.id && f.verificationStatus === "VERIFIED" && isProfessional(f) && [...experienceConcepts(f)].some((c) => reqConcepts.has(c) || [...reqConcepts].some((rc) => transferBetween(c, rc)))),
  );
  const relevantMonths = mergedMonths(relevantPositions.map((p) => ({ start: p.startDate, end: p.endDate })), now);
  const totalYears = Math.round((totalMonths / 12) * 10) / 10;
  const relevantYears = Math.round((relevantMonths / 12) * 10) / 10;
  let expScore = 80;
  let expExplain = "The posting does not state a years-of-experience requirement.";
  if (analysis.minYears) {
    const need = analysis.minYears.years;
    expScore = relevantYears >= need ? 100 : relevantYears >= need - 1 ? 70 : relevantYears >= need / 2 ? 45 : 15;
    expExplain = `Posting asks for ${need}+ years; you have ${relevantYears} years of relevant verified experience (${totalYears} total).`;
    if (analysis.minYears.importance !== "PREFERRED" && need >= Math.max(totalYears, relevantYears) + 4) {
      blockers.push({ key: "SENIORITY", message: `Requires ${need}+ years; your verified work history totals ${totalYears} years.` });
    }
  }
  components.push({ key: "experience", label: "Experience level", weight: WEIGHTS.experience, score: expScore, explanation: expExplain });

  // Seniority from title
  const candLevel = LEVEL_RANK[candidate.profile.careerLevel] ?? 1;
  if (analysis.seniority === "LEAD" && candLevel < 3) blockers.push({ key: "SENIORITY", message: `“${job.title}” is a lead/manager-level title, far beyond your current career level.` });
  else if (analysis.seniority === "SENIOR" && candLevel <= 1) blockers.push({ key: "SENIORITY", message: `“${job.title}” is a senior-level title; your career level is ${candidate.profile.careerLevel.toLowerCase()}.` });
  else if (analysis.seniority === "SENIOR" && candLevel === 2) caps.push("Senior title vs. mid-level background — capped at STRETCH.");

  // ── Education ──
  const verifiedEdu = candidate.education.filter((e) => e.verificationStatus === "VERIFIED" && e.status === "COMPLETED");
  const bestDegree = verifiedEdu.reduce((acc, e) => Math.max(acc, DEGREE_RANK[e.level] ?? 0), 0);
  let eduScore = 100;
  let eduExplain = "No education requirement detected.";
  if (analysis.degree) {
    const need = DEGREE_RANK[analysis.degree.level];
    const label = analysis.degree.level.replace("_", " ").toLowerCase();
    if (bestDegree >= need) {
      eduScore = 100;
      eduExplain = `Posting asks for a ${label} degree; your verified education meets it.`;
    } else if (analysis.degree.importance === "PREFERRED") {
      eduScore = 70;
      eduExplain = `A ${label} degree is preferred, not required.`;
    } else if (analysis.degree.equivalencyAllowed) {
      eduScore = totalYears >= 2 ? 65 : 40;
      eduExplain = `Posting asks for a ${label} degree or equivalent experience; you would rely on the equivalency clause.`;
    } else {
      eduScore = 0;
      eduExplain = `Posting requires a ${label} degree with no equivalency stated; your verified education does not meet it.`;
      blockers.push({ key: "DEGREE", message: `Requires a ${label} degree with no stated equivalency.` });
    }
  }
  components.push({ key: "education", label: "Education", weight: WEIGHTS.education, score: eduScore, explanation: eduExplain });

  // ── Location / remote ──
  const rp = prefs.remotePreference;
  const jobLoc = job.location ?? "";
  const remote = analysis.remote.value;
  const accepted = prefs.acceptableLocations;
  const wantsRemoteOk = accepted.some((a) => /^remote$/i.test(a.trim())) || rp !== "ONSITE_PREFERRED";
  const localOk = jobLoc ? locationMatches(jobLoc, accepted) : false;
  let locScore = 50;
  let locExplain = "";
  if (remote === "REMOTE") {
    const restricted = analysis.remote.restriction;
    const country = (candidate.profile.country ?? "US").toLowerCase();
    if (restricted && /\b(uk|canada|eu|europe|india|emea)\b/i.test(restricted) && country === "us") {
      locScore = 0;
      blockers.push({ key: "LOCATION", message: `Remote role restricted to ${restricted}.` });
      locExplain = `Remote, but restricted to ${restricted}.`;
    } else {
      locScore = wantsRemoteOk ? 100 : 70;
      locExplain = `Remote role${restricted ? ` (${restricted})` : ""}.`;
    }
  } else if (remote === "HYBRID" || remote === "ONSITE") {
    if (rp === "REMOTE_ONLY") {
      locScore = 0;
      blockers.push({ key: "LOCATION", message: `${remote === "HYBRID" ? "Hybrid" : "On-site"} role; your preference is remote only.` });
      locExplain = "You only accept remote roles.";
    } else if (localOk) {
      locScore = remote === "ONSITE" && rp === "REMOTE_OR_HYBRID" ? 45 : 100;
      locExplain = `${remote === "HYBRID" ? "Hybrid" : "On-site"} in ${jobLoc}, which is in your acceptable locations.`;
    } else if (prefs.willingToRelocate) {
      locScore = 55;
      locExplain = `${jobLoc || "Location"} would require relocation (you are open to it).`;
    } else if (jobLoc) {
      locScore = 0;
      blockers.push({ key: "LOCATION", message: `${remote === "HYBRID" ? "Hybrid" : "On-site"} in ${jobLoc}, outside your acceptable locations, and you are not relocating.` });
      locExplain = `${jobLoc} is outside your acceptable locations.`;
    } else {
      locScore = 40;
      locExplain = "Location not listed.";
    }
  } else {
    locScore = localOk ? 85 : jobLoc ? 35 : 50;
    locExplain = `Remote status UNKNOWN; location ${jobLoc || "not listed"}${localOk ? " matches your list" : ""}.`;
  }
  components.push({ key: "location", label: "Location / remote", weight: WEIGHTS.location, score: locScore, explanation: locExplain });

  // ── Compensation ──
  const { annualMin, annualMax } = analysis.salary;
  let payScore = 55;
  let payExplain = "Salary not listed (UNKNOWN).";
  if (annualMax != null || annualMin != null) {
    const top = annualMax ?? annualMin!;
    const listed = formatSalary(analysis.salary.min, analysis.salary.max, analysis.salary.period);
    if (prefs.salaryHardFloor != null && top < prefs.salaryHardFloor) {
      payScore = 0;
      payExplain = `Listed ${listed} (≈$${Math.round(top / 1000)}k/yr) is below your hard floor of $${Math.round(prefs.salaryHardFloor / 1000)}k.`;
      blockers.push({ key: "SALARY_FLOOR", message: `Pay tops out around $${Math.round(top / 1000)}k/yr, below your $${Math.round(prefs.salaryHardFloor / 1000)}k floor.` });
    } else if (prefs.desiredSalaryMin == null || top >= prefs.desiredSalaryMin) {
      payScore = 100;
      payExplain = `Listed ${listed} meets your target.`;
    } else {
      payScore = 60;
      payExplain = `Listed ${listed} is above your floor but below your $${Math.round(prefs.desiredSalaryMin / 1000)}k target.`;
    }
    if (analysis.salary.source === "TEXT") payExplain += " (parsed from text — LIKELY)";
  }
  components.push({ key: "compensation", label: "Compensation", weight: WEIGHTS.compensation, score: payScore, explanation: payExplain });

  // ── Freshness ──
  const fresh = freshness(job, now);
  components.push({ key: "freshness", label: "Freshness", weight: WEIGHTS.freshness, score: fresh.score, explanation: fresh.label + "." });

  // ── Preferences ──
  let prefScore = 50;
  const prefNotes: string[] = [];
  const titleNorm = job.title.toLowerCase();
  const titleHit = prefs.targetTitles.find((t) => {
    const words = t.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const hits = words.filter((w) => titleNorm.includes(w)).length;
    return words.length && hits / words.length >= 0.6;
  });
  if (titleHit) {
    prefScore += 35;
    prefNotes.push(`title matches your target “${titleHit}”`);
  }
  const kwHits = prefs.targetKeywords.filter((k) => containsPhrase(`${job.title}\n${job.description}`, k));
  if (kwHits.length) {
    prefScore += Math.min(15, kwHits.length * 5);
    prefNotes.push(`mentions ${kwHits.slice(0, 3).join(", ")}`);
  }
  const et = analysis.employmentType.value;
  if (et !== "UNKNOWN" && prefs.excludedEmploymentTypes.includes(et)) {
    blockers.push({ key: "EMPLOYMENT_TYPE", message: `${et.replace("_", "-").toLowerCase()} roles are excluded in your preferences.` });
  } else if (et !== "UNKNOWN" && prefs.employmentTypes.length && !prefs.employmentTypes.includes(et)) {
    prefScore -= 20;
    prefNotes.push(`${et.replace("_", "-").toLowerCase()} is not one of your preferred employment types`);
  }
  const companyNorm = normalizeCompany(job.company);
  if (prefs.excludedCompanies.some((c) => normalizeCompany(c) === companyNorm)) blockers.push({ key: "EXCLUDED_COMPANY", message: `${job.company} is on your excluded-companies list.` });
  const kwBad = prefs.excludedKeywords.find((k) => containsPhrase(`${job.title}\n${job.description}`, k));
  if (kwBad) blockers.push({ key: "EXCLUDED_KEYWORD", message: `Posting mentions “${kwBad}”, which you excluded.` });
  if (analysis.travelPercent != null && prefs.canTravelPercent != null && analysis.travelPercent > prefs.canTravelPercent) {
    prefScore -= 25;
    prefNotes.push(`requires ${analysis.travelPercent}% travel (you accept up to ${prefs.canTravelPercent}%)`);
  }
  prefScore = Math.max(0, Math.min(100, prefScore));
  components.push({ key: "preferences", label: "Your preferences", weight: WEIGHTS.preferences, score: prefScore, explanation: prefNotes.length ? `Posting ${prefNotes.join("; ")}.` : "No strong preference signals either way." });

  // ── Hard requirements: clearance & licenses ──
  if (analysis.clearance?.mustHaveActive && CLEARANCE_RANK[prefs.securityClearance] < CLEARANCE_RANK[analysis.clearance.level]) {
    blockers.push({ key: "CLEARANCE", message: `Requires an existing ${analysis.clearance.level.replace("_", " ").toLowerCase()} clearance; your profile lists ${prefs.securityClearance.replace("_", " ").toLowerCase()}.` });
  } else if (analysis.clearance && !analysis.clearance.mustHaveActive && prefs.securityClearance === "NONE") {
    caps.push("Clearance must be obtained after hire — usually requires citizenship and a background investigation.");
  }
  for (const l of analysis.licenses) {
    if (l.importance !== "REQUIRED" && l.importance !== "UNSPECIFIED") continue;
    const has =
      l.conceptId === "drivers-license" ? prefs.hasDriversLicense || evidenceFor(idx, l.conceptId).verified.length > 0 : evidenceFor(idx, l.conceptId).verified.length > 0;
    if (!has) blockers.push({ key: "LICENSE", message: `Requires ${conceptLabel(l.conceptId)}, which is not in your verified profile.` });
  }
  if (job.status === "CLOSED") blockers.push({ key: "CLOSED", message: "The employer has closed this posting." });

  // Required certifications without equivalency are hard gaps that cap the tier.
  const missingReqCerts = requirements.filter((r) => r.importance === "REQUIRED" && getConcept(r.conceptId)?.kind === "certification" && r.status !== "VERIFIED");
  if (missingReqCerts.length) caps.push(`Required certification missing: ${missingReqCerts.map((r) => r.label).join(", ")} — capped at STRETCH.`);
  if (requiredUnits >= 3 && requiredVerified / requiredUnits < 0.4) caps.push(`Only ${requiredVerified} of ${requiredUnits} required items are verified — capped at STRETCH.`);
  if (hardGaps >= 4) caps.push(`${hardGaps} hard gaps — capped at STRETCH.`);

  // ── Total & tier ──
  const score = Math.round(components.reduce((s, c) => s + (c.score * c.weight) / 100, 0));
  // Tier needs both a good overall score AND real verified coverage of the role's skills,
  // so transferable-only coverage can never produce a STRONG match.
  const stretchCaps = [...caps];
  let tier: Tier = score >= 72 ? "STRONG" : score >= 58 ? "GOOD" : score >= 42 ? "STRETCH" : "SKIP";
  if (tier === "STRONG" && hardGaps > 1) {
    tier = "GOOD";
    caps.push(`${hardGaps} hard gaps — downgraded from STRONG to GOOD.`);
  }
  if ((tier === "STRONG" && verifiedScore < 65) || (tier === "GOOD" && verifiedScore < 55)) {
    const from = tier;
    tier = verifiedScore < 55 ? "STRETCH" : "GOOD";
    caps.push(`Only ${verifiedScore}% of the role's skill requirements are backed by verified evidence — ${from} by score, ${tier} after the verified-coverage check.`);
  }
  if (stretchCaps.length && (tier === "STRONG" || tier === "GOOD")) tier = "STRETCH";
  if (tier === "SKIP" && verifiedScore >= 50 && score >= 35) tier = "STRETCH";
  const uniqueBlockers = blockers.filter((b, i) => blockers.findIndex((x) => x.key === b.key) === i);
  blockers.length = 0;
  blockers.push(...uniqueBlockers);
  if (blockers.length) tier = "SKIP";

  const reasons: string[] = [];
  if (blockers.length) reasons.push(...blockers.map((b) => `Hard requirement override: ${b.message}`));
  reasons.push(...caps);
  reasons.push(`Score ${score}/100 from ${components.length} components (verified skills ${verifiedScore}, experience ${expScore}, location ${locScore}, pay ${payScore}).`);
  if (counts.hardGaps) reasons.push(`${counts.hardGaps} required item${counts.hardGaps === 1 ? "" : "s"} with no hands-on evidence (hard gap${counts.hardGaps === 1 ? "" : "s"}).`);
  if (counts.transferable) reasons.push(`${counts.transferable} requirement${counts.transferable === 1 ? "" : "s"} covered only by transferable experience — relevant, but not claimable as experience.`);
  if (counts.partial) reasons.push(`${counts.partial} requirement${counts.partial === 1 ? " is" : "s are"} met only partly — you used it, but the posting asks for more (for example administering it).`);
  if (counts.exposureOnly) reasons.push(`${counts.exposureOnly} requirement${counts.exposureOnly === 1 ? " appears" : "s appear"} in your evidence only as exposure (escalated, observed, assisted or worked alongside) — not experience.`);
  if (counts.notVerified) reasons.push(`${counts.notVerified} requirement${counts.notVerified === 1 ? "" : "s"} match unverified facts — verify them to count.`);

  const summary =
    tier === "SKIP" && blockers.length
      ? `SKIP — ${blockers[0].message}`
      : `${tier} MATCH — ${requiredVerified}/${requiredUnits || 0} required items verified, ${counts.hardGaps} hard gap${counts.hardGaps === 1 ? "" : "s"}, ${counts.transferable} transferable.`;

  return {
    engineVersion: MATCH_ENGINE_VERSION,
    tier,
    score,
    components,
    requirements,
    counts,
    blockers,
    caps,
    reasons,
    summary,
    freshness: fresh,
    candidateYears: { total: totalYears, relevant: relevantYears },
    computedAt: now.toISOString(),
  };
}

/** Facts most relevant to a job, used by generators to order and emphasise truthfully. */
export function factRelevance(fact: LedgerFact, analysis: JobAnalysis): number {
  // Hands-on evidence counts fully; a fact that only escalated or observed a requirement counts a little.
  const concepts = experienceConcepts(fact);
  const mentioned = licenseForFact(fact).concepts;
  let score = 0;
  for (const r of analysis.requirements) {
    const w = IMPORTANCE_WEIGHT[r.importance];
    if (concepts.has(r.conceptId)) score += w;
    else if (mentioned.has(r.conceptId)) score += w * 0.2;
    else {
      for (const c of concepts) {
        const t = transferBetween(c, r.conceptId);
        if (t) {
          score += w * t.strength * 0.5;
          break;
        }
      }
    }
  }
  return score;
}

export { monthsBetween };
