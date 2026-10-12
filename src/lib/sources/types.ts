import type { EmploymentType, RemoteType } from "@/lib/domain/types";

export type SourceType = "MANUAL" | "GREENHOUSE" | "LEVER" | "ASHBY" | "CAREER_PAGE" | "DEMO";

/** A posting normalised from any source. Only `structured` fields are treated as VERIFIED. */
export interface NormalizedJob {
  sourceType: SourceType;
  sourceName: string;
  externalId: string;
  url?: string | null;
  applyUrl?: string | null;
  title: string;
  company: string;
  location?: string | null;
  remoteType: RemoteType;
  employmentType: EmploymentType;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryPeriod?: "YEAR" | "HOUR" | null;
  salaryCurrency?: string | null;
  description: string;
  postedAt?: Date | null;
  department?: string | null;
  reqId?: string | null;
  structured: { location: boolean; remoteType: boolean; employmentType: boolean; salary: boolean; postingExists: boolean };
}

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export interface SourceAdapter {
  type: SourceType;
  label: string;
  /** Public endpoint pattern, documented in docs/JOB_SOURCES.md. */
  describe(identifier: string): string;
  list(identifier: string, fetcher: FetchLike): Promise<NormalizedJob[]>;
  /** Re-fetch one posting. Returns null when the posting no longer exists. */
  get(identifier: string, externalId: string, fetcher: FetchLike): Promise<NormalizedJob | null>;
}

export class SourceError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}
