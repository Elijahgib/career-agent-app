// User-facing framing of a match. The numeric score stays internal (ranking/sorting);
// users see a tier, a plain "should I apply?" recommendation, and the reasons behind it.
import type { MatchResult, RequirementMatch, Tier } from "./engine";

export type ApplyLabel = "APPLY" | "WORTH A SHOT" | "STRETCH, BUT POSSIBLE" | "PROBABLY SKIP" | "HARD BLOCK";

export interface ApplyRecommendation {
  label: ApplyLabel;
  tone: "green" | "blue" | "amber" | "red" | "gray";
  rationale: string;
}

const TIER_LABELS: Record<Tier, string> = { STRONG: "Strong match", GOOD: "Good match", STRETCH: "Stretch", SKIP: "Skip" };

export function tierLabel(tier: Tier): string {
  return TIER_LABELS[tier];
}

export function tierTone(tier: Tier): "green" | "blue" | "amber" | "gray" {
  return tier === "STRONG" ? "green" : tier === "GOOD" ? "blue" : tier === "STRETCH" ? "amber" : "gray";
}

/**
 * Separate "job fit" from "should I apply?". Honest: a hard requirement override (clearance,
 * license, impossible location, pay below the floor, closed) is a HARD BLOCK; otherwise a job
 * is almost always at least worth considering, because postings are wish lists and an interview
 * doesn't require matching every bullet. We never call a clearly unqualified role a strong fit.
 */
export function applyRecommendation(m: MatchResult, opts: { interested?: boolean } = {}): ApplyRecommendation {
  if (m.blockers.length) {
    return { label: "HARD BLOCK", tone: "red", rationale: m.blockers[0].message };
  }
  const interested = !!opts.interested;
  const req = m.counts.required;
  const got = m.counts.requiredVerified;
  const coverage = req ? `You meet ${got} of ${req} core requirement${req === 1 ? "" : "s"} with verified experience` : "The posting lists few concrete requirements";

  if (m.tier === "STRONG") {
    return { label: "APPLY", tone: "green", rationale: `${coverage}${m.counts.transferable ? `, plus ${m.counts.transferable} that transfer` : ""}. A strong fit — apply.` };
  }
  if (m.tier === "GOOD") {
    return { label: "WORTH A SHOT", tone: "blue", rationale: `${coverage}${m.counts.hardGaps ? `, with ${m.counts.hardGaps} gap${m.counts.hardGaps === 1 ? "" : "s"}` : ""}. Job descriptions are often wish lists — worth applying.` };
  }
  if (m.tier === "STRETCH") {
    return { label: "STRETCH, BUT POSSIBLE", tone: "amber", rationale: `You're missing some requested experience${interested ? ", but it matches what you want to do" : ""}. You can still get an interview without matching every bullet — worth a shot if you want the role.` };
  }
  // SKIP, but no hard blocker: a long shot rather than impossible.
  if (interested) {
    return { label: "STRETCH, BUT POSSIBLE", tone: "amber", rationale: "A long shot on paper, but you said this is the kind of work you want — apply only if you have a specific angle to offer." };
  }
  return { label: "PROBABLY SKIP", tone: "gray", rationale: `Few of the core requirements are backed by your verified experience. Probably not the best use of your time unless you have an angle — nothing is hard-blocking you, though.` };
}

export interface FitBuckets {
  strong: RequirementMatch[];
  transferable: RequirementMatch[];
  missing: RequirementMatch[];
}

/** Group requirements for a simple "Strong / Transferable / Missing" display (no numbers). */
export function fitBuckets(m: MatchResult): FitBuckets {
  return {
    strong: m.requirements.filter((r) => r.status === "VERIFIED"),
    transferable: m.requirements.filter((r) => ["PARTIAL", "TRANSFERABLE", "LEARNING_ONLY", "NOT_VERIFIED", "EXPOSURE_ONLY"].includes(r.status)),
    missing: m.requirements.filter((r) => ["HARD_GAP", "GAP"].includes(r.status)),
  };
}
