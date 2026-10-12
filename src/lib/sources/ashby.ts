import { htmlToText, parseEmploymentType } from "@/lib/jobs/normalize";
import { SourceError, type FetchLike, type NormalizedJob, type SourceAdapter } from "./types";

// Ashby public job board API (no auth):
//   GET https://api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true
interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  department?: string;
  employmentType?: string;
  isRemote?: boolean;
  workplaceType?: string;
  publishedAt?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  isListed?: boolean;
  compensation?: {
    summaryComponents?: { compensationType?: string; interval?: string; currencyCode?: string; minValue?: number; maxValue?: number }[];
  };
}

const BASE = "https://api.ashbyhq.com/posting-api/job-board";

export function normalizeAshby(org: string, j: AshbyJob): NormalizedJob {
  const salary = j.compensation?.summaryComponents?.find((c) => c.compensationType === "Salary");
  const period = salary?.interval ? (/hour/i.test(salary.interval) ? "HOUR" : "YEAR") : null;
  const wt = (j.workplaceType ?? "").toLowerCase();
  const remote = j.isRemote || wt === "remote" ? "REMOTE" : wt === "hybrid" ? "HYBRID" : wt === "onsite" || wt === "on-site" ? "ONSITE" : "UNKNOWN";
  return {
    sourceType: "ASHBY",
    sourceName: org,
    externalId: j.id,
    url: j.jobUrl ?? null,
    applyUrl: j.applyUrl ?? j.jobUrl ?? null,
    title: j.title.trim(),
    company: org.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    location: j.location ?? null,
    remoteType: remote,
    employmentType: parseEmploymentType(j.employmentType),
    salaryMin: salary?.minValue ?? null,
    salaryMax: salary?.maxValue ?? null,
    salaryPeriod: period,
    salaryCurrency: salary?.currencyCode ?? null,
    description: j.descriptionPlain ?? htmlToText(j.descriptionHtml ?? ""),
    postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
    department: j.department ?? null,
    reqId: null,
    structured: { location: !!j.location, remoteType: remote !== "UNKNOWN", employmentType: !!j.employmentType, salary: !!salary, postingExists: true },
  };
}

export const ashbyAdapter: SourceAdapter = {
  type: "ASHBY",
  label: "Ashby job board",
  describe: (org) => `${BASE}/${org}?includeCompensation=true`,
  async list(org, fetcher: FetchLike) {
    const res = await fetcher(`${BASE}/${encodeURIComponent(org)}?includeCompensation=true`);
    if (!res.ok) throw new SourceError(`Ashby board "${org}" returned HTTP ${res.status}`, res.status);
    const json = (await res.json()) as { jobs?: AshbyJob[] };
    return (json.jobs ?? []).filter((j) => j.isListed !== false).map((j) => normalizeAshby(org, j));
  },
  async get(org, id, fetcher) {
    const all = await ashbyAdapter.list(org, fetcher);
    return all.find((j) => j.externalId === id) ?? null;
  },
};
