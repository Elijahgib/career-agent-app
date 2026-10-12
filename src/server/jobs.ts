import type { FieldVerification, JobVerifiableField } from "@/lib/domain/types";
import { analyzeJob } from "@/lib/jobs/analyze";
import { dedupeKey } from "@/lib/jobs/normalize";
import { ADAPTERS, SourceError, detectSourceFromUrl, safeFetcher, type FetchLike, type NormalizedJob } from "@/lib/sources";
import { db } from "./db";
import { parseJson, toJobRecord } from "./mappers";

export interface ImportResult {
  jobId: string;
  created: boolean;
  merged: boolean;
  reactivated: boolean;
}

function verificationFor(n: NormalizedJob): Partial<Record<JobVerifiableField, FieldVerification>> {
  const v: Partial<Record<JobVerifiableField, FieldVerification>> = {};
  if (n.structured.postingExists) v.postingExists = "VERIFIED";
  if (n.structured.location) v.location = "VERIFIED";
  if (n.structured.remoteType) v.remoteType = "VERIFIED";
  if (n.structured.employmentType) v.employmentType = "VERIFIED";
  if (n.structured.salary) v.salary = "VERIFIED";
  if (n.applyUrl && n.sourceType !== "MANUAL") v.applyUrl = "VERIFIED";
  if (n.sourceType === "MANUAL") {
    // A pasted posting is the user's copy: nothing is verified against the employer yet.
    v.postingExists = "UNKNOWN";
  }
  return v;
}

/** Upsert a normalised posting with dedupe and source provenance. */
export async function importNormalizedJob(n: NormalizedJob, opts: { now?: Date; isDemo?: boolean } = {}): Promise<ImportResult> {
  const now = opts.now ?? new Date();
  const key = dedupeKey(n.company, n.title, n.location);
  const existingSource = await db.jobSource.findUnique({ where: { sourceType_sourceName_externalId: { sourceType: n.sourceType, sourceName: n.sourceName, externalId: n.externalId } } });
  const existing = existingSource ? await db.job.findUnique({ where: { id: existingSource.jobId } }) : await db.job.findUnique({ where: { dedupeKey: key } });
  const fv = verificationFor(n);

  if (existing) {
    const prevFv = parseJson<Record<string, FieldVerification>>(existing.fieldVerificationJson, {});
    const reactivated = existing.status === "CLOSED" && n.structured.postingExists;
    const structuredRefresh = n.sourceType !== "MANUAL";
    await db.job.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: now,
        ...(structuredRefresh
          ? {
              location: n.location ?? existing.location,
              remoteType: n.remoteType !== "UNKNOWN" ? n.remoteType : existing.remoteType,
              employmentType: n.employmentType !== "UNKNOWN" ? n.employmentType : existing.employmentType,
              salaryMin: n.salaryMin ?? existing.salaryMin,
              salaryMax: n.salaryMax ?? existing.salaryMax,
              salaryPeriod: n.salaryPeriod ?? existing.salaryPeriod,
              applyUrl: n.applyUrl ?? existing.applyUrl,
              description: n.description.length > existing.description.length * 0.5 ? n.description : existing.description,
              lastVerifiedAt: now,
              status: "ACTIVE",
              closedAt: null,
              fieldVerificationJson: JSON.stringify({ ...prevFv, ...fv }),
            }
          : {}),
        postedAt: existing.postedAt ?? n.postedAt ?? null,
      },
    });
    await db.jobSource.upsert({
      where: { sourceType_sourceName_externalId: { sourceType: n.sourceType, sourceName: n.sourceName, externalId: n.externalId } },
      create: { jobId: existing.id, sourceType: n.sourceType, sourceName: n.sourceName, externalId: n.externalId, url: n.url ?? null, postedAt: n.postedAt ?? null, firstSeenAt: now, lastSeenAt: now },
      update: { lastSeenAt: now, url: n.url ?? undefined },
    });
    return { jobId: existing.id, created: false, merged: !existingSource, reactivated };
  }

  const job = await db.job.create({
    data: {
      dedupeKey: key,
      title: n.title,
      company: n.company,
      location: n.location ?? null,
      remoteType: n.remoteType,
      employmentType: n.employmentType,
      salaryMin: n.salaryMin ?? null,
      salaryMax: n.salaryMax ?? null,
      salaryCurrency: n.salaryCurrency ?? (n.salaryMin || n.salaryMax ? "USD" : null),
      salaryPeriod: n.salaryPeriod ?? null,
      description: n.description,
      applyUrl: n.applyUrl ?? n.url ?? null,
      reqId: n.reqId ?? null,
      department: n.department ?? null,
      status: "ACTIVE",
      postedAt: n.postedAt ?? null,
      firstSeenAt: now,
      lastSeenAt: now,
      lastVerifiedAt: n.sourceType === "MANUAL" || n.sourceType === "DEMO" ? null : now,
      fieldVerificationJson: JSON.stringify(fv),
      isDemo: opts.isDemo ?? false,
      sources: { create: { sourceType: n.sourceType, sourceName: n.sourceName, externalId: n.externalId, url: n.url ?? null, postedAt: n.postedAt ?? null, firstSeenAt: now, lastSeenAt: now } },
    },
  });
  return { jobId: job.id, created: true, merged: false, reactivated: false };
}

export async function getJob(id: string) {
  const j = await db.job.findUnique({ where: { id }, include: { sources: { orderBy: { firstSeenAt: "asc" } } } });
  return j ? toJobRecord(j) : null;
}

export async function listJobRecords() {
  const rows = await db.job.findMany({ include: { sources: true }, orderBy: { firstSeenAt: "desc" } });
  return rows.map(toJobRecord);
}

/** Import from a pasted URL: structured ATS API when recognised, else schema.org JSON-LD. */
export async function importFromUrl(url: string, fetcher: FetchLike = safeFetcher()): Promise<{ results: ImportResult[]; note: string }> {
  const detected = detectSourceFromUrl(url);
  if (!detected) throw new SourceError("That does not look like a valid URL.");
  const adapter = ADAPTERS[detected.type]!;
  if (detected.externalId) {
    const one = await adapter.get(detected.identifier, detected.externalId, fetcher);
    if (!one) throw new SourceError("The posting was not found — it may be closed.");
    return { results: [await importNormalizedJob(one)], note: `Imported via ${adapter.label} API.` };
  }
  const list = await adapter.list(detected.identifier, fetcher);
  if (!list.length) throw new SourceError(detected.type === "CAREER_PAGE" ? "No schema.org JobPosting data found on that page. Paste the posting text instead." : "No open postings found.");
  const results: ImportResult[] = [];
  for (const n of list.slice(0, 200)) results.push(await importNormalizedJob(n));
  return { results, note: `Imported ${results.length} posting(s) via ${adapter.label}.` };
}

/** Re-check a posting against its structured source. Inferred data is never upgraded to VERIFIED. */
export async function verifyJobPosting(jobId: string, fetcher: FetchLike = safeFetcher()): Promise<{ status: "ACTIVE" | "CLOSED" | "UNCHANGED"; message: string }> {
  const job = await db.job.findUnique({ where: { id: jobId }, include: { sources: true } });
  if (!job) throw new SourceError("Job not found");
  const ats = job.sources.find((s) => ADAPTERS[s.sourceType as keyof typeof ADAPTERS]);
  const now = new Date();
  if (!ats) {
    return { status: "UNCHANGED", message: "This job came from a manual paste or demo data, so there is no structured source to re-check. Open the posting and use “I checked it today” to record a manual verification." };
  }
  const adapter = ADAPTERS[ats.sourceType as keyof typeof ADAPTERS]!;
  const fresh = await adapter.get(ats.sourceName, ats.externalId, fetcher);
  if (!fresh) {
    await db.job.update({ where: { id: jobId }, data: { status: "CLOSED", closedAt: now, lastVerifiedAt: now, fieldVerificationJson: JSON.stringify({ ...parseJson(job.fieldVerificationJson, {}), postingExists: "VERIFIED" }) } });
    return { status: "CLOSED", message: `The posting is no longer listed on ${adapter.label} (checked ${now.toISOString().slice(0, 16)}).` };
  }
  await importNormalizedJob(fresh, { now });
  return { status: "ACTIVE", message: `Verified against ${adapter.label} at ${now.toISOString().slice(0, 16)}.` };
}

/** The user opened the posting and confirmed it is open — recorded as a human verification. */
export async function markVerifiedByUser(jobId: string) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) return;
  const fv = parseJson<Record<string, FieldVerification>>(job.fieldVerificationJson, {});
  await db.job.update({ where: { id: jobId }, data: { lastVerifiedAt: new Date(), status: "ACTIVE", fieldVerificationJson: JSON.stringify({ ...fv, postingExists: "VERIFIED" }) } });
}

export function analysisFor(job: ReturnType<typeof toJobRecord>) {
  const fv = job.fieldVerification;
  return analyzeJob(job, { employmentType: fv.employmentType === "VERIFIED", remoteType: fv.remoteType === "VERIFIED", salary: fv.salary === "VERIFIED" });
}
