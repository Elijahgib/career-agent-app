// Career gap / skill engine. Ranks what to learn next by
// frequency × job quality × salary upside ÷ effort, using only gaps from
// jobs the user would actually want (not SKIP, not rejected).

import type { CandidateSnapshot } from "@/lib/domain/types";
import type { JobAnalysis } from "@/lib/jobs/analyze";
import type { MatchResult, RequirementStatus } from "@/lib/matching/engine";
import { conceptLabel, getConcept } from "@/lib/ontology/concepts";

export interface GapJobRef {
  jobId: string;
  title: string;
  company: string;
  tier: string;
  score: number;
  status: RequirementStatus;
}

export interface SkillRecommendation {
  conceptId: string;
  label: string;
  kind: string;
  frequency: number;
  jobs: GapJobRef[];
  priority: number;
  effort: number;
  salaryUpside: number;
  avgQuality: number;
  statuses: Partial<Record<RequirementStatus, number>>;
  actions: { type: "verify" | "practice" | "lab" | "certification" | "project"; text: string }[];
  rationale: string;
}

export interface GapReport {
  recommendations: SkillRecommendation[];
  notTrainable: { conceptId: string; label: string; frequency: number; note: string }[];
  quickWins: { factCodes: string[]; label: string; jobs: number }[];
  jobsConsidered: number;
}

const IMPORTANCE_WEIGHT = { REQUIRED: 1, UNSPECIFIED: 0.75, RESPONSIBILITY: 0.5, PREFERRED: 0.4 } as const;
const GAP_STATUSES: RequirementStatus[] = ["HARD_GAP", "GAP", "TRANSFERABLE", "LEARNING_ONLY", "NOT_VERIFIED", "EXPOSURE_ONLY", "PARTIAL"];

export interface GapInput {
  job: { id: string; title: string; company: string };
  analysis: JobAnalysis;
  match: MatchResult;
  rejected?: boolean;
}

export function computeSkillGaps(candidate: CandidateSnapshot, inputs: GapInput[]): GapReport {
  const desirable = inputs.filter((i) => !i.rejected && i.match.tier !== "SKIP");
  const target = candidate.preferences.desiredSalaryMin ?? null;
  const agg = new Map<string, { weight: number; quality: number[]; salaries: number[]; jobs: GapJobRef[]; statuses: Partial<Record<RequirementStatus, number>>; factCodes: Set<string> }>();

  for (const { job, analysis, match } of desirable) {
    const salary = analysis.salary.annualMax ?? analysis.salary.annualMin;
    for (const r of match.requirements) {
      if (!GAP_STATUSES.includes(r.status)) continue;
      const a = agg.get(r.conceptId) ?? { weight: 0, quality: [], salaries: [], jobs: [], statuses: {}, factCodes: new Set<string>() };
      if (a.jobs.some((j) => j.jobId === job.id)) continue;
      a.weight += IMPORTANCE_WEIGHT[r.importance];
      a.quality.push(match.score / 100);
      if (salary) a.salaries.push(salary);
      a.jobs.push({ jobId: job.id, title: job.title, company: job.company, tier: match.tier, score: match.score, status: r.status });
      a.statuses[r.status] = (a.statuses[r.status] ?? 0) + 1;
      if (r.status === "NOT_VERIFIED") r.factCodes.forEach((c) => a.factCodes.add(c));
      agg.set(r.conceptId, a);
    }
  }

  const recommendations: SkillRecommendation[] = [];
  const notTrainable: GapReport["notTrainable"] = [];
  const quickWins: GapReport["quickWins"] = [];

  for (const [id, a] of agg) {
    const c = getConcept(id);
    if (!c) continue;
    const frequency = a.jobs.length;
    if (a.factCodes.size) quickWins.push({ factCodes: [...a.factCodes], label: c.label, jobs: frequency });
    if (c.trainable === false || c.kind === "clearance" || c.kind === "environment") {
      notTrainable.push({ conceptId: id, label: c.label, frequency, note: c.kind === "clearance" ? "Requires sponsorship by an employer; cannot be studied for." : "Comes from job experience over time, not study." });
      continue;
    }
    const avgQuality = a.quality.reduce((x, y) => x + y, 0) / a.quality.length;
    const avgSalary = a.salaries.length ? a.salaries.reduce((x, y) => x + y, 0) / a.salaries.length : null;
    const salaryUpside = avgSalary && target ? Math.max(0.8, Math.min(1.5, avgSalary / target)) : 1;
    const effort = c.effort ?? 3;
    const priority = Math.round(((a.weight * avgQuality * salaryUpside) / effort) * 100) / 100;

    const actions: SkillRecommendation["actions"] = [];
    if (a.factCodes.size) actions.push({ type: "verify", text: `Verify ${[...a.factCodes].join(", ")} in your Evidence Ledger — it may already cover this.` });
    for (const p of c.learn?.practice ?? []) actions.push({ type: "practice", text: p });
    for (const l of c.learn?.labs ?? []) actions.push({ type: "lab", text: l });
    for (const p of c.learn?.projects ?? []) actions.push({ type: "project", text: p });
    // Certifications only when the market in front of you asks for them — not because they are popular.
    const certAppearsInJobs = c.kind === "certification";
    if (certAppearsInJobs || frequency >= 2) for (const cert of c.learn?.certifications ?? []) actions.push({ type: "certification", text: cert });
    if (!actions.length) actions.push({ type: "practice", text: `Find a small, real way to use ${c.label} (volunteer work, a lab, or a personal project) and record it as a learning fact.` });

    const statusNote = Object.entries(a.statuses).map(([k, v]) => `${v} ${k.toLowerCase().replace("_", " ")}`).join(", ");
    recommendations.push({
      conceptId: id,
      label: conceptLabel(id),
      kind: c.kind,
      frequency,
      jobs: a.jobs,
      priority,
      effort,
      salaryUpside: Math.round(salaryUpside * 100) / 100,
      avgQuality: Math.round(avgQuality * 100) / 100,
      statuses: a.statuses,
      actions,
      rationale: `Appears in ${frequency} job${frequency === 1 ? "" : "s"} you'd consider (${statusNote}); avg match ${Math.round(avgQuality * 100)}; effort ${effort}/5${salaryUpside !== 1 ? `; salary ×${salaryUpside.toFixed(2)} vs. your target` : ""}.`,
    });
  }

  recommendations.sort((x, y) => y.priority - x.priority || y.frequency - x.frequency);
  notTrainable.sort((x, y) => y.frequency - x.frequency);
  quickWins.sort((x, y) => y.jobs - x.jobs);
  return { recommendations, notTrainable, quickWins, jobsConsidered: desirable.length };
}
