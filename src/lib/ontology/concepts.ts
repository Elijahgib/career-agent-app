// Controlled vocabulary shared by the Truth Gate, the matching engine,
// the generators and the skill-gap engine.
//
// Key semantics (see docs/TRUTH_GATE.md):
// - `aliases`     phrases that, when they appear in text, mean the concept is being mentioned.
// - `implies`     holding THIS concept licenses the listed (weaker) concepts. Never the reverse.
//                 e.g. network-engineering implies networking-fundamentals; the opposite is false.
// - `transfersTo` THIS concept is *relevant* to the listed concepts. Transfer is used for
//                 match explanations and honest "transferable" sentences only — it NEVER
//                 licenses a claim of experience in the target concept.
// - `overstatements` common inflations of this concept. Suggested as prohibited expansions
//                 and surfaced as interview "do not claim" warnings.
// - `intrinsic`   for activity concepts, the relationship that saying the concept implies
//                 ("Desktop support" = SUPPORTED, "Network engineering" = ADMINISTERED).
//                 Evidence must reach that relationship (see src/lib/evidence/relations.ts).

import type { Relation } from "@/lib/domain/types";

export type ConceptKind =
  | "duty"
  | "skill"
  | "tool"
  | "platform"
  | "hardware"
  | "certification"
  | "channel"
  | "environment"
  | "title"
  | "domain"
  | "soft"
  | "license"
  | "clearance"
  | "methodology";

export interface TransferDef {
  to: string;
  strength: number; // 0..1, how much of the target requirement this realistically covers
  note: string;
}

export interface LearningPath {
  practice?: string[];
  labs?: string[];
  certifications?: string[];
  projects?: string[];
}

export interface ConceptDef {
  id: string;
  label: string;
  kind: ConceptKind;
  aliases: string[];
  implies?: string[];
  transfersTo?: TransferDef[];
  /** Tool family — tools in the same family transfer to each other. */
  family?: string;
  /** Eligible for a resume "Core Competencies" list. Defaults by kind. */
  competency?: boolean;
  overstatements?: string[];
  /** For activity concepts: the relationship that claiming this concept asserts. */
  intrinsic?: Relation;
  /** Acronyms matched case-sensitively only ("AD" — never "ad" in ordinary text). */
  acronyms?: string[];
  /** 1 (days) … 5 (many months). Used by the skill-gap engine. */
  effort?: 1 | 2 | 3 | 4 | 5;
  /** false when the gap cannot be closed by study (e.g. clearance, years). */
  trainable?: boolean;
  learn?: LearningPath;
  questions?: string[];
  askEmployer?: string[];
}

const C = (def: ConceptDef): ConceptDef => def;

export const CONCEPTS: ConceptDef[] = [
  // ───────────── Hardware & field service ─────────────
  C({
    id: "hardware-troubleshooting",
    label: "Hardware troubleshooting",
    kind: "duty", intrinsic: "TROUBLESHOT",
    aliases: [
      "hardware troubleshooting", "troubleshoot hardware", "troubleshooting hardware", "troubleshot hardware",
      "hardware diagnosis", "hardware diagnostics", "diagnosed hardware", "hardware issues", "hardware problems",
      "diagnosed and repaired", "diagnose and repair", "diagnosing and repairing", "hardware faults",
    ],
    implies: ["technical-troubleshooting"],
    transfersTo: [
      { to: "desktop-support", strength: 0.55, note: "Hands-on hardware diagnosis is a core part of desktop support work." },
      { to: "help-desk-support", strength: 0.35, note: "Structured troubleshooting carries over to help desk triage." },
    ],
    overstatements: ["enterprise desktop support", "desktop administration", "PC imaging", "SCCM", "Intune", "endpoint management"],
    effort: 3,
    questions: ["A workstation powers on but shows no display. Walk me through how you would isolate the fault."],
  }),
  C({
    id: "hardware-repair",
    label: "Hardware repair",
    kind: "duty", intrinsic: "REPAIRED",
    aliases: [
      "hardware repair", "repaired hardware", "repairing hardware", "equipment repair", "repaired equipment",
      "repairing equipment", "parts replacement", "replaced parts", "replacing parts", "component replacement",
      "replaced components", "repaired devices", "device repair",
    ],
    implies: ["hardware-troubleshooting"],
    transfersTo: [
      { to: "refurbishment", strength: 0.5, note: "Repair skills are relevant to refurbishment work, but refurbishment itself is a different process." },
      { to: "desktop-support", strength: 0.45, note: "Component-level repair experience is relevant to desktop hardware support." },
    ],
    overstatements: ["refurbishment", "refurbished", "warranty administration", "depot repair management"],
    effort: 3,
  }),
  C({
    id: "hardware-setup",
    label: "Hardware setup & installation",
    kind: "duty", intrinsic: "INSTALLED",
    aliases: [
      "hardware setup", "hardware installation", "installed hardware", "installing hardware", "device setup",
      "set up devices", "setting up devices", "equipment installation", "installed equipment", "installing equipment",
      "workstation setup", "set up workstations", "computer setup", "set up computers", "setting up computers",
    ],
    transfersTo: [
      { to: "pc-imaging", strength: 0.25, note: "Setting up hardware is adjacent to imaging/deployment, but imaging requires its own evidence." },
      { to: "desktop-support", strength: 0.35, note: "Device setup is part of many desktop support roles." },
    ],
    overstatements: ["PC imaging", "OS deployment", "MDT", "SCCM", "Autopilot"],
    effort: 2,
  }),
  C({
    id: "field-service",
    label: "Field service",
    kind: "duty", intrinsic: "PERFORMED",
    aliases: [
      "field service", "field services", "on-site service", "onsite service", "service calls", "customer sites",
      "field repair", "dispatched to", "on-site repairs", "onsite repairs", "traveled to customer",
    ],
    transfersTo: [
      { to: "desktop-support", strength: 0.35, note: "On-site service work mirrors deskside support with end users." },
      { to: "help-desk-support", strength: 0.25, note: "Working directly with users on technical problems is relevant to help desk work." },
    ],
    overstatements: ["desktop support technician", "IT support specialist"],
    effort: 3,
    askEmployer: ["How is on-site work split from remote support, and how are calls dispatched?"],
  }),
  C({ id: "pos-systems", label: "POS systems", kind: "hardware", competency: true, aliases: ["pos", "pos systems", "pos system", "point of sale", "point-of-sale", "pos terminals", "pos terminal", "cash registers"] }),
  C({ id: "printers", label: "Printers", kind: "hardware", competency: true, implies: ["peripherals"], aliases: ["printer", "printers", "receipt printer", "receipt printers", "label printer", "label printers", "network printer", "network printers"] }),
  C({ id: "payment-devices", label: "Payment devices", kind: "hardware", competency: true, implies: ["peripherals"], aliases: ["payment peripherals", "payment terminals", "payment terminal", "pin pads", "pin pad", "card readers", "card reader", "payment devices"] }),
  C({ id: "scanners", label: "Scanners", kind: "hardware", competency: true, implies: ["peripherals"], aliases: ["scanner", "scanners", "barcode scanner", "barcode scanners", "handheld scanners"] }),
  C({ id: "peripherals", label: "Peripherals", kind: "hardware", competency: true, aliases: ["peripheral", "peripherals", "peripheral devices"] }),
  C({ id: "mobile-devices", label: "Mobile devices", kind: "hardware", competency: true, aliases: ["mobile devices", "smartphones", "tablets", "ipads", "iphones", "android devices", "handheld devices"] }),
  C({ id: "routers-modems", label: "Routers & modems", kind: "hardware", competency: true, aliases: ["router", "routers", "modem", "modems", "wireless router", "wireless routers", "access point", "access points", "gateway router"] }),
  C({ id: "switches", label: "Network switches", kind: "hardware", aliases: ["switch", "switches", "network switch", "network switches", "managed switch", "managed switches"], effort: 3 }),
  C({ id: "wireless", label: "Wireless connectivity", kind: "skill", aliases: ["wireless", "wireless connectivity", "wireless network", "wireless networks", "wireless networking", "wi-fi", "wifi", "wlan"], effort: 2 }),
  C({ id: "print-server", label: "Print servers", kind: "platform", aliases: ["print server", "print servers", "printer server", "printer servers", "print queue", "print queues", "print services", "print management", "printer management", "managed print", "managed print services", "print infrastructure", "printing infrastructure", "printer fleet", "print fleet", "print spooler", "spooler", "printer queues", "printer queue", "print drivers", "printer drivers", "printer estate"], effort: 2 }),
  C({
    id: "device-deployment",
    label: "Device deployment",
    kind: "duty",
    intrinsic: "INSTALLED",
    aliases: ["pc deployment", "pc deployments", "computer deployment", "computer deployments", "laptop deployment", "laptop deployments", "workstation deployment", "device deployment", "device deployments", "hardware deployment", "device rollout", "device rollouts", "laptop rollout", "laptop rollouts", "deploying laptops", "deployed laptops", "deploying computers", "deployed computers"],
    effort: 2,
  }),
  C({
    id: "pc-imaging",
    label: "PC imaging / OS deployment",
    kind: "duty", intrinsic: "PERFORMED",
    aliases: [
      "pc imaging", "computer imaging", "imaging", "imaged", "reimaging", "re-imaging", "reimaged", "re-imaged", "reimage", "re-image",
      "disk imaging", "os deployment", "operating system deployment", "image deployment", "deploying images",
      "wds", "windows deployment services", "clonezilla", "fog project",
    ],
    implies: ["device-deployment"],
    effort: 2,
    learn: {
      labs: ["Capture and deploy a Windows image to virtual machines with the Microsoft Deployment Toolkit or FOG Project."],
      projects: ["Write a short runbook for your lab imaging process — label it as a lab project, not job experience."],
    },
    questions: ["How would you image and deploy 20 new laptops with the same software baseline?"],
    askEmployer: ["What does the imaging and deployment process look like today (Autopilot, MDT, SCCM)?"],
  }),
  C({ id: "autopilot", label: "Windows Autopilot", kind: "tool", family: "imaging", aliases: ["autopilot", "windows autopilot"], implies: ["pc-imaging"], effort: 2 }),
  C({ id: "mdt", label: "Microsoft Deployment Toolkit", kind: "tool", family: "imaging", aliases: ["mdt", "microsoft deployment toolkit"], implies: ["pc-imaging"], effort: 2 }),
  C({
    id: "refurbishment",
    label: "Refurbishment",
    kind: "duty", intrinsic: "PERFORMED",
    aliases: ["refurbishment", "refurbish", "refurbished", "refurbishing", "reconditioned", "reconditioning", "remanufactured", "remanufacturing"],
    effort: 2,
    learn: { practice: ["Learn grading standards and data-wipe procedures used in IT asset refurbishment."] },
  }),
  C({
    id: "warranty-admin",
    label: "Warranty administration",
    kind: "duty", intrinsic: "PERFORMED",
    aliases: ["warranty administration", "warranty claims", "rma processing", "rma", "rmas", "warranty processing", "processed warranty", "warranty returns", "vendor warranty"],
    effort: 1,
  }),

  // ───────────── Desktop / help desk / admin ─────────────
  C({
    id: "technical-troubleshooting",
    label: "Technical troubleshooting",
    kind: "skill", intrinsic: "TROUBLESHOT",
    aliases: ["troubleshooting", "troubleshoot", "troubleshot", "troubleshooting skills", "root cause", "diagnosed issues", "diagnosing issues", "diagnose issues"],
    transfersTo: [{ to: "help-desk-support", strength: 0.3, note: "General troubleshooting is the foundation of help desk work." }],
    effort: 3,
  }),
  C({
    id: "help-desk-support",
    label: "Help desk / IT support",
    kind: "duty", intrinsic: "SUPPORTED",
    aliases: [
      "help desk", "helpdesk", "service desk", "tier 1 support", "tier 1", "tier i", "level 1 support", "l1 support",
      "it support", "technical support", "tech support", "user support", "first-line support", "first line support",
    ],
    implies: ["technical-troubleshooting"],
    transfersTo: [
      { to: "desktop-support", strength: 0.5, note: "Help desk experience overlaps heavily with desktop support." },
      { to: "customer-service", strength: 0.5, note: "Help desk work is service work with internal or external customers." },
      { to: "customer-communication", strength: 0.5, note: "Help desk work involves explaining issues and fixes to users." },
    ],
    overstatements: ["desktop administration", "systems administration", "tier 2 support", "tier 3 support"],
    effort: 3,
    learn: {
      certifications: ["CompTIA A+"],
      practice: ["Volunteer IT help at a library, school or nonprofit to build real help-desk experience."],
    },
    questions: ["How do you prioritize a queue of open tickets?", "Tell me about a time you explained a technical fix to a non-technical person."],
    askEmployer: ["What is the typical ticket volume per technician, and how are escalations handled?"],
  }),
  C({
    id: "tier2-support",
    label: "Tier 2 support",
    kind: "duty", intrinsic: "SUPPORTED",
    aliases: ["tier 2", "tier ii", "tier 2 support", "level 2 support", "l2 support", "second-line support", "escalation support", "tier 3", "tier 3 support"],
    implies: ["help-desk-support"],
    effort: 4,
    trainable: false,
  }),
  C({
    id: "desktop-support",
    label: "Desktop support",
    kind: "duty", intrinsic: "SUPPORTED",
    aliases: [
      "desktop support", "deskside support", "desk side support", "end user support", "end-user support",
      "pc support", "computer support", "workstation support", "end user computing", "euc",
    ],
    implies: ["technical-troubleshooting"],
    transfersTo: [
      { to: "help-desk-support", strength: 0.5, note: "Desktop support overlaps heavily with help desk work." },
      { to: "enterprise-desktop-admin", strength: 0.3, note: "Desktop support is a common path into endpoint administration." },
    ],
    overstatements: ["desktop administration", "endpoint management", "systems administration"],
    effort: 3,
    learn: {
      certifications: ["CompTIA A+"],
      labs: ["Build a two-VM Windows lab and practice user-profile, driver and printer-mapping fixes."],
    },
    questions: ["A user says their laptop is 'slow'. What questions do you ask and what do you check first?"],
  }),
  C({
    id: "enterprise-desktop-admin",
    label: "Enterprise desktop administration",
    kind: "duty", intrinsic: "ADMINISTERED",
    aliases: [
      "enterprise desktop", "enterprise desktop support", "desktop administration", "desktop administrator",
      "endpoint management", "endpoint administration", "desktop engineering", "enterprise endpoints", "managed endpoints", "endpoint configuration",
      "endpoint administrator",
    ],
    implies: ["desktop-support"],
    effort: 4,
    learn: {
      labs: ["Set up a free Intune/Microsoft 365 developer tenant and enroll a VM; push a configuration profile."],
      certifications: ["Microsoft MD-102 (Endpoint Administrator)"],
    },
  }),
  C({
    id: "sccm",
    label: "Microsoft SCCM / MECM",
    kind: "tool",
    family: "endpoint-management",
    aliases: ["sccm", "mecm", "configmgr", "configuration manager", "system center configuration manager", "endpoint configuration manager"],
    implies: ["enterprise-desktop-admin"],
    effort: 3,
    learn: { labs: ["Install MECM in an evaluation lab (Windows Server eval + SQL Express) and deploy one application."] },
    questions: ["How would you deploy an application to a collection of machines with SCCM/MECM?"],
  }),
  C({
    id: "intune",
    label: "Microsoft Intune",
    kind: "tool",
    family: "endpoint-management",
    aliases: ["intune", "microsoft intune", "microsoft endpoint manager", "endpoint manager"],
    implies: ["enterprise-desktop-admin", "mdm"],
    effort: 3,
    learn: {
      labs: ["Use a Microsoft 365 developer/trial tenant to enroll a device in Intune and assign a compliance policy."],
      certifications: ["Microsoft MD-102 (Endpoint Administrator)"],
    },
  }),
  C({
    id: "mdm",
    label: "Mobile device management",
    kind: "skill", intrinsic: "ADMINISTERED",
    aliases: ["mdm", "mobile device management", "airwatch", "workspace one", "mobileiron"],
    effort: 2,
  }),
  C({ id: "jamf", label: "Jamf", kind: "tool", family: "endpoint-management", aliases: ["jamf", "jamf pro"], implies: ["mdm", "macos"], effort: 3 }),
  C({
    id: "active-directory",
    label: "Active Directory",
    kind: "tool",
    family: "directory",
    aliases: ["active directory", "ad ds", "aduc", "domain controller", "domain controllers", "ad users", "ad accounts", "ad groups", "directory services"],
    acronyms: ["AD"],
    implies: ["account-management"],
    effort: 2,
    learn: {
      labs: ["Install Windows Server evaluation in a VM, promote a domain controller, and practice creating users, groups and password resets."],
      projects: ["Document your AD lab with screenshots — present it as a home lab, not job experience."],
    },
    questions: ["How would you unlock an account and reset a password in Active Directory?", "What is the difference between a security group and a distribution group?"],
  }),
  C({ id: "entra-id", label: "Microsoft Entra ID (Azure AD)", kind: "tool", family: "directory", aliases: ["azure ad", "azure active directory", "entra id", "microsoft entra", "entra", "identity and access management", "identity and access"], implies: ["account-management"], effort: 2 }),
  C({ id: "group-policy", label: "Group Policy", kind: "tool", aliases: ["group policy", "gpo", "gpos", "group policy objects"], implies: ["active-directory"], effort: 2 }),
  C({
    id: "account-management",
    label: "User account support",
    kind: "duty", intrinsic: "SUPPORTED",
    aliases: ["password resets", "password reset", "account unlocks", "account lockouts", "user provisioning", "account provisioning", "user accounts", "user account management", "access requests", "reset passwords", "reset user passwords", "unlocked accounts", "unlocked user accounts", "unlock accounts"],
    effort: 2,
  }),
  C({
    id: "windows",
    label: "Windows",
    kind: "platform",
    aliases: ["windows", "windows 10", "windows 11", "windows os", "windows based", "windows pcs", "windows devices", "windows desktops", "windows laptops", "microsoft windows"],
    transfersTo: [
      { to: "windows-admin", strength: 0.2, note: "Using Windows-based devices is relevant background, but it is not Windows administration." },
      { to: "desktop-support", strength: 0.2, note: "Familiarity with Windows devices helps in desktop support." },
    ],
    overstatements: ["Windows administration", "Windows Server", "Group Policy", "Active Directory"],
    effort: 1,
  }),
  C({
    id: "windows-admin",
    label: "Windows administration",
    kind: "duty", intrinsic: "ADMINISTERED",
    aliases: ["windows administration", "windows administrator", "windows admin", "administered windows", "windows systems administration", "windows server administration"],
    implies: ["windows"],
    effort: 4,
    learn: { labs: ["Run Windows Server evaluation in a VM; practice roles/features, updates, event logs and permissions."] },
  }),
  C({ id: "windows-server", label: "Windows Server", kind: "platform", aliases: ["windows server", "windows server 2016", "windows server 2019", "windows server 2022"], implies: ["windows"], effort: 3 }),
  C({ id: "macos", label: "macOS", kind: "platform", aliases: ["macos", "mac os", "os x", "macbook", "macbooks", "apple computers", "imac", "imacs"], effort: 2 }),
  C({ id: "linux", label: "Linux", kind: "platform", aliases: ["linux", "ubuntu", "red hat", "rhel", "centos", "debian", "fedora"], effort: 3, learn: { labs: ["Install Ubuntu Server in a VM and complete a basic users/permissions/services exercise set."] } }),
  C({ id: "linux-admin", label: "Linux administration", kind: "duty", intrinsic: "ADMINISTERED", aliases: ["linux administration", "linux administrator", "linux sysadmin", "linux systems administration"], implies: ["linux"], effort: 4 }),
  C({
    id: "server-admin",
    label: "Server administration",
    kind: "duty", intrinsic: "ADMINISTERED",
    aliases: ["server administration", "server admin", "managed servers", "maintained servers", "server maintenance", "system administration", "systems administration", "sysadmin"],
    implies: ["technical-troubleshooting"],
    effort: 5,
  }),
  C({ id: "virtualization", label: "Virtualization", kind: "skill", aliases: ["virtualization", "virtual machines", "vmware", "vsphere", "hyper-v", "hyperv", "virtualbox", "proxmox"], effort: 2, learn: { labs: ["Install VirtualBox or Hyper-V and run a small multi-VM lab."] } }),
  C({ id: "backups", label: "Backup & recovery", kind: "duty", intrinsic: "PERFORMED", aliases: ["backup", "backups", "backup and recovery", "data recovery", "veeam", "restore", "restores"], effort: 2 }),
  C({
    id: "remote-support",
    label: "Remote support tools",
    kind: "tool",
    aliases: ["remote support", "remote desktop", "rdp", "teamviewer", "anydesk", "bomgar", "beyondtrust", "remote assistance", "screenconnect"],
    effort: 1,
  }),

  // ───────────── Productivity suites ─────────────
  C({
    id: "microsoft-office",
    label: "Microsoft Office",
    kind: "tool",
    aliases: ["microsoft office", "ms office", "office suite", "microsoft word", "ms word", "powerpoint", "microsoft outlook", "outlook"],
    transfersTo: [
      { to: "microsoft-365", strength: 0.5, note: "Office desktop apps are part of Microsoft 365." },
      { to: "m365-admin", strength: 0.15, note: "Using Office is not administering Microsoft 365, but familiarity helps when supporting users." },
    ],
    overstatements: ["Microsoft 365 administration", "Office 365 support", "Exchange administration"],
    effort: 1,
  }),
  C({ id: "excel", label: "Excel", kind: "tool", aliases: ["excel", "microsoft excel", "ms excel", "spreadsheets", "vlookup", "pivot tables", "pivot table", "xlookup"], implies: ["microsoft-office"], effort: 2 }),
  C({
    id: "microsoft-365",
    label: "Microsoft 365",
    kind: "tool",
    aliases: ["microsoft 365", "office 365", "o365", "m365", "microsoft teams", "sharepoint", "onedrive", "microsoft 365 admin center"],
    implies: ["microsoft-office"],
    transfersTo: [{ to: "m365-admin", strength: 0.25, note: "Daily use of Microsoft 365 is helpful context, but administration is a separate skill." }],
    effort: 1,
  }),
  C({
    id: "exchange",
    label: "Exchange / Exchange Online",
    kind: "platform",
    aliases: ["exchange online", "exchange server", "microsoft exchange", "exchange mailboxes", "exchange mailbox", "mail server", "email server", "mailboxes", "shared mailbox", "shared mailboxes", "distribution lists", "distribution list", "email system"],
    transfersTo: [{ to: "m365-admin", strength: 0.3, note: "Supporting Exchange mailboxes is related to, but not the same as, administering Microsoft 365." }],
    effort: 2,
  }),
  C({
    id: "m365-admin",
    label: "Microsoft 365 administration",
    kind: "duty", intrinsic: "ADMINISTERED",
    aliases: [
      "microsoft 365 administration", "microsoft 365 admin", "m365 administration", "m365 admin", "office 365 administration",
      "office 365 admin", "o365 administration", "o365 admin", "microsoft 365 support", "m365 support", "office 365 support",
      "o365 support", "exchange administration", "exchange admin",
      "mailbox administration", "license assignment",
    ],
    implies: ["microsoft-365"],
    effort: 3,
    learn: {
      labs: ["Create a Microsoft 365 developer or trial tenant; practice user licensing, mailbox permissions and MFA setup."],
      certifications: ["Microsoft MS-900 (fundamentals), then MS-102 if roles require it"],
    },
    questions: ["A user can't receive email in Outlook but webmail works. How do you troubleshoot?"],
  }),
  C({ id: "google-workspace", label: "Google Workspace", kind: "tool", aliases: ["google workspace", "g suite", "gsuite", "google docs", "google sheets", "google drive"], effort: 1 }),
  C({ id: "google-workspace-admin", label: "Google Workspace administration", kind: "duty", intrinsic: "ADMINISTERED", aliases: ["google workspace admin", "google admin console", "g suite admin", "google workspace administration"], implies: ["google-workspace"], effort: 3 }),

  // ───────────── Ticketing, records, inventory ─────────────
  C({
    id: "ticketing",
    label: "Ticketing systems",
    kind: "tool",
    family: "ticketing",
    aliases: ["ticketing", "ticketing system", "ticketing systems", "ticket queue", "tickets", "service tickets", "ticket management", "ticket tracking"],
    effort: 1,
    learn: { labs: ["Request a free ServiceNow Personal Developer Instance and work through the incident-management tutorial."] },
    questions: ["What makes a good ticket note?"],
  }),
  C({ id: "servicenow", label: "ServiceNow", kind: "tool", family: "ticketing", aliases: ["servicenow", "service now"], implies: ["ticketing"], effort: 1 }),
  C({ id: "jira", label: "Jira", kind: "tool", family: "ticketing", aliases: ["jira", "jira service management", "jira service desk"], implies: ["ticketing"], effort: 1 }),
  C({ id: "zendesk", label: "Zendesk", kind: "tool", family: "ticketing", aliases: ["zendesk"], implies: ["ticketing"], effort: 1 }),
  C({ id: "freshservice", label: "Freshservice / Freshdesk", kind: "tool", family: "ticketing", aliases: ["freshservice", "freshdesk"], implies: ["ticketing"], effort: 1 }),
  C({ id: "connectwise", label: "ConnectWise", kind: "tool", family: "ticketing", aliases: ["connectwise", "autotask"], implies: ["ticketing"], effort: 1 }),
  C({
    id: "work-orders",
    label: "Work orders",
    kind: "duty", intrinsic: "PERFORMED",
    aliases: ["work orders", "work order"],
    transfersTo: [{ to: "ticketing", strength: 0.4, note: "Closing work orders is similar to working a ticket queue." }],
    effort: 1,
  }),
  C({
    id: "service-records",
    label: "Service records",
    kind: "duty", intrinsic: "PERFORMED",
    aliases: ["service records", "service history", "repair records", "maintenance records", "documented repairs", "repair documentation", "service documentation", "service reports", "asset records", "repair logs"],
    transfersTo: [
      { to: "documentation", strength: 0.5, note: "Accurate service records show documentation discipline." },
      { to: "ticketing", strength: 0.35, note: "Recording service work is similar to updating tickets." },
      { to: "inventory-management", strength: 0.25, note: "Keeping service records is relevant to inventory work, but it is not inventory ownership." },
    ],
    overstatements: ["inventory management", "asset management", "IT asset management", "inventory control"],
    effort: 1,
  }),
  C({ id: "documentation", label: "Technical documentation", kind: "skill", intrinsic: "PERFORMED", aliases: ["documentation", "technical documentation", "knowledge base", "kb articles", "knowledge articles", "standard operating procedures", "sops", "runbooks"], effort: 1 }),
  C({
    id: "asset-tracking",
    label: "Asset tracking",
    kind: "duty", intrinsic: "PERFORMED",
    aliases: ["asset tracking", "tracked assets", "asset tags", "asset tagging", "serial numbers", "parts usage", "logged parts"],
    transfersTo: [{ to: "inventory-management", strength: 0.4, note: "Tracking assets and parts is relevant to inventory work, but it is not formal inventory ownership." }],
    overstatements: ["inventory management", "asset lifecycle management", "IT asset management"],
    effort: 1,
  }),
  C({
    id: "inventory-management",
    label: "Inventory management",
    kind: "duty", intrinsic: "ADMINISTERED",
    aliases: [
      "inventory management", "managed inventory", "managing inventory", "inventory control", "inventory ownership",
      "stock management", "managed stock", "it asset management", "itam", "asset management", "asset lifecycle",
      "asset lifecycle management", "hardware asset management", "inventory reconciliation", "cycle counts", "cycle counting",
    ],
    effort: 2,
    learn: { practice: ["Learn the asset lifecycle (procure → deploy → maintain → retire) and practice with a free tool such as Snipe-IT in a lab."] },
  }),

  // ───────────── Cabling & networking ─────────────
  C({
    id: "low-voltage-cabling",
    label: "Low-voltage / data cabling",
    kind: "duty", intrinsic: "INSTALLED",
    aliases: [
      "low voltage cabling", "low voltage", "data cabling", "network cabling", "structured cabling", "ethernet cabling",
      "cat5e", "cat 5e", "cat6", "cat 6", "cat6a", "cable termination", "terminated cables", "terminating cables",
      "terminated cable", "patch panels", "patch panel", "cable runs", "pulled cable", "pulling cable", "rj45", "keystone jacks",
    ],
    transfersTo: [
      { to: "voice-cabling", strength: 0.45, note: "Low-voltage termination skills transfer to voice cabling, but voice work itself is not verified." },
      { to: "networking-fundamentals", strength: 0.2, note: "Physical-layer work is related to networking fundamentals." },
    ],
    overstatements: ["voice cabling", "telecom cabling", "network engineering"],
    effort: 2,
    learn: { certifications: ["BICSI Installer 1 (if roles ask for it)"] },
  }),
  C({
    id: "voice-cabling",
    label: "Voice cabling",
    kind: "duty", intrinsic: "INSTALLED",
    aliases: ["voice cabling", "telephone cabling", "phone cabling", "voice lines", "telephone lines", "phone lines", "66 block", "66 blocks", "telecom cabling", "voice and data"],
    effort: 2,
    learn: { practice: ["Practice 66/110-block punch-downs on a training board; learn voice pair color codes."] },
  }),
  C({
    id: "network-connectivity",
    label: "Network connectivity troubleshooting",
    kind: "duty", intrinsic: "TROUBLESHOT",
    aliases: ["network connectivity", "connectivity issues", "connectivity problems", "connectivity troubleshooting", "network troubleshooting", "connectivity", "internet service", "hardware connectivity"],
    implies: ["technical-troubleshooting"],
    transfersTo: [
      { to: "networking-fundamentals", strength: 0.35, note: "Troubleshooting connectivity builds practical networking basics." },
      { to: "help-desk-support", strength: 0.25, note: "Connectivity issues are a large share of help desk tickets." },
    ],
    overstatements: ["network engineering", "network administration"],
    effort: 2,
  }),
  C({
    id: "networking-fundamentals",
    label: "Networking fundamentals",
    kind: "skill",
    aliases: ["networking", "networking fundamentals", "network fundamentals", "basic networking", "tcp/ip", "tcp ip", "ip addressing", "subnetting", "dns", "dhcp", "osi model", "vlans", "vlan", "lan", "wan"],
    transfersTo: [{ to: "network-engineering", strength: 0.2, note: "Fundamentals are necessary for, but far short of, network engineering." }],
    overstatements: ["network engineering", "network administration", "routing and switching"],
    effort: 3,
    learn: { certifications: ["CompTIA Network+"], labs: ["Build a small network in Cisco Packet Tracer (free) with DHCP, DNS and two VLANs."] },
    questions: ["Explain the difference between DNS and DHCP.", "A PC has a 169.254.x.x address. What does that tell you?"],
  }),
  C({
    id: "network-engineering",
    label: "Network engineering",
    kind: "duty", intrinsic: "ADMINISTERED",
    aliases: [
      "network engineering", "network design", "network architecture", "routing and switching", "routing & switching",
      "bgp", "ospf", "eigrp", "mpls", "configured routers", "configured switches", "router configuration", "switch configuration",
      "cisco ios", "network administration", "enterprise network", "enterprise networks", "sd-wan", "sdwan",
      "network infrastructure", "network security",
    ],
    implies: ["networking-fundamentals", "network-connectivity"],
    effort: 5,
    learn: { certifications: ["Cisco CCNA"], labs: ["Complete CCNA-level labs in Packet Tracer or GNS3 (static routing, OSPF, VLAN trunking)."] },
  }),
  C({ id: "firewalls", label: "Firewalls", kind: "tool", aliases: ["firewall", "firewalls", "palo alto", "fortinet", "fortigate", "sonicwall", "cisco asa", "security appliance", "security appliances", "edge gateway", "edge gateways", "utm", "perimeter security"], effort: 3 }),
  C({ id: "cisco", label: "Cisco equipment", kind: "tool", aliases: ["cisco", "cisco switches", "cisco routers", "meraki"], effort: 3 }),
  C({
    id: "voip",
    label: "VoIP phone systems",
    kind: "tool",
    aliases: ["voip", "ip phones", "voip phones", "phone systems", "phone system", "pbx", "unified communications", "sip trunks"],
    effort: 2,
  }),

  // ───────────── Customer & channels ─────────────
  C({
    id: "customer-communication",
    label: "Customer communication",
    kind: "soft",
    aliases: [
      "customer communication", "communicated with customers", "communicating with customers", "explained repairs",
      "customer-facing", "customer facing", "customer interactions", "customer interaction", "communicated with store",
      "explained issues", "updated customers",
    ],
    transfersTo: [
      { to: "phone-support", strength: 0.35, note: "Explaining technical issues to customers is relevant to phone support, but phone support itself is not verified." },
      { to: "chat-support", strength: 0.3, note: "Customer communication skills are relevant to chat support, but chat support itself is not verified." },
      { to: "email-support", strength: 0.3, note: "Customer communication skills are relevant to email support, but email support itself is not verified." },
      { to: "customer-service", strength: 0.5, note: "Direct customer communication is a core customer-service skill." },
    ],
    overstatements: ["phone support", "chat support", "email support", "call center"],
    effort: 2,
  }),
  C({
    id: "customer-service",
    label: "Customer service",
    kind: "soft",
    aliases: ["customer service", "customer support", "served customers", "assisting customers", "assisted customers", "customer satisfaction", "customer experience", "guest service", "guest services"],
    implies: ["customer-communication"],
    transfersTo: [
      { to: "help-desk-support", strength: 0.25, note: "Customer-service skills help in help desk roles, but technical support itself needs its own evidence." },
      { to: "phone-support", strength: 0.25, note: "Service skills transfer to phone support; phone work itself is not verified." },
    ],
    effort: 2,
  }),
  C({
    id: "phone-support",
    label: "Phone support",
    kind: "channel", intrinsic: "SUPPORTED",
    aliases: ["phone support", "telephone support", "over the phone", "by phone", "via phone", "phone calls", "inbound calls", "outbound calls", "answered calls", "call center", "call centre", "contact center", "phone-based support"],
    implies: ["customer-communication"],
    effort: 2,
    learn: { practice: ["Volunteer phone-based help (e.g., a nonprofit or campus help line) to build verifiable phone-support experience."] },
  }),
  C({ id: "chat-support", label: "Chat support", kind: "channel", intrinsic: "SUPPORTED", aliases: ["chat support", "live chat", "via chat", "chat channels", "web chat", "chat-based support"], implies: ["customer-communication"], effort: 1 }),
  C({ id: "email-support", label: "Email support", kind: "channel", intrinsic: "SUPPORTED", aliases: ["email support", "e-mail support", "via email", "by email", "email tickets", "email inquiries", "responded to emails"], implies: ["customer-communication"], effort: 1 }),

  // ───────────── Scripting, cloud, security ─────────────
  C({ id: "powershell", label: "PowerShell", kind: "tool", family: "scripting", aliases: ["powershell", "power shell"], effort: 3, learn: { labs: ["Write PowerShell scripts in a lab to bulk-create test users or collect system inventory."] } }),
  C({ id: "bash", label: "Bash scripting", kind: "tool", family: "scripting", aliases: ["bash", "shell scripting", "shell scripts"], effort: 3 }),
  C({ id: "python", label: "Python", kind: "tool", family: "scripting", aliases: ["python"], effort: 3 }),
  C({ id: "sql", label: "SQL", kind: "tool", aliases: ["sql", "mysql", "postgresql", "postgres", "sql server", "sql queries"], effort: 3 }),
  C({ id: "aws", label: "AWS", kind: "platform", family: "cloud", aliases: ["aws", "amazon web services", "ec2", "s3"], effort: 4, learn: { certifications: ["AWS Certified Cloud Practitioner"] } }),
  C({ id: "azure", label: "Microsoft Azure", kind: "platform", family: "cloud", aliases: ["azure", "microsoft azure"], effort: 4, learn: { certifications: ["Microsoft AZ-900"] } }),
  C({ id: "security-awareness", label: "Security awareness", kind: "skill", aliases: ["security awareness", "phishing", "mfa", "multi-factor authentication", "multifactor authentication", "2fa", "password policies"], effort: 1 }),
  C({ id: "endpoint-security", label: "Endpoint security", kind: "tool", aliases: ["antivirus", "anti-virus", "edr", "microsoft defender", "crowdstrike", "endpoint protection", "sentinelone"], effort: 2 }),
  C({ id: "siem", label: "SIEM", kind: "tool", aliases: ["siem", "splunk", "microsoft sentinel", "qradar"], effort: 4 }),
  C({
    id: "itil",
    label: "ITIL / service management",
    kind: "methodology",
    aliases: ["itil", "incident management", "change management", "problem management", "service level agreements", "slas", "sla"],
    effort: 2,
    learn: { certifications: ["ITIL 4 Foundation (only if several target roles ask for it)"] },
  }),

  // ───────────── Environments (claims about where work happened) ─────────────
  C({ id: "enterprise-environment", label: "Enterprise environment", kind: "environment", aliases: ["enterprise environment", "enterprise", "fortune 500", "corporate environment", "large-scale environment", "large enterprise"], effort: 5, trainable: false }),
  C({ id: "data-center", label: "Data center", kind: "environment", aliases: ["data center", "datacenter", "data centre", "server room", "rack and stack", "racked servers"], effort: 4 }),
  C({ id: "healthcare-environment", label: "Healthcare environment", kind: "environment", aliases: ["healthcare environment", "hospital", "hospitals", "clinical environment", "clinic", "clinics", "hipaa"], effort: 3 }),
  C({ id: "retail-environment", label: "Retail environment", kind: "environment", aliases: ["retail", "retail stores", "retail locations", "retail environment", "store locations"], effort: 2 }),
  C({ id: "production-environment", label: "Production environment", kind: "environment", aliases: ["production environment", "production systems", "24/7", "24x7", "mission-critical", "mission critical"], effort: 4, trainable: false }),

  // ───────────── General / other fields (for friend testing) ─────────────
  C({ id: "team-leadership", label: "Team leadership", kind: "duty", intrinsic: "ADMINISTERED", aliases: ["team leadership", "led a team", "led team", "supervised", "supervising", "supervisor", "managed a team", "managed team", "team lead", "shift lead", "shift supervisor"], effort: 4, trainable: false }),
  C({ id: "training-others", label: "Training & onboarding", kind: "duty", intrinsic: "PERFORMED", aliases: ["trained new", "training new", "onboarded new", "mentored", "mentoring", "trained staff", "trained employees", "trained coworkers"], effort: 2 }),
  C({ id: "time-management", label: "Time management", kind: "soft", aliases: ["time management", "prioritization", "prioritized", "prioritizing", "deadline driven"], effort: 1 }),
  C({ id: "teamwork", label: "Teamwork", kind: "soft", aliases: ["teamwork", "collaborated", "collaboration", "cross-functional"], effort: 1 }),
  C({ id: "scheduling", label: "Scheduling", kind: "duty", intrinsic: "PERFORMED", aliases: ["scheduling", "scheduled appointments", "appointment scheduling", "calendar management", "dispatching", "shift schedules", "work schedules", "staff schedules", "employee schedules"], effort: 1 }),
  C({ id: "cash-handling", label: "Cash handling", kind: "duty", intrinsic: "PERFORMED", aliases: ["cash handling", "handled cash", "cash drawer", "cash drawers", "balanced drawers", "cash reconciliation"], effort: 1 }),
  C({ id: "sales", label: "Sales", kind: "duty", intrinsic: "PERFORMED", aliases: ["sales experience", "retail sales", "inside sales", "outside sales", "b2b sales", "upselling", "upsold", "sales goals", "sales quota", "quotas"], effort: 2 }),
  C({ id: "data-analysis", label: "Data analysis", kind: "skill", intrinsic: "PERFORMED", aliases: ["data analysis", "analyzed data", "analyzing data", "data analytics", "dashboards", "data reporting"], effort: 3 }),
  C({ id: "power-bi", label: "Power BI", kind: "tool", family: "bi", aliases: ["power bi", "powerbi"], effort: 2 }),
  C({ id: "tableau", label: "Tableau", kind: "tool", family: "bi", aliases: ["tableau"], effort: 2 }),
  C({ id: "project-management", label: "Project management", kind: "duty", intrinsic: "ADMINISTERED", aliases: ["project management", "managed projects", "project manager", "project coordination", "coordinated projects"], effort: 4 }),
  C({ id: "warehouse", label: "Warehouse operations", kind: "duty", intrinsic: "PERFORMED", aliases: ["warehouse operations", "warehouse experience", "warehouse associate", "shipping and receiving", "order picking", "picking and packing", "pick and pack"], effort: 1 }),
  C({ id: "forklift", label: "Forklift operation", kind: "license", aliases: ["forklift", "forklift certified", "forklift certification", "pallet jack"], effort: 1 }),
  C({ id: "ehr", label: "Electronic health records", kind: "tool", aliases: ["ehr", "emr", "electronic health records", "electronic medical records", "epic", "cerner", "athenahealth"], effort: 2 }),
  C({ id: "medical-billing", label: "Medical billing", kind: "duty", intrinsic: "PERFORMED", aliases: ["medical billing", "insurance claims", "medical coding", "icd-10", "cpt codes"], effort: 3 }),
  C({ id: "javascript", label: "JavaScript", kind: "tool", family: "web", aliases: ["javascript", "js", "node.js", "nodejs"], effort: 3 }),
  C({ id: "typescript", label: "TypeScript", kind: "tool", family: "web", aliases: ["typescript"], implies: ["javascript"], effort: 3 }),
  C({ id: "react", label: "React", kind: "tool", family: "web", aliases: ["react", "react.js", "reactjs", "next.js", "nextjs"], implies: ["javascript"], effort: 3 }),
  C({ id: "html-css", label: "HTML & CSS", kind: "tool", family: "web", aliases: ["html", "css", "html5", "css3", "tailwind"], effort: 2 }),
  C({ id: "git", label: "Git", kind: "tool", aliases: ["git", "github", "gitlab", "version control"], effort: 1 }),
  C({ id: "java", label: "Java", kind: "tool", aliases: ["java"], effort: 4 }),
  C({ id: "csharp", label: "C#", kind: "tool", aliases: ["c#", "csharp", ".net", "dotnet"], effort: 4 }),
  C({ id: "rest-apis", label: "REST APIs", kind: "skill", aliases: ["rest api", "rest apis", "restful", "api integration", "apis"], effort: 3 }),
  C({ id: "agile", label: "Agile / Scrum", kind: "methodology", aliases: ["agile", "scrum", "sprint planning", "kanban"], effort: 1 }),

  // ───────────── Certifications ─────────────
  C({ id: "comptia-a-plus", label: "CompTIA A+", kind: "certification", aliases: ["comptia a+", "a+ certification", "a+ certified", "a+"], effort: 4, learn: { certifications: ["CompTIA A+"] } }),
  C({ id: "comptia-network-plus", label: "CompTIA Network+", kind: "certification", aliases: ["comptia network+", "network+", "network plus"], implies: ["networking-fundamentals"], effort: 4, learn: { certifications: ["CompTIA Network+"] } }),
  C({ id: "comptia-security-plus", label: "CompTIA Security+", kind: "certification", aliases: ["comptia security+", "security+", "security plus"], implies: ["security-awareness"], effort: 4, learn: { certifications: ["CompTIA Security+"] } }),
  C({ id: "ccna", label: "Cisco CCNA", kind: "certification", aliases: ["ccna", "cisco certified network associate"], implies: ["networking-fundamentals"], effort: 5, learn: { certifications: ["Cisco CCNA"] } }),
  C({ id: "google-it-cert", label: "Google IT Support Certificate", kind: "certification", aliases: ["google it support certificate", "google it support professional certificate", "google it certificate"], effort: 3 }),
  C({ id: "itil-foundation", label: "ITIL 4 Foundation", kind: "certification", aliases: ["itil foundation", "itil 4 foundation", "itil v4 foundation"], implies: ["itil"], effort: 2 }),
  C({ id: "md-102", label: "Microsoft MD-102", kind: "certification", aliases: ["md-102", "md 102", "endpoint administrator associate", "modern desktop administrator"], effort: 4 }),
  C({ id: "az-900", label: "Microsoft AZ-900", kind: "certification", aliases: ["az-900", "az 900", "azure fundamentals"], effort: 2 }),
  C({ id: "aws-ccp", label: "AWS Cloud Practitioner", kind: "certification", aliases: ["aws certified cloud practitioner", "cloud practitioner"], effort: 3 }),
  C({ id: "osha-10", label: "OSHA 10", kind: "certification", aliases: ["osha 10", "osha-10", "osha 30", "osha-30"], effort: 1 }),
  C({ id: "bicsi", label: "BICSI certification", kind: "certification", aliases: ["bicsi", "bicsi installer", "bicsi technician"], effort: 3 }),

  // ───────────── Licenses & clearances ─────────────
  C({ id: "drivers-license", label: "Driver's license", kind: "license", aliases: ["driver's license", "drivers license", "driver license", "driving record", "valid license"], effort: 2, trainable: false }),
  C({ id: "cdl", label: "Commercial driver's license", kind: "license", aliases: ["cdl", "commercial driver's license", "commercial drivers license"], effort: 4 }),
  C({ id: "security-clearance", label: "Security clearance", kind: "clearance", aliases: ["security clearance", "secret clearance", "top secret", "ts/sci", "ts sci", "public trust", "active clearance", "clearance"], effort: 5, trainable: false }),

  // ───────────── Job titles (licensed only by held positions) ─────────────
  C({ id: "title-help-desk-technician", label: "Help Desk Technician", kind: "title", aliases: ["help desk technician", "helpdesk technician", "help desk analyst", "service desk analyst", "service desk technician", "it technician"], implies: ["help-desk-support"] }),
  C({ id: "title-it-support-specialist", label: "IT Support Specialist", kind: "title", aliases: ["it support specialist", "it specialist", "technical support specialist", "it support technician", "support specialist"], implies: ["help-desk-support"] }),
  C({ id: "title-desktop-support-technician", label: "Desktop Support Technician", kind: "title", aliases: ["desktop support technician", "desktop support specialist", "desktop technician", "desktop support analyst"], implies: ["desktop-support"] }),
  C({ id: "title-field-service-technician", label: "Field Service Technician", kind: "title", aliases: ["field service technician", "field technician", "field service tech", "field tech", "service technician"], implies: ["field-service"] }),
  C({ id: "title-systems-administrator", label: "Systems Administrator", kind: "title", aliases: ["system administrator", "systems administrator", "sys admin"], implies: ["server-admin"] }),
  C({ id: "title-network-engineer", label: "Network Engineer", kind: "title", aliases: ["network engineer", "network administrator"], implies: ["network-engineering"] }),
  C({ id: "title-network-technician", label: "Network Technician", kind: "title", aliases: ["network technician", "cabling technician", "low voltage technician"] }),
  C({ id: "title-it-manager", label: "IT Manager", kind: "title", aliases: ["it manager", "it director", "director of it", "head of it"], implies: ["team-leadership"] }),
];

// ───────────── Index helpers ─────────────

const BY_ID = new Map<string, ConceptDef>(CONCEPTS.map((c) => [c.id, c]));

export function getConcept(id: string): ConceptDef | undefined {
  return BY_ID.get(id);
}

export function conceptLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

export function isCompetencyEligible(c: ConceptDef): boolean {
  if (c.competency !== undefined) return c.competency;
  return ["duty", "skill", "tool", "platform", "methodology", "soft"].includes(c.kind);
}

/** Transitive closure over `implies` (stronger → weaker only). */
export function impliedClosure(ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const next of BY_ID.get(id)?.implies ?? []) stack.push(next);
  }
  return out;
}

/** Transfer edges from `from` to `to`, including same-family tool transfer. */
export function transferBetween(fromId: string, toId: string): TransferDef | undefined {
  const from = BY_ID.get(fromId);
  const to = BY_ID.get(toId);
  if (!from || !to || fromId === toId) return undefined;
  const direct = from.transfersTo?.find((t) => t.to === toId);
  if (direct) return direct;
  if (from.family && from.family === to.family) {
    return {
      to: toId,
      strength: 0.5,
      note: `${from.label} experience transfers to ${to.label} (same tool category), but ${to.label} itself is not verified.`,
    };
  }
  return undefined;
}
