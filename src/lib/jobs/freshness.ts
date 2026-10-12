import type { FieldVerification, JobRecord, JobVerifiableField } from "@/lib/domain/types";
import type { JobAnalysis } from "./analyze";
import { formatSalary } from "./normalize";

export interface FreshnessInfo {
  ageDays: number;
  basis: "POSTED" | "FIRST_SEEN";
  bucket: "NEW" | "FRESH" | "RECENT" | "AGING" | "STALE";
  label: string;
  score: number;
}

const DAY = 86_400_000;

export function freshness(job: Pick<JobRecord, "postedAt" | "firstSeenAt">, now = new Date()): FreshnessInfo {
  const basis = job.postedAt ? "POSTED" : "FIRST_SEEN";
  const ref = job.postedAt ?? job.firstSeenAt;
  const ageDays = Math.max(0, Math.floor((now.getTime() - new Date(ref).getTime()) / DAY));
  const bucket = ageDays <= 3 ? "NEW" : ageDays <= 7 ? "FRESH" : ageDays <= 14 ? "RECENT" : ageDays <= 30 ? "AGING" : "STALE";
  const score = { NEW: 100, FRESH: 85, RECENT: 65, AGING: 35, STALE: 10 }[bucket];
  const when = ageDays === 0 ? "today" : ageDays === 1 ? "1 day ago" : `${ageDays} days ago`;
  return { ageDays, basis, bucket, score, label: `${basis === "POSTED" ? "Posted" : "First seen"} ${when}` };
}

/** "Found directly from the employer N days before another source" provenance note. */
export function sourceLeadNote(job: Pick<JobRecord, "sources">): string | null {
  const sources = job.sources ?? [];
  if (sources.length < 2) return null;
  const sorted = [...sources].sort((a, b) => new Date(a.firstSeenAt).getTime() - new Date(b.firstSeenAt).getTime());
  const first = sorted[0];
  const next = sorted.find((s) => s.sourceType !== first.sourceType);
  if (!next) return null;
  const lead = Math.floor((new Date(next.firstSeenAt).getTime() - new Date(first.firstSeenAt).getTime()) / DAY);
  if (lead < 1) return null;
  const direct = ["GREENHOUSE", "LEVER", "ASHBY", "CAREER_PAGE"].includes(first.sourceType);
  return `${direct ? "Found directly from the employer's" : "First found via"} ${first.sourceType.toLowerCase().replace("_", " ")} feed ${lead} day${lead === 1 ? "" : "s"} before ${next.sourceType.toLowerCase().replace("_", " ")}.`;
}

export interface FieldStatus {
  field: JobVerifiableField;
  label: string;
  value: string;
  status: FieldVerification;
}

/**
 * Per-field verification. A field is VERIFIED only when a structured source
 * confirmed it at lastVerifiedAt; parsed text is LIKELY; missing is UNKNOWN.
 */
export function fieldStatuses(job: JobRecord, analysis: JobAnalysis): FieldStatus[] {
  const fv = job.fieldVerification ?? {};
  const pick = (f: JobVerifiableField, fallback: FieldVerification): FieldVerification => fv[f] ?? fallback;
  return [
    { field: "postingExists", label: "Posting still open", value: job.status === "CLOSED" ? "Closed" : job.lastVerifiedAt ? `Checked ${new Date(job.lastVerifiedAt).toISOString().slice(0, 10)}` : "Not checked", status: job.status === "CLOSED" ? "VERIFIED" : pick("postingExists", "UNKNOWN") },
    { field: "location", label: "Location", value: job.location || "Not listed", status: job.location ? pick("location", "LIKELY") : "UNKNOWN" },
    { field: "remoteType", label: "Remote eligibility", value: analysis.remote.value + (analysis.remote.restriction ? ` (${analysis.remote.restriction})` : ""), status: analysis.remote.source === "NONE" ? "UNKNOWN" : pick("remoteType", analysis.remote.source === "STRUCTURED" ? "VERIFIED" : "LIKELY") },
    { field: "salary", label: "Salary", value: formatSalary(analysis.salary.min, analysis.salary.max, analysis.salary.period), status: analysis.salary.source === "NONE" ? "UNKNOWN" : pick("salary", analysis.salary.source === "STRUCTURED" ? "VERIFIED" : "LIKELY") },
    { field: "employmentType", label: "Employment type", value: analysis.employmentType.value.replace("_", " ").toLowerCase(), status: analysis.employmentType.source === "NONE" ? "UNKNOWN" : pick("employmentType", analysis.employmentType.source === "STRUCTURED" ? "VERIFIED" : "LIKELY") },
    { field: "requiredExperience", label: "Required experience", value: analysis.minYears ? `${analysis.minYears.years}+ years` : "Not stated", status: analysis.minYears ? "LIKELY" : "UNKNOWN" },
    { field: "education", label: "Education", value: analysis.degree ? `${analysis.degree.level.replace("_", " ").toLowerCase()} (${analysis.degree.importance.toLowerCase()}${analysis.degree.equivalencyAllowed ? ", equivalent experience accepted" : ""})` : "Not stated", status: analysis.degree ? "LIKELY" : "UNKNOWN" },
    { field: "hardRequirements", label: "Hard requirements", value: [analysis.clearance ? `clearance (${analysis.clearance.level.toLowerCase()})` : null, ...analysis.licenses.map((l) => l.conceptId)].filter(Boolean).join(", ") || "None detected", status: "LIKELY" },
    { field: "applyUrl", label: "Application URL", value: job.applyUrl || "Not available", status: job.applyUrl ? pick("applyUrl", "LIKELY") : "UNKNOWN" },
  ];
}

export type ApplyLabel = "APPLY_NOW" | "VERIFY_FIRST" | "NOT_RECOMMENDED" | "CLOSED";

/** "APPLY NOW" is only shown when the posting was verified recently and the fit is real. */
export function applyReadiness(job: JobRecord, tier: string, now = new Date()): { label: ApplyLabel; reasons: string[] } {
  if (job.status === "CLOSED") return { label: "CLOSED", reasons: ["The employer has closed this posting."] };
  if (tier === "SKIP") return { label: "NOT_RECOMMENDED", reasons: ["Match tier is SKIP."] };
  const reasons: string[] = [];
  const verifiedRecently = job.lastVerifiedAt && now.getTime() - new Date(job.lastVerifiedAt).getTime() < 3 * DAY;
  if (!verifiedRecently) reasons.push("Posting has not been re-verified in the last 72 hours.");
  if (job.fieldVerification?.postingExists !== "VERIFIED") reasons.push("Posting existence is not verified from a structured source.");
  if (!job.applyUrl) reasons.push("No application URL on file.");
  const f = freshness(job, now);
  if (f.ageDays > 21) reasons.push(`Posting is ${f.ageDays} days old.`);
  if (tier === "STRETCH") reasons.push("Tier is STRETCH — review the hard gaps before applying.");
  if (!reasons.length && (tier === "STRONG" || tier === "GOOD")) return { label: "APPLY_NOW", reasons: ["Verified recently, fresh, and a strong or good fit."] };
  return { label: "VERIFY_FIRST", reasons };
}
