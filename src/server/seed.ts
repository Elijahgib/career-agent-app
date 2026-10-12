import { DEMO_JOBS } from "@/lib/demo/jobs";
import { DEMO_PERSONAS, type DemoPersona } from "@/lib/demo/personas";
import { db } from "./db";
import { importNormalizedJob } from "./jobs";
import { changeStatus, ensureApplication } from "./tracker";

const DAY = 86_400_000;

async function seedPersona(p: DemoPersona) {
  const profile = await db.candidateProfile.create({
    data: {
      displayName: p.profile.displayName,
      headline: p.profile.headline,
      email: p.profile.email,
      phone: p.profile.phone,
      city: p.profile.city,
      region: p.profile.region,
      country: p.profile.country,
      links: JSON.stringify(p.profile.links),
      careerLevel: p.profile.careerLevel,
      isDemo: true,
      nextFactNo: p.facts.length + 1,
      preferences: {
        create: {
          targetTitlesJson: JSON.stringify(p.preferences.targetTitles),
          targetKeywordsJson: JSON.stringify(p.preferences.targetKeywords),
          desiredSalaryMin: p.preferences.desiredSalaryMin ?? null,
          salaryHardFloor: p.preferences.salaryHardFloor ?? null,
          remotePreference: p.preferences.remotePreference,
          acceptableLocationsJson: JSON.stringify(p.preferences.acceptableLocations),
          willingToRelocate: p.preferences.willingToRelocate,
          employmentTypesJson: JSON.stringify(p.preferences.employmentTypes),
          excludedEmploymentJson: JSON.stringify(p.preferences.excludedEmploymentTypes),
          excludedCompaniesJson: JSON.stringify(p.preferences.excludedCompanies),
          excludedKeywordsJson: JSON.stringify(p.preferences.excludedKeywords),
          securityClearance: p.preferences.securityClearance,
          hasDriversLicense: p.preferences.hasDriversLicense,
          canTravelPercent: p.preferences.canTravelPercent ?? null,
          workAuthorization: p.preferences.workAuthorization ?? null,
        },
      },
    },
  });
  const posIds = new Map<string, string>();
  for (const [i, pos] of p.positions.entries()) {
    const row = await db.position.create({
      data: { profileId: profile.id, employer: pos.employer, title: pos.title, location: pos.location ?? null, employmentType: pos.employmentType ?? "FULL_TIME", startDate: pos.startDate, endDate: pos.endDate ?? null, verificationStatus: pos.verificationStatus, sortOrder: i },
    });
    posIds.set(pos.id, row.id);
  }
  for (const e of p.education) {
    await db.education.create({ data: { profileId: profile.id, institution: e.institution, credential: e.credential, level: e.level, field: e.field ?? null, status: e.status, startDate: e.startDate ?? null, endDate: e.endDate ?? null, verificationStatus: e.verificationStatus } });
  }
  for (const f of p.facts) {
    await db.evidenceFact.create({
      data: {
        profileId: profile.id,
        code: f.code,
        positionId: f.positionId ? posIds.get(f.positionId) ?? null : null,
        context: f.context ?? null,
        roleContext: f.roleContext ?? null,
        category: f.category,
        experienceType: f.experienceType,
        canonicalFact: f.canonicalFact,
        source: f.source ?? "Self-reported (synthetic demo)",
        verificationStatus: f.verificationStatus,
        confidence: f.confidence ?? "MEDIUM",
        conceptIdsJson: JSON.stringify(f.conceptIds ?? []),
        allowedWordingJson: JSON.stringify(f.allowedWording ?? []),
        prohibitedExpansionsJson: JSON.stringify(f.prohibitedExpansions ?? []),
        relationsJson: JSON.stringify(f.relations ?? []),
        startDate: f.startDate ?? null,
        endDate: f.endDate ?? null,
        verifiedAt: f.verificationStatus === "VERIFIED" ? new Date() : null,
      },
    });
  }
  return profile;
}

export async function seedDemoJobs(now = new Date()) {
  const ids = new Map<string, string>();
  for (const d of DEMO_JOBS) {
    const postedAt = new Date(now.getTime() - d.postedDaysAgo * DAY);
    const base = {
      title: d.title,
      company: d.company,
      location: d.location,
      remoteType: d.remoteType,
      employmentType: d.employmentType,
      salaryMin: d.salaryMin ?? null,
      salaryMax: d.salaryMax ?? null,
      salaryPeriod: d.salaryPeriod ?? null,
      salaryCurrency: "USD",
      description: d.description,
      postedAt,
      department: null,
      reqId: d.reqId,
    };
    const r = await importNormalizedJob(
      { ...base, sourceType: "DEMO", sourceName: "synthetic-demo", externalId: d.key, url: `https://example.com/careers/${d.key}`, applyUrl: `https://example.com/careers/${d.key}`, structured: { location: false, remoteType: false, employmentType: false, salary: false, postingExists: false } },
      { now: postedAt, isDemo: true },
    );
    await db.job.update({ where: { id: r.jobId }, data: { isDemo: true, firstSeenAt: postedAt } });
    for (const extra of d.alsoSeenOn ?? []) {
      // Same posting seen later elsewhere: dedupes into the same job, provenance preserved.
      await importNormalizedJob(
        { ...base, sourceType: extra.sourceType as "MANUAL", sourceName: extra.sourceName, externalId: `${d.key}-alert`, url: `https://alerts.example.com/${d.key}`, structured: { location: false, remoteType: false, employmentType: false, salary: false, postingExists: false } },
        { now: new Date(postedAt.getTime() + extra.daysAfter * DAY) },
      );
    }
    ids.set(d.key, r.jobId);
  }
  return ids;
}

/** Load synthetic demo profiles, jobs and a little tracker history. Idempotent on demo profiles. */
export async function seedDemo(opts: { reset?: boolean } = {}) {
  if (opts.reset) {
    await db.candidateProfile.deleteMany({ where: { isDemo: true } });
    await db.job.deleteMany({ where: { isDemo: true } });
  }
  const existing = await db.candidateProfile.count({ where: { isDemo: true } });
  if (existing) return { skipped: true, profiles: existing };
  const now = new Date();
  const jobIds = await seedDemoJobs(now);
  const profiles = [];
  for (const p of DEMO_PERSONAS) profiles.push({ key: p.key, row: await seedPersona(p) });
  const jordan = profiles.find((p) => p.key === "jordan")!.row;
  const sam = profiles.find((p) => p.key === "sam")!.row;

  // Jordan: a realistic in-flight pipeline.
  const proseware = await ensureApplication(jordan.id, jobIds.get("proseware-field")!, "SAVED");
  await changeStatus(jordan.id, proseware.id, "READY", "Resume tailored");
  await changeStatus(jordan.id, proseware.id, "APPLIED", "Applied on employer site");
  await db.application.update({ where: { id: proseware.id }, data: { followUpAt: new Date(now.getTime() + 0.5 * DAY) } });
  const coffee = await ensureApplication(jordan.id, jobIds.get("fourthcoffee-pos")!, "SAVED");
  await changeStatus(jordan.id, coffee.id, "APPLIED");
  await changeStatus(jordan.id, coffee.id, "SCREEN", "Recruiter call went well");
  await changeStatus(jordan.id, coffee.id, "INTERVIEW");
  await db.interview.create({ data: { applicationId: coffee.id, scheduledAt: new Date(now.getTime() + 1.2 * DAY), kind: "ONSITE", withWhom: "Store technology manager", location: "Austin, TX", notes: "Bring a list of POS models you've repaired." } });
  await ensureApplication(jordan.id, jobIds.get("contoso-desktop")!, "SAVED");
  await ensureApplication(sam.id, jobIds.get("fabrikam-helpdesk")!, "SAVED");
  return { skipped: false, profiles: profiles.length, jobs: jobIds.size };
}
