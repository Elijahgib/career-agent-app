import { htmlToText, parseEmploymentType } from "@/lib/jobs/normalize";
import { SourceError, type FetchLike, type NormalizedJob, type SourceAdapter } from "./types";

// Direct employer career pages that publish schema.org JobPosting JSON-LD
// (the same markup search engines read). One URL = one or more postings.

interface JobPostingLd {
  "@type"?: string | string[];
  title?: string;
  description?: string;
  datePosted?: string;
  validThrough?: string;
  employmentType?: string | string[];
  hiringOrganization?: { name?: string } | string;
  jobLocation?: { address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string } } | { address?: { addressLocality?: string; addressRegion?: string } }[];
  jobLocationType?: string;
  baseSalary?: { currency?: string; value?: { minValue?: number; maxValue?: number; value?: number; unitText?: string } };
  identifier?: { value?: string } | string;
  url?: string;
}

function isPosting(o: unknown): o is JobPostingLd {
  if (!o || typeof o !== "object") return false;
  const t = (o as JobPostingLd)["@type"];
  return t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"));
}

export function extractJobPostings(html: string): JobPostingLd[] {
  const out: JobPostingLd[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1].trim());
      const items = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
      for (const it of items) if (isPosting(it)) out.push(it);
    } catch {
      // malformed JSON-LD is ignored, never guessed at
    }
  }
  return out;
}

export function normalizeJsonLd(pageUrl: string, p: JobPostingLd, index = 0): NormalizedJob {
  const locs = Array.isArray(p.jobLocation) ? p.jobLocation : p.jobLocation ? [p.jobLocation] : [];
  const addr = locs[0]?.address;
  const location = addr ? [addr.addressLocality, addr.addressRegion].filter(Boolean).join(", ") : null;
  const remote = /telecommute/i.test(p.jobLocationType ?? "") ? "REMOTE" : location ? "UNKNOWN" : "UNKNOWN";
  const v = p.baseSalary?.value;
  const unit = v?.unitText?.toUpperCase();
  const company = typeof p.hiringOrganization === "string" ? p.hiringOrganization : p.hiringOrganization?.name ?? new URL(pageUrl).hostname;
  const et = Array.isArray(p.employmentType) ? p.employmentType[0] : p.employmentType;
  const id = typeof p.identifier === "string" ? p.identifier : p.identifier?.value;
  return {
    sourceType: "CAREER_PAGE",
    sourceName: new URL(pageUrl).hostname,
    externalId: id ?? `${p.url ?? pageUrl}#${index}`,
    url: p.url ?? pageUrl,
    applyUrl: p.url ?? pageUrl,
    title: (p.title ?? "Untitled role").trim(),
    company,
    location,
    remoteType: remote,
    employmentType: parseEmploymentType(et),
    salaryMin: v?.minValue ?? v?.value ?? null,
    salaryMax: v?.maxValue ?? v?.value ?? null,
    salaryPeriod: unit === "HOUR" ? "HOUR" : unit === "YEAR" ? "YEAR" : null,
    salaryCurrency: p.baseSalary?.currency ?? null,
    description: htmlToText(p.description ?? ""),
    postedAt: p.datePosted ? new Date(p.datePosted) : null,
    department: null,
    reqId: id ?? null,
    structured: { location: !!location, remoteType: remote === "REMOTE", employmentType: !!et, salary: !!v, postingExists: true },
  };
}

export const careerPageAdapter: SourceAdapter = {
  type: "CAREER_PAGE",
  label: "Employer career page (schema.org JobPosting)",
  describe: (url) => url,
  async list(url, fetcher: FetchLike) {
    const res = await fetcher(url);
    if (!res.ok) throw new SourceError(`Career page returned HTTP ${res.status}`, res.status);
    const postings = extractJobPostings(await res.text());
    return postings.map((p, i) => normalizeJsonLd(url, p, i));
  },
  async get(url, id, fetcher) {
    const res = await fetcher(url);
    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) throw new SourceError(`Career page returned HTTP ${res.status}`, res.status);
    const all = extractJobPostings(await res.text()).map((p, i) => normalizeJsonLd(url, p, i));
    return all.find((j) => j.externalId === id) ?? all[0] ?? null;
  },
};
