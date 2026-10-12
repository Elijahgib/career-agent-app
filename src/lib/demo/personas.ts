// SYNTHETIC demo personas. Entirely fictional — no real applicant data.
// Names, employers, emails (example.com) and phone numbers (555-01xx) are invented.

import type {
  CandidateSnapshot,
  EducationRecord,
  LedgerFact,
  PositionRecord,
  PreferencesRecord,
  ProfileRecord,
} from "@/lib/domain/types";
import { buildLedger } from "@/lib/evidence/ledger";

export interface DemoFact extends Omit<LedgerFact, "id" | "source" | "confidence" | "conceptIds" | "allowedWording" | "prohibitedExpansions" | "relations"> {
  source?: string;
  confidence?: LedgerFact["confidence"];
  conceptIds?: string[];
  allowedWording?: string[];
  prohibitedExpansions?: string[];
  /** Explicit relationship; omitted = inferred from the canonical text. */
  relations?: LedgerFact["relations"];
}

export interface DemoPersona {
  key: string;
  profile: Omit<ProfileRecord, "id"> & { headline: string };
  preferences: PreferencesRecord;
  positions: PositionRecord[];
  education: EducationRecord[];
  facts: DemoFact[];
}

const basePrefs: PreferencesRecord = {
  targetTitles: [],
  targetKeywords: [],
  desiredSalaryMin: null,
  salaryHardFloor: null,
  salaryCurrency: "USD",
  remotePreference: "ANY",
  acceptableLocations: [],
  willingToRelocate: false,
  employmentTypes: ["FULL_TIME"],
  excludedEmploymentTypes: [],
  excludedCompanies: [],
  excludedKeywords: [],
  securityClearance: "NONE",
  hasDriversLicense: true,
  canTravelPercent: null,
  workAuthorization: "Authorized to work in the US",
};

export const JORDAN: DemoPersona = {
  key: "jordan",
  profile: {
    displayName: "Jordan Rivera (demo)",
    headline: "Field service tech moving into desktop support",
    email: "jordan.rivera@example.com",
    phone: "(555) 010-0142",
    city: "Austin",
    region: "TX",
    country: "US",
    links: [],
    careerLevel: "EARLY",
  },
  preferences: {
    ...basePrefs,
    targetTitles: ["Desktop Support Technician", "IT Support Specialist", "Field Service Technician", "Help Desk Technician"],
    targetKeywords: ["hardware", "POS", "printers", "desktop support"],
    desiredSalaryMin: 50000,
    salaryHardFloor: 40000,
    remotePreference: "ANY",
    acceptableLocations: ["Austin, TX", "Round Rock, TX", "Pflugerville, TX", "Remote"],
    employmentTypes: ["FULL_TIME", "CONTRACT"],
    excludedEmploymentTypes: ["PART_TIME"],
    excludedKeywords: ["commission only", "door-to-door"],
    canTravelPercent: 50,
  },
  positions: [
    { id: "pos-jordan-northwind", employer: "Northwind Retail Systems", title: "Field Service Technician", location: "Austin, TX", employmentType: "FULL_TIME", startDate: "2021-03", endDate: null, verificationStatus: "VERIFIED" },
    { id: "pos-jordan-fabrikam", employer: "Fabrikam Electronics", title: "Sales Associate", location: "Austin, TX", employmentType: "PART_TIME", startDate: "2018-06", endDate: "2021-02", verificationStatus: "VERIFIED" },
  ],
  education: [
    { id: "edu-jordan-hs", institution: "Lakeview High School", credential: "High School Diploma", level: "HIGH_SCHOOL", field: null, status: "COMPLETED", startDate: "2014-08", endDate: "2018-05", verificationStatus: "VERIFIED" },
  ],
  facts: [
    {
      code: "FACT-001", positionId: "pos-jordan-northwind", context: "Northwind Retail Systems", roleContext: "Field Service Technician",
      category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED", source: "Self-reported; confirmed by manager reference", confidence: "HIGH",
      canonicalFact: "Diagnosed and repaired POS systems, printers, scanners and payment peripherals at retail store locations.",
      conceptIds: ["hardware-troubleshooting", "hardware-repair", "pos-systems", "printers", "scanners", "payment-devices", "peripherals", "field-service"],
      allowedWording: ["hardware troubleshooting", "peripheral troubleshooting", "printer support", "hardware diagnosis", "parts replacement"],
      prohibitedExpansions: ["enterprise desktop support", "PC imaging", "SCCM", "Intune", "inventory management", "refurbishment", "warranty administration"],
      startDate: "2021-03",
    },
    {
      code: "FACT-002", positionId: "pos-jordan-northwind", context: "Northwind Retail Systems", roleContext: "Field Service Technician",
      category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Installed and configured replacement POS terminals and receipt printers during store remodels.",
      allowedWording: ["hardware setup", "device setup", "hardware installation"],
      prohibitedExpansions: ["PC imaging", "OS deployment", "Autopilot"],
    },
    {
      code: "FACT-003", positionId: "pos-jordan-northwind", context: "Northwind Retail Systems", roleContext: "Field Service Technician",
      category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Communicated repair status and next steps to store managers and staff on site.",
      allowedWording: ["customer communication", "explained repairs"],
      prohibitedExpansions: ["phone support", "chat support", "email support", "help desk"],
    },
    {
      code: "FACT-004", positionId: "pos-jordan-northwind", context: "Northwind Retail Systems", roleContext: "Field Service Technician",
      category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Logged parts used, serial numbers and repair notes in service records for each visit.",
      allowedWording: ["service records", "repair documentation", "asset tracking"],
      prohibitedExpansions: ["inventory management", "IT asset management", "asset lifecycle management", "inventory control"],
    },
    {
      code: "FACT-005", positionId: "pos-jordan-northwind", context: "Northwind Retail Systems", roleContext: "Field Service Technician",
      category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Terminated and tested Cat6 data cabling for POS network drops.",
      allowedWording: ["low-voltage cabling", "data cabling", "cable termination"],
      prohibitedExpansions: ["voice cabling", "telecom cabling", "network engineering"],
    },
    {
      code: "FACT-006", positionId: "pos-jordan-northwind", context: "Northwind Retail Systems", roleContext: "Field Service Technician",
      category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Troubleshot store modem and router connectivity issues with the internet service provider.",
      allowedWording: ["network connectivity troubleshooting", "connectivity troubleshooting"],
      prohibitedExpansions: ["network engineering", "network administration", "routing and switching"],
    },
    {
      code: "FACT-007", positionId: "pos-jordan-northwind", context: "Northwind Retail Systems", roleContext: "Field Service Technician",
      category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Supported Windows-based POS workstations and back-office PCs at 30 store locations.",
      allowedWording: ["Windows devices"],
      prohibitedExpansions: ["Windows administration", "Windows Server", "Active Directory", "Group Policy"],
    },
    {
      code: "FACT-008", positionId: "pos-jordan-fabrikam", context: "Fabrikam Electronics", roleContext: "Sales Associate",
      category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Helped customers choose laptops and accessories and explained product features.",
      allowedWording: ["customer service", "customer communication"],
      prohibitedExpansions: ["technical support", "help desk"],
    },
    {
      code: "FACT-009", positionId: "pos-jordan-fabrikam", context: "Fabrikam Electronics", roleContext: "Sales Associate",
      category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Handled cash and card transactions at the register.",
      allowedWording: ["cash handling"],
    },
    {
      code: "FACT-010", positionId: "pos-jordan-northwind", context: "Northwind Retail Systems", roleContext: "Field Service Technician",
      category: "TOOL", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Used Microsoft Office (Word, Excel, Outlook) to complete service reports and schedules.",
      allowedWording: ["Microsoft Office", "Excel"],
      prohibitedExpansions: ["Microsoft 365 administration", "Office 365 support", "Exchange administration"],
    },
    {
      code: "FACT-011", context: "Self-study", roleContext: "Certification candidate",
      category: "LEARNING", experienceType: "LEARNING", verificationStatus: "VERIFIED", source: "Exam score report",
      canonicalFact: "Studying for CompTIA A+ certification (Core 1 exam passed, Core 2 in progress).",
      conceptIds: ["comptia-a-plus"],
    },
    {
      code: "FACT-012", context: "Home lab", roleContext: "Personal project",
      category: "PROJECT", experienceType: "LEARNING", verificationStatus: "VERIFIED", source: "Lab notes and screenshots",
      canonicalFact: "Built a home lab with Windows Server evaluation to practice Active Directory user and group management.",
      conceptIds: ["windows-server", "active-directory", "virtualization"],
      prohibitedExpansions: ["Active Directory administration", "Windows administration"],
    },
    {
      code: "FACT-013", positionId: "pos-jordan-northwind", context: "Northwind Retail Systems", roleContext: "Field Service Technician",
      category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "UNVERIFIED", source: "Imported from old resume — needs review", confidence: "LOW",
      canonicalFact: "Provided phone support to store staff during after-hours POS outages.",
    },
    {
      code: "FACT-014", context: "State of Texas", roleContext: "Driver",
      category: "LICENSE", experienceType: "ACADEMIC", verificationStatus: "VERIFIED",
      canonicalFact: "Valid driver's license with a clean driving record.",
      conceptIds: ["drivers-license"],
    },
  ],
};

export const SAM: DemoPersona = {
  key: "sam",
  profile: {
    displayName: "Sam Okafor (demo)",
    headline: "New IT grad — help desk / junior sysadmin",
    email: "sam.okafor@example.com",
    phone: "(555) 010-0177",
    city: "Columbus",
    region: "OH",
    country: "US",
    links: [],
    careerLevel: "ENTRY",
  },
  preferences: {
    ...basePrefs,
    targetTitles: ["Help Desk Technician", "IT Support Specialist", "Service Desk Analyst", "Junior Systems Administrator"],
    targetKeywords: ["help desk", "Active Directory", "imaging"],
    desiredSalaryMin: 52000,
    salaryHardFloor: 45000,
    remotePreference: "REMOTE_OR_HYBRID",
    acceptableLocations: ["Columbus, OH", "Dublin, OH", "Remote"],
    willingToRelocate: false,
    employmentTypes: ["FULL_TIME"],
  },
  positions: [
    { id: "pos-sam-lsu", employer: "Lakeview State University IT Help Desk", title: "Student Help Desk Technician", location: "Columbus, OH", employmentType: "PART_TIME", startDate: "2022-09", endDate: "2024-05", verificationStatus: "VERIFIED" },
    { id: "pos-sam-contoso", employer: "Contoso Health", title: "IT Intern", location: "Columbus, OH", employmentType: "INTERNSHIP", startDate: "2023-06", endDate: "2023-08", verificationStatus: "VERIFIED" },
  ],
  education: [
    { id: "edu-sam-bs", institution: "Lakeview State University", credential: "B.S. Information Technology", level: "BACHELOR", field: "Information Technology", status: "COMPLETED", startDate: "2020-08", endDate: "2024-05", verificationStatus: "VERIFIED" },
  ],
  facts: [
    { code: "FACT-001", positionId: "pos-sam-lsu", context: "Lakeview State University IT Help Desk", roleContext: "Student Help Desk Technician", category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Answered phone and walk-in help desk requests from students and staff.", allowedWording: ["phone support", "help desk support", "walk-in support"], prohibitedExpansions: ["chat support", "tier 2 support"] },
    { code: "FACT-002", positionId: "pos-sam-lsu", context: "Lakeview State University IT Help Desk", roleContext: "Student Help Desk Technician", category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Reset passwords and unlocked accounts in Active Directory for students and staff.", allowedWording: ["password resets", "account unlocks", "Active Directory"], prohibitedExpansions: ["Active Directory administration", "Group Policy"] },
    { code: "FACT-003", positionId: "pos-sam-lsu", context: "Lakeview State University IT Help Desk", roleContext: "Student Help Desk Technician", category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Logged and updated tickets in Jira Service Management.", allowedWording: ["ticketing", "Jira"] },
    { code: "FACT-004", positionId: "pos-sam-lsu", context: "Lakeview State University IT Help Desk", roleContext: "Student Help Desk Technician", category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Set up and reimaged computer lab PCs each semester using FOG Project.", allowedWording: ["PC imaging", "computer imaging", "workstation setup"], prohibitedExpansions: ["SCCM", "Autopilot", "Intune"] },
    { code: "FACT-005", positionId: "pos-sam-lsu", context: "Lakeview State University IT Help Desk", roleContext: "Student Help Desk Technician", category: "ACHIEVEMENT", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Wrote 12 knowledge base articles for common Wi-Fi and printing issues.", allowedWording: ["documentation", "knowledge base articles"] },
    { code: "FACT-006", positionId: "pos-sam-contoso", context: "Contoso Health", roleContext: "IT Intern", category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Assisted the desktop team with deploying 40 laptops using Windows Autopilot.", allowedWording: ["assisted with laptop deployment", "assisted with Windows Autopilot deployments"], prohibitedExpansions: ["Intune administration", "led deployment", "SCCM"] },
    { code: "FACT-007", positionId: "pos-sam-contoso", context: "Contoso Health", roleContext: "IT Intern", category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Recorded asset tags and assigned users in the hardware tracking spreadsheet.", allowedWording: ["asset tracking", "asset tags"], prohibitedExpansions: ["IT asset management", "inventory management"] },
    { code: "FACT-008", context: "CompTIA", roleContext: "Certification", category: "CERTIFICATION", experienceType: "ACADEMIC", verificationStatus: "VERIFIED", source: "Certification verification code",
      canonicalFact: "CompTIA A+ certification (earned 2023).", conceptIds: ["comptia-a-plus"] },
    { code: "FACT-009", context: "Self-study", roleContext: "Certification candidate", category: "LEARNING", experienceType: "LEARNING", verificationStatus: "VERIFIED",
      canonicalFact: "Studying for CompTIA Network+ (exam scheduled).", conceptIds: ["comptia-network-plus"] },
    { code: "FACT-010", context: "Lakeview State University", roleContext: "Capstone project", category: "PROJECT", experienceType: "ACADEMIC", verificationStatus: "VERIFIED",
      canonicalFact: "Capstone project: wrote Python and PowerShell scripts to automate lab user account creation.", conceptIds: ["python", "powershell"] },
    { code: "FACT-011", positionId: "pos-sam-lsu", context: "Lakeview State University IT Help Desk", roleContext: "Student Help Desk Technician", category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "UNVERIFIED", confidence: "LOW", source: "Draft — not confirmed",
      canonicalFact: "Supported Microsoft 365 mailbox and license issues for faculty." },
  ],
};

export const ALEX: DemoPersona = {
  key: "alex",
  profile: {
    displayName: "Alex Moreno (demo)",
    headline: "Shift supervisor exploring operations & customer support",
    email: "alex.moreno@example.com",
    phone: "(555) 010-0193",
    city: "Columbus",
    region: "OH",
    country: "US",
    links: [],
    careerLevel: "MID",
  },
  preferences: {
    ...basePrefs,
    targetTitles: ["Operations Coordinator", "Customer Support Specialist", "Team Lead"],
    targetKeywords: ["scheduling", "customer service", "operations"],
    desiredSalaryMin: 48000,
    salaryHardFloor: 42000,
    remotePreference: "ANY",
    acceptableLocations: ["Columbus, OH", "Remote"],
    employmentTypes: ["FULL_TIME"],
  },
  positions: [
    { id: "pos-alex-tailspin", employer: "Tailspin Coffee", title: "Shift Supervisor", location: "Columbus, OH", employmentType: "FULL_TIME", startDate: "2019-04", endDate: "2024-12", verificationStatus: "VERIFIED" },
  ],
  education: [
    { id: "edu-alex-aa", institution: "Columbus Community College", credential: "Associate of Arts", level: "ASSOCIATE", field: "Business", status: "COMPLETED", startDate: "2016-08", endDate: "2018-05", verificationStatus: "VERIFIED" },
  ],
  facts: [
    { code: "FACT-001", positionId: "pos-alex-tailspin", context: "Tailspin Coffee", roleContext: "Shift Supervisor", category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Supervised a team of 6 baristas per shift and assigned stations during peak hours.", allowedWording: ["team leadership", "shift supervision"] },
    { code: "FACT-002", positionId: "pos-alex-tailspin", context: "Tailspin Coffee", roleContext: "Shift Supervisor", category: "ACHIEVEMENT", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Trained 15 new hires on POS and food-safety procedures.", allowedWording: ["training new employees", "onboarding"] },
    { code: "FACT-003", positionId: "pos-alex-tailspin", context: "Tailspin Coffee", roleContext: "Shift Supervisor", category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Reconciled cash drawers and completed end-of-shift sales reports in Excel.", allowedWording: ["cash reconciliation", "Excel"] },
    { code: "FACT-004", positionId: "pos-alex-tailspin", context: "Tailspin Coffee", roleContext: "Shift Supervisor", category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Built weekly shift schedules for 12 employees using a scheduling app.", allowedWording: ["scheduling", "shift scheduling"] },
    { code: "FACT-005", positionId: "pos-alex-tailspin", context: "Tailspin Coffee", roleContext: "Shift Supervisor", category: "DUTY", experienceType: "PROFESSIONAL", verificationStatus: "VERIFIED",
      canonicalFact: "Resolved customer complaints in person and issued refunds within store policy.", allowedWording: ["customer service", "customer communication"], prohibitedExpansions: ["phone support", "chat support", "email support"] },
    { code: "FACT-006", context: "Online course", roleContext: "Learner", category: "LEARNING", experienceType: "LEARNING", verificationStatus: "VERIFIED",
      canonicalFact: "Completing an online course in data analysis with spreadsheets and SQL (in progress).", conceptIds: ["data-analysis", "sql"] },
  ],
};

export const DEMO_PERSONAS: DemoPersona[] = [JORDAN, SAM, ALEX];

/** Build a CandidateSnapshot from a persona (tests and seeding). */
export function personaSnapshot(p: DemoPersona, id = `demo-${p.key}`): CandidateSnapshot {
  const stored: LedgerFact[] = p.facts.map((f) => ({
    ...f,
    id: `${id}-${f.code}`,
    source: f.source ?? "Self-reported",
    confidence: f.confidence ?? "MEDIUM",
    conceptIds: f.conceptIds ?? [],
    allowedWording: f.allowedWording ?? [],
    relations: f.relations ?? [],
    prohibitedExpansions: f.prohibitedExpansions ?? [],
  }));
  return {
    profile: { id, ...p.profile },
    preferences: p.preferences,
    positions: p.positions,
    education: p.education,
    facts: buildLedger(stored, p.positions, p.education),
  };
}
