import { parseEmploymentType, parseRemoteType } from "@/lib/jobs/normalize";
import { SourceError, type FetchLike, type NormalizedJob, type SourceAdapter } from "./types";

// Lever Postings API (public, no auth):
//   GET https://api.lever.co/v0/postings/{company}?mode=json
//   GET https://api.lever.co/v0/postings/{company}/{posting_id}
interface LeverPosting {
  id: string;
  text: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  workplaceType?: string;
  categories?: { location?: string; commitment?: string; team?: string; department?: string; allLocations?: string[] };
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}

const BASE = "https://api.lever.co/v0/postings";

function stripHtml(s: string): string {
  return s.replace(/<li[^>]*>/gi, "\n- ").replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s+/g, "\n").trim();
}

export function normalizeLever(company: string, p: LeverPosting, companyName?: string): NormalizedJob {
  const parts = [p.descriptionPlain ?? ""];
  for (const l of p.lists ?? []) parts.push(`${l.text}\n${stripHtml(l.content)}`);
  if (p.additionalPlain) parts.push(p.additionalPlain);
  const sr = p.salaryRange;
  const period = sr?.interval ? (/hour/i.test(sr.interval) ? "HOUR" : "YEAR") : null;
  const remote = p.workplaceType ? (p.workplaceType === "remote" ? "REMOTE" : p.workplaceType === "hybrid" ? "HYBRID" : p.workplaceType === "on-site" || p.workplaceType === "onsite" ? "ONSITE" : "UNKNOWN") : parseRemoteType(p.categories?.location);
  return {
    sourceType: "LEVER",
    sourceName: company,
    externalId: p.id,
    url: p.hostedUrl ?? null,
    applyUrl: p.applyUrl ?? p.hostedUrl ?? null,
    title: p.text.trim(),
    company: companyName ?? company.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    location: p.categories?.location ?? null,
    remoteType: remote,
    employmentType: parseEmploymentType(p.categories?.commitment),
    salaryMin: sr?.min ?? null,
    salaryMax: sr?.max ?? null,
    salaryPeriod: period,
    salaryCurrency: sr?.currency ?? null,
    description: parts.filter(Boolean).join("\n\n").trim(),
    postedAt: p.createdAt ? new Date(p.createdAt) : null,
    department: p.categories?.department ?? p.categories?.team ?? null,
    reqId: null,
    structured: { location: !!p.categories?.location, remoteType: remote !== "UNKNOWN" && !!p.workplaceType, employmentType: !!p.categories?.commitment, salary: !!(sr?.min || sr?.max), postingExists: true },
  };
}

export const leverAdapter: SourceAdapter = {
  type: "LEVER",
  label: "Lever postings",
  describe: (company) => `${BASE}/${company}?mode=json`,
  async list(company, fetcher: FetchLike) {
    const res = await fetcher(`${BASE}/${encodeURIComponent(company)}?mode=json`);
    if (!res.ok) throw new SourceError(`Lever company "${company}" returned HTTP ${res.status}`, res.status);
    const json = (await res.json()) as LeverPosting[];
    return (Array.isArray(json) ? json : []).map((p) => normalizeLever(company, p));
  },
  async get(company, id, fetcher) {
    const res = await fetcher(`${BASE}/${encodeURIComponent(company)}/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new SourceError(`Lever returned HTTP ${res.status}`, res.status);
    return normalizeLever(company, (await res.json()) as LeverPosting);
  },
};
