import type {
  CandidateProfile,
  Education,
  EvidenceFact,
  Job,
  JobSource,
  Position,
  Preferences,
} from "@/generated/prisma/client";
import { isRelation } from "@/lib/evidence/relations";
import type {
  CareerLevel,
  ClearanceLevel,
  Confidence,
  DegreeLevel,
  EducationRecord,
  EmploymentType,
  ExperienceType,
  FactCategory,
  FieldVerification,
  JobRecord,
  JobVerifiableField,
  LedgerFact,
  PositionRecord,
  PreferencesRecord,
  ProfileRecord,
  RemotePreference,
  RemoteType,
  VerificationStatus,
} from "@/lib/domain/types";

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function toProfile(p: CandidateProfile): ProfileRecord {
  return {
    id: p.id,
    displayName: p.displayName,
    email: p.email,
    phone: p.phone,
    city: p.city,
    region: p.region,
    country: p.country,
    links: parseJson<string[]>(p.links, []),
    careerLevel: p.careerLevel as CareerLevel,
  };
}

export function toPreferences(p: Preferences | null): PreferencesRecord {
  return {
    targetTitles: parseJson(p?.targetTitlesJson, []),
    targetKeywords: parseJson(p?.targetKeywordsJson, []),
    desiredSalaryMin: p?.desiredSalaryMin ?? null,
    salaryHardFloor: p?.salaryHardFloor ?? null,
    salaryCurrency: p?.salaryCurrency ?? "USD",
    remotePreference: (p?.remotePreference ?? "ANY") as RemotePreference,
    acceptableLocations: parseJson(p?.acceptableLocationsJson, []),
    willingToRelocate: p?.willingToRelocate ?? false,
    employmentTypes: parseJson<EmploymentType[]>(p?.employmentTypesJson, ["FULL_TIME"]),
    excludedEmploymentTypes: parseJson<EmploymentType[]>(p?.excludedEmploymentJson, []),
    excludedCompanies: parseJson(p?.excludedCompaniesJson, []),
    excludedKeywords: parseJson(p?.excludedKeywordsJson, []),
    securityClearance: (p?.securityClearance ?? "NONE") as ClearanceLevel,
    hasDriversLicense: p?.hasDriversLicense ?? true,
    canTravelPercent: p?.canTravelPercent ?? null,
    workAuthorization: p?.workAuthorization ?? null,
  };
}

export function toPosition(p: Position): PositionRecord {
  return {
    id: p.id,
    employer: p.employer,
    title: p.title,
    location: p.location,
    employmentType: p.employmentType,
    startDate: p.startDate,
    endDate: p.endDate,
    verificationStatus: p.verificationStatus as VerificationStatus,
    sortOrder: p.sortOrder,
  };
}

export function toEducation(e: Education): EducationRecord {
  return {
    id: e.id,
    institution: e.institution,
    credential: e.credential,
    level: e.level as DegreeLevel,
    field: e.field,
    status: e.status as EducationRecord["status"],
    startDate: e.startDate,
    endDate: e.endDate,
    verificationStatus: e.verificationStatus as VerificationStatus,
  };
}

function toRelations(raw: unknown): LedgerFact["relations"] {
  return Array.isArray(raw) ? [...new Set(raw.filter(isRelation))] : [];
}

export function toLedgerFact(f: EvidenceFact): LedgerFact {
  return {
    code: f.code,
    id: f.id,
    positionId: f.positionId,
    context: f.context,
    roleContext: f.roleContext,
    category: f.category as FactCategory,
    experienceType: f.experienceType as ExperienceType,
    canonicalFact: f.canonicalFact,
    source: f.source,
    verificationStatus: f.verificationStatus as VerificationStatus,
    confidence: f.confidence as Confidence,
    conceptIds: parseJson(f.conceptIdsJson, []),
    allowedWording: parseJson(f.allowedWordingJson, []),
    prohibitedExpansions: parseJson(f.prohibitedExpansionsJson, []),
    relations: toRelations(parseJson<unknown>(f.relationsJson, [])),
    startDate: f.startDate,
    endDate: f.endDate,
  };
}

export function toJobRecord(j: Job & { sources?: JobSource[] }): JobRecord {
  return {
    id: j.id,
    title: j.title,
    company: j.company,
    location: j.location,
    remoteType: j.remoteType as RemoteType,
    employmentType: j.employmentType as EmploymentType,
    salaryMin: j.salaryMin,
    salaryMax: j.salaryMax,
    salaryCurrency: j.salaryCurrency,
    salaryPeriod: (j.salaryPeriod as "YEAR" | "HOUR" | null) ?? null,
    description: j.description,
    applyUrl: j.applyUrl,
    reqId: j.reqId,
    department: j.department,
    status: j.status as JobRecord["status"],
    postedAt: j.postedAt,
    firstSeenAt: j.firstSeenAt,
    lastSeenAt: j.lastSeenAt,
    lastVerifiedAt: j.lastVerifiedAt,
    fieldVerification: parseJson<Partial<Record<JobVerifiableField, FieldVerification>>>(j.fieldVerificationJson, {}),
    sources: (j.sources ?? []).map((s) => ({
      sourceType: s.sourceType,
      sourceName: s.sourceName,
      externalId: s.externalId,
      url: s.url,
      postedAt: s.postedAt,
      firstSeenAt: s.firstSeenAt,
      lastSeenAt: s.lastSeenAt,
    })),
  };
}
