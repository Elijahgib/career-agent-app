"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ClaimCheckState } from "@/components/client";
import type { Relation } from "@/lib/domain/types";
import { isRelation } from "@/lib/evidence/relations";
import { conceptLabel } from "@/lib/ontology/concepts";
import { detectSourceFromUrl } from "@/lib/sources";
import { checkStatement } from "@/lib/truth-gate/gate";
import type { ClaimSection } from "@/lib/truth-gate/types";
import { parseEmploymentType } from "@/lib/jobs/normalize";
import { db } from "@/server/db";
import { editClaim, generateAndStore } from "@/server/documents";
import { resolveSignal, scanInbox } from "@/server/email";
import { importProfile } from "@/server/export";
import { importFromUrl, importNormalizedJob, markVerifiedByUser, verifyJobPosting } from "@/server/jobs";
import { setVerdict } from "@/server/matching";
import { createProfile, deleteProfile, getSnapshot, nextFactCode, touchProfile } from "@/server/profiles";
import { runScan } from "@/server/scan";
import { seedDemo } from "@/server/seed";
import { clearActiveProfileCookie, getActiveProfileId, setActiveProfileCookie } from "@/server/session";
import { STATUSES, changeStatus, ensureApplication, type AppStatus } from "@/server/tracker";

// ───────────────────────── helpers ─────────────────────────

async function requireProfile(): Promise<string> {
  const id = await getActiveProfileId();
  if (!id) redirect("/onboarding");
  return id;
}

function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

/** Explicit relationship checkboxes; forms that omit the "relationsField" marker leave relations unchanged. */
function relationList(fd: FormData): Relation[] {
  return [...new Set(fd.getAll("relations").map(String).filter(isRelation))];
}

/** Facts and wording are sentences, not documents: bound them so one oversized entry can't stall the ledger. */
const MAX_FACT_CHARS = 1000;
const MAX_PHRASE_CHARS = 200;
const MAX_PHRASES = 40;

function phrases(fd: FormData, k: string): string[] {
  return list(fd, k)
    .filter((p) => p.length <= MAX_PHRASE_CHARS)
    .slice(0, MAX_PHRASES);
}

function list(fd: FormData, k: string): string[] {
  return str(fd, k)
    .split(/\n|;|,(?![^(]*\))/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function intOrNull(fd: FormData, k: string): number | null {
  const v = str(fd, k).replace(/[$,]/g, "");
  if (!v) return null;
  const n = Number(v.replace(/k$/i, "")) * (/k$/i.test(v) ? 1000 : 1);
  return Number.isFinite(n) ? Math.round(n) : null;
}

const ym = z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM");

function refreshAll() {
  revalidatePath("/", "layout");
}

async function ownsFact(profileId: string, factId: string) {
  return db.evidenceFact.findFirst({ where: { id: factId, profileId } });
}

// ───────────────────────── profiles ─────────────────────────

export async function switchProfile(fd: FormData) {
  const id = str(fd, "profileId");
  if (id) await setActiveProfileCookie(id);
  refreshAll();
}

export async function createProfileAction(fd: FormData) {
  const name = str(fd, "displayName");
  if (!name) return;
  const p = await createProfile({ displayName: name, careerLevel: str(fd, "careerLevel") || "EARLY", city: str(fd, "city"), region: str(fd, "region"), email: str(fd, "email"), phone: str(fd, "phone") });
  await setActiveProfileCookie(p.id);
  refreshAll();
  redirect("/profile");
}

/** First-run onboarding: create a real profile from the identity step, then continue the guided setup. */
export async function startOnboardingProfile(fd: FormData) {
  const name = str(fd, "displayName");
  if (!name) redirect("/onboarding?error=name");
  const p = await createProfile({
    displayName: name,
    careerLevel: str(fd, "careerLevel") || "EARLY",
    city: str(fd, "city"),
    region: str(fd, "region"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
  });
  const linkedin = str(fd, "linkedin");
  if (linkedin) await db.candidateProfile.update({ where: { id: p.id }, data: { links: JSON.stringify([linkedin]) } });
  await setActiveProfileCookie(p.id);
  refreshAll();
  redirect("/onboarding?step=work");
}

export async function deleteProfileAction(fd: FormData) {
  const id = str(fd, "profileId");
  if (!id) return;
  await deleteProfile(id);
  const active = await getActiveProfileId();
  if (!active || active === id) await clearActiveProfileCookie();
  refreshAll();
  redirect("/settings?notice=deleted");
}

export async function loadDemoAction(fd: FormData) {
  await seedDemo({ reset: str(fd, "reset") === "1" });
  const first = await db.candidateProfile.findFirst({ where: { isDemo: true }, orderBy: { createdAt: "asc" } });
  if (first) await setActiveProfileCookie(first.id);
  refreshAll();
  redirect("/dashboard");
}

export async function importProfileAction(fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) redirect("/settings?notice=import-missing");
  let p: Awaited<ReturnType<typeof importProfile>>;
  try {
    const raw = await (file as File).text();
    if (raw.length > 20_000_000) throw new Error("File is too large (20 MB limit).");
    p = await importProfile(JSON.parse(raw));
  } catch (e) {
    const detail = e instanceof SyntaxError ? "The file is not valid JSON." : (e as Error).message;
    redirect(`/settings?error=import&detail=${encodeURIComponent(detail)}`);
  }
  await setActiveProfileCookie(p.id);
  refreshAll();
  redirect("/profile");
}

export async function updateProfileBasics(fd: FormData) {
  const id = await requireProfile();
  await db.candidateProfile.update({
    where: { id },
    data: {
      displayName: str(fd, "displayName") || "Unnamed candidate",
      headline: str(fd, "headline") || null,
      email: str(fd, "email") || null,
      phone: str(fd, "phone") || null,
      city: str(fd, "city") || null,
      region: str(fd, "region") || null,
      country: str(fd, "country") || "US",
      links: JSON.stringify(list(fd, "links")),
      careerLevel: str(fd, "careerLevel") || "EARLY",
    },
  });
  refreshAll();
}

export async function updatePreferences(fd: FormData) {
  const id = await requireProfile();
  const types = fd.getAll("employmentTypes").map(String);
  const excluded = fd.getAll("excludedEmploymentTypes").map(String);
  const data = {
    targetTitlesJson: JSON.stringify(list(fd, "targetTitles")),
    targetKeywordsJson: JSON.stringify(list(fd, "targetKeywords")),
    desiredSalaryMin: intOrNull(fd, "desiredSalaryMin"),
    salaryHardFloor: intOrNull(fd, "salaryHardFloor"),
    remotePreference: str(fd, "remotePreference") || "ANY",
    acceptableLocationsJson: JSON.stringify(str(fd, "acceptableLocations").split(/\n|;/).map((s) => s.trim()).filter(Boolean)),
    willingToRelocate: fd.get("willingToRelocate") === "on",
    employmentTypesJson: JSON.stringify(types.length ? types : ["FULL_TIME"]),
    excludedEmploymentJson: JSON.stringify(excluded),
    excludedCompaniesJson: JSON.stringify(list(fd, "excludedCompanies")),
    excludedKeywordsJson: JSON.stringify(list(fd, "excludedKeywords")),
    securityClearance: str(fd, "securityClearance") || "NONE",
    hasDriversLicense: fd.get("hasDriversLicense") === "on",
    canTravelPercent: intOrNull(fd, "canTravelPercent"),
    workAuthorization: str(fd, "workAuthorization") || null,
  };
  await db.preferences.upsert({ where: { profileId: id }, create: { profileId: id, ...data }, update: data });
  await touchProfile(id);
  refreshAll();
}

// ───────────────────────── work history & education ─────────────────────────

export async function addPosition(fd: FormData) {
  const id = await requireProfile();
  const start = ym.safeParse(str(fd, "startDate"));
  const endRaw = str(fd, "endDate");
  const end = endRaw ? ym.safeParse(endRaw) : null;
  if (!start.success || (end && !end.success) || !str(fd, "employer") || !str(fd, "title")) redirect("/profile?error=position");
  await db.position.create({
    data: {
      profileId: id,
      employer: str(fd, "employer"),
      title: str(fd, "title"),
      location: str(fd, "location") || null,
      employmentType: str(fd, "employmentType") || "FULL_TIME",
      startDate: start.data!,
      endDate: end?.success ? end.data : null,
      verificationStatus: fd.get("verified") === "on" ? "VERIFIED" : "UNVERIFIED",
    },
  });
  await touchProfile(id);
  refreshAll();
}

export async function togglePositionVerified(fd: FormData) {
  const id = await requireProfile();
  const pos = await db.position.findFirst({ where: { id: str(fd, "positionId"), profileId: id } });
  if (!pos) return;
  await db.position.update({ where: { id: pos.id }, data: { verificationStatus: pos.verificationStatus === "VERIFIED" ? "UNVERIFIED" : "VERIFIED" } });
  await touchProfile(id);
  refreshAll();
}

export async function deletePosition(fd: FormData) {
  const id = await requireProfile();
  await db.position.deleteMany({ where: { id: str(fd, "positionId"), profileId: id } });
  await touchProfile(id);
  refreshAll();
}

export async function editPosition(fd: FormData) {
  const id = await requireProfile();
  const pos = await db.position.findFirst({ where: { id: str(fd, "positionId"), profileId: id } });
  if (!pos) return;
  const start = ym.safeParse(str(fd, "startDate"));
  const endRaw = str(fd, "endDate");
  const end = endRaw ? ym.safeParse(endRaw) : null;
  await db.position.update({
    where: { id: pos.id },
    data: {
      employer: str(fd, "employer") || pos.employer,
      title: str(fd, "title") || pos.title,
      location: str(fd, "location") || null,
      employmentType: str(fd, "employmentType") || pos.employmentType,
      ...(start.success ? { startDate: start.data } : {}),
      endDate: endRaw ? (end && end.success ? end.data : pos.endDate) : null,
    },
  });
  await touchProfile(id);
  refreshAll();
}

export async function addEducation(fd: FormData) {
  const id = await requireProfile();
  if (!str(fd, "institution") || !str(fd, "credential")) redirect("/profile?error=education");
  await db.education.create({
    data: {
      profileId: id,
      institution: str(fd, "institution"),
      credential: str(fd, "credential"),
      level: str(fd, "level") || "CERTIFICATE",
      field: str(fd, "field") || null,
      status: str(fd, "status") || "COMPLETED",
      endDate: str(fd, "endDate") || null,
      verificationStatus: fd.get("verified") === "on" ? "VERIFIED" : "UNVERIFIED",
    },
  });
  await touchProfile(id);
  refreshAll();
}

export async function toggleEducationVerified(fd: FormData) {
  const id = await requireProfile();
  const e = await db.education.findFirst({ where: { id: str(fd, "educationId"), profileId: id } });
  if (!e) return;
  await db.education.update({ where: { id: e.id }, data: { verificationStatus: e.verificationStatus === "VERIFIED" ? "UNVERIFIED" : "VERIFIED" } });
  await touchProfile(id);
  refreshAll();
}

export async function deleteEducation(fd: FormData) {
  const id = await requireProfile();
  await db.education.deleteMany({ where: { id: str(fd, "educationId"), profileId: id } });
  await touchProfile(id);
  refreshAll();
}

export async function editEducation(fd: FormData) {
  const id = await requireProfile();
  const e = await db.education.findFirst({ where: { id: str(fd, "educationId"), profileId: id } });
  if (!e) return;
  await db.education.update({
    where: { id: e.id },
    data: {
      institution: str(fd, "institution") || e.institution,
      credential: str(fd, "credential") || e.credential,
      field: str(fd, "field") || null,
      gpa: str(fd, "gpa") || null,
      honors: str(fd, "honors") || null,
      level: str(fd, "level") || e.level,
      endDate: str(fd, "endDate") || null,
    },
  });
  await touchProfile(id);
  refreshAll();
}

// ───────────────────────── evidence ledger ─────────────────────────

const CATEGORIES = ["DUTY", "ACHIEVEMENT", "SKILL", "TOOL", "CERTIFICATION", "LICENSE", "PROJECT", "LEARNING", "SOFT_SKILL", "CLEARANCE"];
const EXP_TYPES = ["PROFESSIONAL", "VOLUNTEER", "ACADEMIC", "PROJECT", "LEARNING"];

async function positionContext(profileId: string, positionId: string | null) {
  if (!positionId) return { positionId: null, context: null, roleContext: null };
  const p = await db.position.findFirst({ where: { id: positionId, profileId } });
  return p ? { positionId: p.id, context: p.employer, roleContext: p.title } : { positionId: null, context: null, roleContext: null };
}

export async function addFact(fd: FormData) {
  const id = await requireProfile();
  const text = str(fd, "canonicalFact");
  if (!text || text.length > MAX_FACT_CHARS) return;
  const category = CATEGORIES.includes(str(fd, "category")) ? str(fd, "category") : "DUTY";
  const experienceType = EXP_TYPES.includes(str(fd, "experienceType")) ? str(fd, "experienceType") : "PROFESSIONAL";
  const pc = await positionContext(id, str(fd, "positionId") || null);
  const verified = fd.get("verified") === "on";
  await db.evidenceFact.create({
    data: {
      profileId: id,
      code: await nextFactCode(id),
      ...pc,
      context: pc.context ?? (str(fd, "context") || null),
      roleContext: pc.roleContext ?? (str(fd, "roleContext") || null),
      category,
      experienceType,
      canonicalFact: text,
      source: str(fd, "source") || "Self-reported",
      verificationStatus: verified ? "VERIFIED" : "UNVERIFIED",
      verifiedAt: verified ? new Date() : null,
      confidence: str(fd, "confidence") || "MEDIUM",
      allowedWordingJson: JSON.stringify(phrases(fd, "allowedWording")),
      prohibitedExpansionsJson: JSON.stringify(phrases(fd, "prohibitedExpansions")),
      relationsJson: JSON.stringify(relationList(fd)),
      startDate: str(fd, "startDate") || null,
      endDate: str(fd, "endDate") || null,
    },
  });
  refreshAll();
}

export async function updateFact(fd: FormData) {
  const id = await requireProfile();
  const fact = await ownsFact(id, str(fd, "factId"));
  if (!fact) return;
  const canonicalFact = str(fd, "canonicalFact") || fact.canonicalFact;
  if (canonicalFact.length > MAX_FACT_CHARS) return;
  const allowedWording = phrases(fd, "allowedWording");
  const prohibitedExpansions = phrases(fd, "prohibitedExpansions");
  const oldList = (json: string) => {
    try {
      const v: unknown = JSON.parse(json);
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  };
  // New allowed wording or a removed prohibition widens what the fact may license.
  const wordingWidened =
    allowedWording.some((w) => !oldList(fact.allowedWordingJson).includes(w)) || oldList(fact.prohibitedExpansionsJson).some((p) => !prohibitedExpansions.includes(p));
  const category = CATEGORIES.includes(str(fd, "category")) ? str(fd, "category") : fact.category;
  const experienceType = EXP_TYPES.includes(str(fd, "experienceType")) ? str(fd, "experienceType") : fact.experienceType;
  const oldRelations = (() => {
    try {
      const r: unknown = JSON.parse(fact.relationsJson);
      return Array.isArray(r) ? r.filter(isRelation) : [];
    } catch {
      return [];
    }
  })();
  const newRelations = fd.has("relationsField") ? relationList(fd) : oldRelations;
  // Explicit relationships only narrow; removing or swapping one could widen what the fact supports.
  const relationsWidened = oldRelations.length > 0 && (newRelations.length === 0 || newRelations.some((r) => !oldRelations.includes(r)));
  // Anything that could make the fact support more than the user verified requires re-verification.
  const needsReverify = canonicalFact !== fact.canonicalFact || category !== fact.category || experienceType !== fact.experienceType || relationsWidened || wordingWidened;
  await db.evidenceFact.update({
    where: { id: fact.id },
    data: {
      canonicalFact,
      category,
      experienceType,
      source: str(fd, "source") || fact.source,
      confidence: str(fd, "confidence") || fact.confidence,
      allowedWordingJson: JSON.stringify(allowedWording),
      prohibitedExpansionsJson: JSON.stringify(prohibitedExpansions),
      relationsJson: JSON.stringify(newRelations),
      ...(needsReverify ? { verificationStatus: "UNVERIFIED", verifiedAt: null } : {}),
    },
  });
  refreshAll();
}

export async function setFactVerification(fd: FormData) {
  const id = await requireProfile();
  const fact = await ownsFact(id, str(fd, "factId"));
  if (!fact) return;
  const verify = str(fd, "status") === "VERIFIED";
  await db.evidenceFact.update({ where: { id: fact.id }, data: { verificationStatus: verify ? "VERIFIED" : "UNVERIFIED", verifiedAt: verify ? new Date() : null } });
  refreshAll();
}

export async function addProhibited(fd: FormData) {
  const id = await requireProfile();
  const fact = await ownsFact(id, str(fd, "factId"));
  const phrase = str(fd, "phrase");
  if (!fact || !phrase) return;
  const cur = JSON.parse(fact.prohibitedExpansionsJson) as string[];
  if (!cur.some((p) => p.toLowerCase() === phrase.toLowerCase())) cur.push(phrase);
  await db.evidenceFact.update({ where: { id: fact.id }, data: { prohibitedExpansionsJson: JSON.stringify(cur) } });
  refreshAll();
}

export async function deleteFact(fd: FormData) {
  const id = await requireProfile();
  await db.evidenceFact.deleteMany({ where: { id: str(fd, "factId"), profileId: id } });
  refreshAll();
}

/** Upload PDF/DOCX/TXT/MD or paste text → extract locally → parse → import as UNVERIFIED facts for review. */
export async function importResumeFileAction(fd: FormData) {
  const id = await requireProfile();
  const returnTo = str(fd, "returnTo") === "onboarding" ? "onboarding" : "evidence";
  let target: string;
  try {
    let text = str(fd, "text");
    let filename = "";
    const file = fd.get("file");
    if (file instanceof File && file.size) {
      filename = file.name;
      const { extractResumeText } = await import("@/server/resume-extract");
      const extracted = await extractResumeText(file);
      text = [text, extracted.text].filter(Boolean).join("\n");
    }
    if (!text.trim()) throw new Error("No resume text found — paste text or upload a readable PDF, DOCX, TXT or MD file.");
    const { parseResumeText } = await import("@/lib/resume/parse");
    const parsed = parseResumeText(text);
    const existingRoles = await db.position.count({ where: { profileId: id } });
    if (existingRoles > 0) {
      // Re-upload: don't blindly duplicate — stash it and let the user review the diff first.
      const { stashPendingImport } = await import("@/server/resume-merge");
      await stashPendingImport(id, parsed, filename || undefined);
      target = "/resume/update";
    } else {
      const { importParsedResume } = await import("@/server/resume-import");
      const r = await importParsedResume(id, parsed);
      // Land on the friendly "Review your resume" page (NOT the technical Evidence ledger).
      target = `/resume/review?imported=1&p=${r.positions}&e=${r.education}&b=${r.duties + r.otherFacts}&s=${r.skills}&c=${r.certifications}`;
    }
    void returnTo;
  } catch (e) {
    const base = returnTo === "onboarding" ? "/onboarding?step=work" : "/evidence";
    target = `${base}${base.includes("?") ? "&" : "?"}error=resume&detail=${encodeURIComponent((e as Error).message)}`;
  }
  refreshAll();
  redirect(target);
}

/** Apply the approved roles from a stashed re-upload diff, merging (never duplicating). */
export async function applyResumeUpdateAction(fd: FormData) {
  const id = await requireProfile();
  const approved = new Set(fd.getAll("approve").map((v) => Number(v)).filter((n) => Number.isInteger(n)));
  const { applyPendingImport } = await import("@/server/resume-merge");
  const r = await applyPendingImport(id, approved);
  refreshAll();
  redirect(`/resume/review?imported=1&p=${r.added}&updated=${r.updated}&b=${r.bulletsAdded}&s=${r.skills}&c=${r.certifications}`);
}

export async function cancelResumeUpdateAction() {
  const id = await requireProfile();
  const { clearPendingImport } = await import("@/server/resume-merge");
  await clearPendingImport(id);
  refreshAll();
  redirect("/resume/review");
}

/** Section-level "Confirm" on the review page: mark a whole section's imported items verified. */
export async function confirmResumeSection(fd: FormData) {
  const id = await requireProfile();
  const section = str(fd, "section");
  const now = new Date();
  const verifyFacts = (category: string) => db.evidenceFact.updateMany({ where: { profileId: id, category }, data: { verificationStatus: "VERIFIED", verifiedAt: now } });
  if (section === "work" || section === "all") {
    await db.position.updateMany({ where: { profileId: id }, data: { verificationStatus: "VERIFIED" } });
    await verifyFacts("DUTY");
    await verifyFacts("ACHIEVEMENT");
  }
  if (section === "education" || section === "all") await db.education.updateMany({ where: { profileId: id }, data: { verificationStatus: "VERIFIED" } });
  if (section === "skills" || section === "all") await verifyFacts("SKILL");
  if (section === "certs" || section === "all") await verifyFacts("CERTIFICATION");
  await touchProfile(id);
  refreshAll();
}

/** "I've reviewed this information" — confirm everything, then move on to preferences. */
export async function confirmResumeAndContinue() {
  const id = await requireProfile();
  const now = new Date();
  await db.position.updateMany({ where: { profileId: id }, data: { verificationStatus: "VERIFIED" } });
  await db.education.updateMany({ where: { profileId: id }, data: { verificationStatus: "VERIFIED" } });
  await db.evidenceFact.updateMany({ where: { profileId: id }, data: { verificationStatus: "VERIFIED", verifiedAt: now } });
  await touchProfile(id);
  refreshAll();
  redirect("/onboarding?step=preferences");
}

export async function checkClaimAction(_prev: ClaimCheckState, fd: FormData): Promise<ClaimCheckState> {
  const id = await getActiveProfileId();
  if (!id) return { error: "Create a profile first." };
  const snapshot = await getSnapshot(id);
  if (!snapshot) return { error: "Profile not found." };
  const text = str(fd, "text");
  if (!text) return { error: "Enter a statement." };
  if (text.length > 2000) return { error: "Check one statement at a time (2,000 characters at most)." };
  const codes = fd.getAll("facts").map(String);
  const SECTIONS: ClaimSection[] = ["experience", "competencies", "summary", "projects", "letter", "interview"];
  const section = SECTIONS.find((s) => s === str(fd, "section")) ?? "experience";
  const kind = section === "competencies" ? "SKILL" : section === "summary" ? "SUMMARY" : section === "projects" ? "LEARNING" : "EXPERIENCE";
  const r = checkStatement(text, codes, { facts: snapshot.facts }, { section, kind });
  return {
    status: r.status,
    violations: r.violations.map((v) => ({ rule: v.rule, phrase: v.phrase, message: v.message, hint: v.hint })),
    licensed: Object.entries(r.licensedBy).slice(0, 12).map(([c, f]) => ({ concept: conceptLabel(c), facts: f })),
  };
}

// ───────────────────────── jobs ─────────────────────────

export async function importManualJob(fd: FormData) {
  await requireProfile();
  const title = str(fd, "title");
  const company = str(fd, "company");
  const description = str(fd, "description");
  if (!title || !company || !description) redirect("/jobs?error=missing");
  const url = str(fd, "url") || null;
  const period = str(fd, "salaryPeriod") === "HOUR" ? "HOUR" : str(fd, "salaryPeriod") === "YEAR" ? "YEAR" : null;
  const r = await importNormalizedJob({
    sourceType: "MANUAL",
    sourceName: "manual",
    externalId: url ?? `${company}|${title}|${Date.now()}`,
    url,
    applyUrl: url,
    title,
    company,
    location: str(fd, "location") || null,
    remoteType: (["REMOTE", "HYBRID", "ONSITE"].includes(str(fd, "remoteType")) ? str(fd, "remoteType") : "UNKNOWN") as "REMOTE" | "HYBRID" | "ONSITE" | "UNKNOWN",
    employmentType: parseEmploymentType(str(fd, "employmentType")),
    salaryMin: intOrNull(fd, "salaryMin"),
    salaryMax: intOrNull(fd, "salaryMax"),
    salaryPeriod: period,
    description,
    postedAt: str(fd, "postedAt") ? new Date(str(fd, "postedAt")) : null,
    reqId: str(fd, "reqId") || null,
    structured: { location: false, remoteType: false, employmentType: false, salary: false, postingExists: false },
  });
  refreshAll();
  redirect(`/jobs/${r.jobId}${r.merged ? "?notice=merged" : ""}`);
}

export async function importUrlAction(fd: FormData) {
  await requireProfile();
  const url = str(fd, "url");
  let target: string;
  try {
    const { results, note } = await importFromUrl(url);
    target = results.length === 1 ? `/jobs/${results[0].jobId}?notice=${encodeURIComponent(note)}` : `/jobs?notice=${encodeURIComponent(note)}`;
  } catch (e) {
    target = `/jobs?error=${encodeURIComponent((e as Error).message)}`;
  }
  refreshAll();
  redirect(target);
}

export async function addSourceAction(fd: FormData) {
  await requireProfile();
  let type = str(fd, "sourceType");
  let identifier = str(fd, "identifier");
  if (/^https?:\/\//.test(identifier)) {
    const d = detectSourceFromUrl(identifier);
    if (d) {
      type = d.type;
      identifier = d.identifier;
    }
  }
  if (!["GREENHOUSE", "LEVER", "ASHBY", "CAREER_PAGE"].includes(type) || !identifier) redirect("/settings?error=source");
  await db.sourceConfig.upsert({ where: { sourceType_identifier: { sourceType: type, identifier } }, create: { sourceType: type, identifier, label: str(fd, "label") || null }, update: { enabled: true } });
  refreshAll();
}

export async function removeSourceAction(fd: FormData) {
  await requireProfile();
  await db.sourceConfig.deleteMany({ where: { id: str(fd, "sourceId") } });
  refreshAll();
}

export async function runScanAction() {
  await requireProfile();
  const r = await runScan({ trigger: "MANUAL" });
  refreshAll();
  redirect(`/settings?notice=${encodeURIComponent(`Scan ${r.status.toLowerCase()}: ${r.jobsSeen} seen, ${r.jobsNew} new, ${r.jobsClosed} closed.`)}`);
}

export async function verifyJobAction(fd: FormData) {
  await requireProfile();
  const jobId = str(fd, "jobId");
  let msg: string;
  try {
    msg = (await verifyJobPosting(jobId)).message;
  } catch (e) {
    msg = (e as Error).message;
  }
  refreshAll();
  redirect(`/jobs/${jobId}?notice=${encodeURIComponent(msg)}`);
}

export async function markVerifiedAction(fd: FormData) {
  await requireProfile();
  await markVerifiedByUser(str(fd, "jobId"));
  refreshAll();
}

export async function rejectJobAction(fd: FormData) {
  const id = await requireProfile();
  const jobId = str(fd, "jobId");
  await setVerdict(id, jobId, "REJECTED", str(fd, "reason") || "Not a fit");
  const app = await db.application.findUnique({ where: { profileId_jobId: { profileId: id, jobId } } });
  if (app && !["SKIP", "REJECTED"].includes(app.status)) await changeStatus(id, app.id, "SKIP", str(fd, "reason") || "Rejected as bad fit");
  refreshAll();
}

export async function unrejectJobAction(fd: FormData) {
  const id = await requireProfile();
  await setVerdict(id, str(fd, "jobId"), null);
  refreshAll();
}

export async function saveJobAction(fd: FormData) {
  const id = await requireProfile();
  await ensureApplication(id, str(fd, "jobId"), (str(fd, "status") as AppStatus) || "SAVED");
  refreshAll();
}

// ───────────────────────── documents ─────────────────────────

export async function generateDocAction(fd: FormData) {
  const id = await requireProfile();
  const jobId = str(fd, "jobId");
  const kind = str(fd, "kind") === "COVER_LETTER" ? "COVER_LETTER" : "RESUME";
  const doc = await generateAndStore(id, jobId, kind, { useAi: fd.get("useAi") === "on" });
  const app = await db.application.findUnique({ where: { profileId_jobId: { profileId: id, jobId } } });
  if (app && doc.status === "PASSED") {
    await db.application.update({ where: { id: app.id }, data: kind === "RESUME" ? { resumeDocumentId: doc.id } : { coverLetterDocumentId: doc.id } });
  }
  refreshAll();
  redirect(`/documents/${doc.id}`);
}

export async function editClaimAction(fd: FormData) {
  const id = await requireProfile();
  const doc = await editClaim(id, str(fd, "documentId"), str(fd, "claimId"), str(fd, "text"));
  refreshAll();
  redirect(`/documents/${doc.id}`);
}

// ───────────────────────── tracker ─────────────────────────

export async function changeStatusAction(fd: FormData) {
  const id = await requireProfile();
  const to = str(fd, "status") as AppStatus;
  if (!STATUSES.includes(to)) return;
  await changeStatus(id, str(fd, "applicationId"), to, str(fd, "note") || undefined);
  refreshAll();
}

export async function updateApplicationAction(fd: FormData) {
  const id = await requireProfile();
  const app = await db.application.findFirst({ where: { id: str(fd, "applicationId"), profileId: id } });
  if (!app) return;
  const fu = str(fd, "followUpAt");
  const ap = str(fd, "appliedAt");
  await db.application.update({
    where: { id: app.id },
    data: { notes: str(fd, "notes") || null, followUpAt: fu ? new Date(fu) : null, appliedAt: ap ? new Date(ap) : app.appliedAt, outcome: str(fd, "outcome") || app.outcome, reqId: str(fd, "reqId") || app.reqId },
  });
  refreshAll();
}

export async function addInterviewAction(fd: FormData) {
  const id = await requireProfile();
  const app = await db.application.findFirst({ where: { id: str(fd, "applicationId"), profileId: id } });
  const when = str(fd, "scheduledAt");
  if (!app || !when) return;
  await db.interview.create({ data: { applicationId: app.id, scheduledAt: new Date(when), kind: str(fd, "kind") || "PHONE_SCREEN", withWhom: str(fd, "withWhom") || null, location: str(fd, "location") || null, notes: str(fd, "notes") || null } });
  if (["SAVED", "READY", "APPLIED", "SCREEN"].includes(app.status)) await changeStatus(id, app.id, "INTERVIEW", "Interview scheduled");
  refreshAll();
}

export async function deleteInterviewAction(fd: FormData) {
  const id = await requireProfile();
  const iv = await db.interview.findFirst({ where: { id: str(fd, "interviewId"), application: { profileId: id } } });
  if (iv) await db.interview.delete({ where: { id: iv.id } });
  refreshAll();
}

// ───────────────────────── notifications & email ─────────────────────────

export async function markAllReadAction() {
  const id = await requireProfile();
  await db.notification.updateMany({ where: { profileId: id, readAt: null }, data: { readAt: new Date() } });
  refreshAll();
}

export async function scanInboxAction() {
  const id = await requireProfile();
  const r = await scanInbox(id);
  refreshAll();
  redirect(`/tracker?notice=${encodeURIComponent(r.connector ? `${r.connector}: ${r.created} new suggestion(s). Nothing changes until you confirm.` : "No email connector configured.")}`);
}

export async function resolveSignalAction(fd: FormData) {
  const id = await requireProfile();
  await resolveSignal(id, str(fd, "signalId"), str(fd, "accept") === "1");
  refreshAll();
}
