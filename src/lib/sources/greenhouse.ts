import { htmlToText, parseEmploymentType, parseRemoteType } from "@/lib/jobs/normalize";
import { SourceError, type FetchLike, type NormalizedJob, type SourceAdapter } from "./types";

// Greenhouse Job Board API (public, no auth):
//   GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true
//   GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}
interface GhJob {
  id: number;
  title: string;
  absolute_url?: string;
  updated_at?: string;
  first_published?: string;
  requisition_id?: string | null;
  location?: { name?: string };
  content?: string;
  departments?: { name: string }[];
  metadata?: { name: string; value: unknown }[] | null;
  company_name?: string;
}

const BASE = "https://boards-api.greenhouse.io/v1/boards";

function companyFromToken(token: string): string {
  return token.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function normalizeGreenhouse(token: string, j: GhJob, company?: string): NormalizedJob {
  const description = htmlToText(j.content ?? "");
  const meta = Object.fromEntries((j.metadata ?? []).map((m) => [m.name.toLowerCase(), m.value]));
  const etRaw = typeof meta["employment type"] === "string" ? (meta["employment type"] as string) : undefined;
  const loc = j.location?.name ?? null;
  return {
    sourceType: "GREENHOUSE",
    sourceName: token,
    externalId: String(j.id),
    url: j.absolute_url ?? null,
    applyUrl: j.absolute_url ?? null,
    title: j.title.trim(),
    company: company ?? j.company_name ?? companyFromToken(token),
    location: loc,
    remoteType: parseRemoteType(loc),
    employmentType: parseEmploymentType(etRaw),
    salaryMin: null,
    salaryMax: null,
    salaryPeriod: null,
    description,
    postedAt: j.first_published ? new Date(j.first_published) : j.updated_at ? new Date(j.updated_at) : null,
    department: j.departments?.[0]?.name ?? null,
    reqId: j.requisition_id ?? null,
    structured: { location: !!loc, remoteType: /remote|hybrid/i.test(loc ?? ""), employmentType: !!etRaw, salary: false, postingExists: true },
  };
}

export const greenhouseAdapter: SourceAdapter = {
  type: "GREENHOUSE",
  label: "Greenhouse job board",
  describe: (token) => `${BASE}/${token}/jobs?content=true`,
  async list(token, fetcher: FetchLike) {
    const res = await fetcher(`${BASE}/${encodeURIComponent(token)}/jobs?content=true`);
    if (!res.ok) throw new SourceError(`Greenhouse board "${token}" returned HTTP ${res.status}`, res.status);
    const json = (await res.json()) as { jobs?: GhJob[] };
    return (json.jobs ?? []).map((j) => normalizeGreenhouse(token, j));
  },
  async get(token, id, fetcher) {
    const res = await fetcher(`${BASE}/${encodeURIComponent(token)}/jobs/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new SourceError(`Greenhouse returned HTTP ${res.status}`, res.status);
    return normalizeGreenhouse(token, (await res.json()) as GhJob);
  },
};
