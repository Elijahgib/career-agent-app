// Polished, consistent user-facing labels for enum-like values. Keep acronyms correct and
// never title-case full sentences — this is only for short labels/options/badges.

const EXPERIENCE_TYPE: Record<string, string> = {
  PROFESSIONAL: "Professional",
  VOLUNTEER: "Volunteer",
  ACADEMIC: "Academic",
  PROJECT: "Project",
  LEARNING: "Lab / Study",
};

const VERIFICATION: Record<string, string> = {
  VERIFIED: "Verified",
  UNVERIFIED: "Unverified",
  LIKELY: "Likely",
  UNKNOWN: "Unknown",
};

const CATEGORY: Record<string, string> = {
  DUTY: "Duty",
  ACHIEVEMENT: "Achievement",
  SKILL: "Skill",
  TOOL: "Tool",
  CERTIFICATION: "Certification",
  LICENSE: "License",
  PROJECT: "Project",
  LEARNING: "Learning",
  SOFT_SKILL: "Soft Skill",
  CLEARANCE: "Clearance",
};

export function experienceTypeLabel(t: string): string {
  return EXPERIENCE_TYPE[t] ?? t;
}
export function verificationLabel(s: string): string {
  return VERIFICATION[s] ?? s;
}
export function categoryLabel(c: string): string {
  return CATEGORY[c] ?? c.replace(/_/g, " ");
}
export function careerLevelLabel(l: string): string {
  return { ENTRY: "Entry", EARLY: "Early career", MID: "Mid-level", SENIOR: "Senior" }[l] ?? l;
}
