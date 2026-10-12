// Adversarial regression suite for relationship semantics.
//
// Every case here was found by an independent red-team pass against the first
// version of the relationship reader. BYPASS cases are overstated claims that
// must be BLOCKED wherever they appear; FALSE BLOCK cases are faithful
// restatements that must never be blocked by the relationship rule.

import { describe, expect, it } from "vitest";
import type { LedgerFact } from "@/lib/domain/types";
import type { ClaimKind, ClaimSection } from "@/lib/truth-gate/types";
import { check, ctxOf, fact } from "./helpers";

type Place = { section: ClaimSection; kind: ClaimKind };
const EXP: Place = { section: "experience", kind: "EXPERIENCE" };
const SKILL: Place = { section: "competencies", kind: "SKILL" };
const SUMMARY: Place = { section: "summary", kind: "SUMMARY" };
const LETTER: Place = { section: "letter", kind: "EXPERIENCE" };
const INTERVIEW: Place = { section: "interview", kind: "EXPERIENCE" };
const PROJECTS: Place = { section: "projects", kind: "LEARNING" };
const EVERYWHERE = [EXP, SKILL, SUMMARY, LETTER, INTERVIEW];

const ESCALATED_AD = "Escalated Active Directory account issues to Tier 2.";
const OBSERVED_IMAGING = "Observed PC imaging.";
const STUDIED_SN = "Studied ServiceNow ticket workflows.";
const ASSISTED_AUTOPILOT = "Assisted the desktop team with deploying 40 laptops using Windows Autopilot.";
const PRINT_SERVER = "Escalated printer server issues.";
const ROUTERS = "Troubleshot routers, modems, and wireless connectivity for customers.";
const PRINTERS = "Diagnosed and repaired receipt printers in the field.";
const NETWORK_TEAM = "Worked alongside the networking team.";
const OUTLOOK = "Used Outlook as an email client.";
const LEARNING: Partial<LedgerFact> = { experienceType: "LEARNING", category: "LEARNING", positionId: null };
const LAB_PROJECT: Partial<LedgerFact> = { experienceType: "LEARNING", category: "PROJECT", positionId: null };

interface Case {
  facts: [string, Partial<LedgerFact>?][];
  claims: string[];
  places?: Place[];
}

const BYPASSES: Record<string, Case[]> = {
  "a weak verb never swallows a coordinated strong verb": [
    {
      facts: [[ESCALATED_AD]],
      claims: [
        "Resolved and escalated Active Directory account issues",
        "Handled and escalated Active Directory account issues",
        "Maintained and escalated Active Directory account issues",
        "Completed and escalated Active Directory account lockouts",
        "Handled, then escalated, Active Directory account issues",
        "Resolved or escalated Active Directory account issues",
        "Resolved/escalated Active Directory account issues",
        "Resolved escalated Active Directory issues",
        "Fixed escalated Active Directory lockouts",
      ],
    },
    { facts: [[OBSERVED_IMAGING]], claims: ["Performed and observed PC imaging", "Conducted and observed PC imaging"] },
    { facts: [["Escalated printer issues to the vendor; repaired POS terminals."]], claims: ["Repaired and escalated printer issues"] },
    { facts: [["Escalated printer issues to the vendor; troubleshot POS terminals."]], claims: ["Troubleshot, documented and escalated printer issues"] },
  ],
  "follow-up verbs after a verbatim restatement are checked": [
    {
      facts: [[ESCALATED_AD]],
      claims: [
        "Escalated Active Directory account issues to Tier 2 and resolved most of them myself",
        "Escalated Active Directory account issues to Tier 2 after resolving most of them myself",
        "I escalated Active Directory account issues to Tier 2, and I also resolved many of them myself.",
        "Escalated Active Directory account issues; handled them too",
        "Escalated Active Directory account issues to Tier 2 and then resolved them",
      ],
    },
    { facts: [[OBSERVED_IMAGING]], claims: ["Observed PC imaging and later performed it independently", "Observed PC imaging, then did the same myself"] },
    { facts: [[STUDIED_SN]], claims: ["Studied ServiceNow ticket workflows and used them daily"] },
    { facts: [[ASSISTED_AUTOPILOT]], claims: ["Assisted the desktop team with deploying 40 laptops using Windows Autopilot and then ran the next rollout solo"] },
    { facts: [["Active Directory account issues escalated to Tier 2."]], claims: ["Resolved Active Directory account issues escalated to Tier 2"] },
    { facts: [["Configured Intune policies in a test lab."]], claims: ["Configured Intune policies in a test lab, then for every staff laptop"] },
  ],
  "coordinated relation nouns are all asserted": [
    {
      facts: [[ESCALATED_AD]],
      claims: [
        "Active Directory escalations and administration",
        "Active Directory account escalations and configuration",
        "Active-Directory escalation & administration",
        "Active Directory escalations/administration",
        "Administration and escalation of Active Directory account issues",
        "Configuration and escalation of Active Directory account issues",
        "Escalated account issues, Active Directory administration",
      ],
    },
    {
      facts: [[PRINT_SERVER]],
      claims: ["Print server escalations and administration", "Print queue escalations and administration", "Print server escalation and repair", "Administration and escalation of printer server issues"],
    },
    { facts: [[ROUTERS]], claims: ["Wireless design and deployment", "Router and modem design and installation"] },
    { facts: [[PRINTERS]], claims: ["Printer fleet design and rollout", "Printer infrastructure planning and rollout"] },
  ],
  "acronyms and unrecognised subjects with strong nouns": [
    {
      facts: [[ESCALATED_AD]],
      claims: ["AD", "AD administration", "AD admin", "AD support", "Maintained AD", "Resolved AD issues", "Directory services administration", "Domain administration", "Identity and access administration"],
    },
    { facts: [[PRINTERS]], claims: ["Print infrastructure administration", "Print infrastructure support"] },
    { facts: [[NETWORK_TEAM]], claims: ["Network infrastructure administration", "Network infrastructure engineering"] },
    { facts: [[ROUTERS]], claims: ["Network security administration"] },
    { facts: [["Completed a course on Microsoft Intune.", LEARNING]], claims: ["Endpoint configuration"], places: [SKILL, SUMMARY, LETTER, INTERVIEW, PROJECTS] },
  ],
  "a weak verb's scope ends at a comma or a new verb": [
    { facts: [[ASSISTED_AUTOPILOT]], claims: ["Assisted the team, deploying 40 laptops using Windows Autopilot", "Assisted desktop staff, configuring Windows Autopilot profiles"] },
    { facts: [["Shadowed senior technicians during server maintenance."]], claims: ["Shadowed senior technicians, performing server maintenance", "Shadowed technicians, independently performing server maintenance"] },
    {
      facts: [[NETWORK_TEAM]],
      claims: [
        "Worked alongside networking staff, configuring VLANs",
        "Worked alongside networking staff, configuring DNS and DHCP",
        "Worked alongside the networking team, building out the LAN",
        "Worked alongside the networking team rebuilding the LAN",
        "Worked alongside the networking team, subnetting the network",
      ],
    },
    { facts: [[ESCALATED_AD]], claims: ["Escalated issues, troubleshooting Active Directory account lockouts first"] },
    { facts: [[OBSERVED_IMAGING]], claims: ["Observed the process, independently reimaging laptops"] },
    { facts: [["Assisted end users with Intune enrollment."]], claims: ["Assisted end users, configuring Intune policies"] },
    { facts: [["Shadowed engineers who configured Intune."]], claims: ["Shadowed engineers, configuring Intune"] },
    { facts: [["Observed technicians repairing printers."]], claims: ["Observed technicians, repairing printers"] },
    { facts: [["Assisted senior technicians with printer repairs."]], claims: ["Assisted, repairing printers"] },
  ],
  "evidence with no hands-on verb never defaults to the concept's strongest relation": [
    { facts: [["Followed senior technicians during server maintenance."]], claims: ["Server administration", "Server maintenance", "Performed server maintenance"] },
    { facts: [["Was present for PC imaging."]], claims: ["Performed PC imaging", "PC imaging"] },
    { facts: [["Notified the vendor of hardware issues."]], claims: ["Hardware troubleshooting", "Troubleshot hardware issues"] },
    { facts: [["Sent Active Directory account issues to Tier 2."]], claims: ["Used Active Directory"] },
    { facts: [["Asked Tier 2 to reset Active Directory passwords."]], claims: ["Reset Active Directory passwords"] },
    { facts: [["Took notes while senior technicians configured Active Directory."]], claims: ["Configured Active Directory", "Active Directory configuration"] },
    { facts: [["Attended a Microsoft Intune training session."]], claims: ["Microsoft Intune", "Used Microsoft Intune"] },
    { facts: [["Attended network engineering meetings."]], claims: ["Network engineering"] },
    { facts: [["Sat near the network engineering team."]], claims: ["Network engineering"] },
    { facts: [["Worked for the network engineering manager."]], claims: ["Network engineering experience"] },
    { facts: [["Took a class on Microsoft 365 administration."]], claims: ["Microsoft 365 administration"] },
    { facts: [["Interviewed for a desktop support role."]], claims: ["Provided desktop support"] },
    { facts: [["Called the help desk to report POS outages."]], claims: ["Provided help desk support", "Help desk support"] },
    { facts: [["Contacted IT support when printers failed."]], claims: ["IT support"] },
    { facts: [["Submitted tickets to the service desk."]], claims: ["Supported users through the service desk"] },
    { facts: [["Attended a workshop on Active Directory administration."]], claims: ["Active Directory administration"] },
    { facts: [["Was introduced to Active Directory administration during onboarding."]], claims: ["Active Directory administration"] },
    { facts: [["Wrote guides on Active Directory administration."]], claims: ["Active Directory administration"] },
    { facts: [["Handled Intune enrollment tickets."]], claims: ["Mobile device management"] },
    { facts: [["Read an article about Intune."]], claims: ["Mobile device management"] },
    { facts: [["Created Active Directory onboarding checklists."]], claims: ["Supported user accounts"] },
  ],
  "third-party, passive and negated actions are not the candidate's": [
    { facts: [["Supported staff who administered Active Directory."]], claims: ["Administered Active Directory"] },
    { facts: [["Worked for a manager who administered Active Directory."]], claims: ["Administered Active Directory"] },
    { facts: [["Answered phones for technicians who repaired printers."]], claims: ["Repaired printers"] },
    { facts: [["Handed laptops to technicians who imaged PCs."]], claims: ["Imaged PCs"] },
    { facts: [["Laptops were imaged by senior technicians."]], claims: ["Imaged laptops"] },
    { facts: [["My laptop was reimaged by IT after a virus."]], claims: ["Reimaged laptops"] },
    { facts: [["Never configured network switches."]], claims: ["Configured network switches"] },
    { facts: [["Not authorized to reset passwords in Active Directory."]], claims: ["Reset passwords in Active Directory"] },
    { facts: [["No experience with Active Directory administration."]], claims: ["Experience with Active Directory"] },
    { facts: [["Was not responsible for Active Directory."]], claims: ["Responsible for Active Directory"] },
    { facts: [["Never managed Active Directory accounts."]], claims: ["Managed Active Directory accounts"] },
    { facts: [["Unable to fix printers; escalated to vendor."]], claims: ["Fixed printers"] },
    { facts: [["Never troubleshot printers."]], claims: ["Printer troubleshooting"] },
  ],
  "explicit relations, tags, allowed wording and implied concepts can never raise a relationship": [
    { facts: [[OBSERVED_IMAGING, { relations: ["ADMINISTERED"], conceptIds: ["autopilot"] }]], claims: ["Imaged computers", "Performed PC imaging", "PC imaging"] },
    { facts: [[ESCALATED_AD, { relations: ["ADMINISTERED"], conceptIds: ["group-policy"] }]], claims: ["Active Directory administration", "Active Directory support"] },
    { facts: [[ESCALATED_AD, { relations: ["ADMINISTERED"], allowedWording: ["Group Policy administration"] }]], claims: ["Active Directory administration"] },
    { facts: [["Escalated store technology issues to the help desk.", { relations: ["ADMINISTERED"] }]], claims: ["Configured and administered store systems for customers."] },
    { facts: [["Escalated Active Directory account issues to Tier 2; reset store POS passwords.", { conceptIds: ["group-policy"] }]], claims: ["Used Active Directory", "Experience with Active Directory"] },
    { facts: [["Escalated Active Directory account issues to Tier 2. Configured receipt printers.", { allowedWording: ["Configured Group Policy"] }]], claims: ["Configured Active Directory", "Active Directory configuration"] },
    { facts: [["Escalated Active Directory account issues to Tier 2. Administered user accounts for 120 staff.", { allowedWording: ["Group Policy administration"] }]], claims: ["Active Directory administration"] },
    { facts: [["Used Outlook as an email client. Administered the store Wi-Fi network.", { allowedWording: ["Outlook administration"] }]], claims: ["Outlook administration"] },
    { facts: [[OBSERVED_IMAGING, { relations: ["ASSISTED"] }]], claims: ["Assisted with PC imaging"] },
    { facts: [[ESCALATED_AD, { relations: ["ASSISTED"] }]], claims: ["Assisted with Active Directory account issues"] },
    { facts: [["Completed a course on Microsoft Intune.", { ...LEARNING, relations: ["LAB_ONLY"] }]], claims: ["Configured Microsoft Intune in a home lab"], places: [PROJECTS, SUMMARY, LETTER] },
    { facts: [["Active Directory account issues for store staff.", { relations: ["ADMINISTERED"] }]], claims: ["Active Directory administration"] },
    { facts: [["Wrote 12 knowledge base articles for common Wi-Fi and printing issues.", { relations: ["TROUBLESHOT"] }]], claims: ["Wi-Fi support", "Supported Wi-Fi users"] },
  ],
  "an unrelated cited fact cannot back a verb aimed at another concept": [
    { facts: [[ESCALATED_AD], ["Administered the store's Windows Server file shares."]], claims: ["Administered and escalated Active Directory account issues", "Configured and escalated Active Directory account issues"] },
    { facts: [["Answered customer questions about store hours."], ["Configured and administered Windows Server virtual machines.", LAB_PROJECT]], claims: ["Configured and administered store systems for customers."], places: [EXP] },
  ],
  "a learning word elsewhere in the sentence does not make it a learning claim": [
    { facts: [[STUDIED_SN]], claims: ["ServiceNow power user; delivered training", "ServiceNow workflow automation and end-user training"] },
    { facts: [["Completed a course on Microsoft Intune.", LEARNING]], claims: ["Intune specialist with formal training", "Microsoft Intune, from coursework to production rollouts"], places: [SKILL, SUMMARY, LETTER] },
    { facts: [["Studied Active Directory during new-hire training."]], claims: ["Active Directory, new-hire training", "Active Directory, end-user training"], places: [SKILL] },
    { facts: [["Studied Active Directory in an online course."]], claims: ["Self-taught Active Directory administrator"] },
  ],
  "lab wording only downgrades lab claims": [
    { facts: [["Practiced Active Directory password resets in a lab environment during onboarding."]], claims: ["Reset Active Directory passwords for store staff after lab practice", "Configured Active Directory beyond the practice lab"] },
    {
      facts: [["Built a home lab with Windows Server and Active Directory.", LAB_PROJECT]],
      claims: ["Configured Active Directory at work and in my home lab", "Configured production Active Directory, not just a home lab", "Configured Active Directory for store staff and in a home lab"],
      places: [SUMMARY, LETTER, INTERVIEW, PROJECTS],
    },
    { facts: [["Configured Intune policies in a test lab during onboarding."]], claims: ["Configured Intune for a dental practice", "Configured Intune for a busy veterinary practice"] },
    { facts: [["Repaired printers in a sandbox environment.", { relations: ["LAB_ONLY"] }]], claims: ["Repaired printers for a medical practice"] },
  ],
  "owning, building and maintaining are stronger than troubleshooting": [
    { facts: [[ROUTERS]], claims: ["Built Wi-Fi networks for customers", "Responsible for wireless networks", "Wireless networks were built and maintained for customers"] },
    { facts: [[PRINTERS]], claims: ["Responsible for printers"] },
    { facts: [["Documented Active Directory password reset steps."]], claims: ["Maintained Active Directory", "Responsible for Active Directory", "Built Active Directory", "Performed Active Directory administrative tasks"] },
    { facts: [["Wrote printer setup guides."]], claims: ["Maintained printers", "Handled printers"] },
    { facts: [["Reported printer issues to the vendor."]], claims: ["Maintained printers", "Experience with printers"] },
  ],
  "unrecognised strong verbs are still read": [
    { facts: [[OUTLOOK]], claims: ["Remediated Outlook issues for staff", "Recreated Outlook profiles for staff", "Upgraded Outlook for staff", "Outlook issues resolved for store staff", "Outlook issues handled for staff"] },
    { facts: [[ROUTERS]], claims: ["Secured wireless networks for customers", "Upgraded router firmware and segmented wireless networks"] },
    { facts: [["Referred hardware failures to the vendor."]], claims: ["Resolved hardware failures", "Handled hardware failures for the vendor"] },
    { facts: [["Used Active Directory to look up employee phone numbers."]], claims: ["Upgraded Active Directory", "Hardened Active Directory", "Administrative duties for Active Directory", "Secured Active Directory", "Migrated users into Active Directory", "Active Directory engineer", "One of three Active Directory administrators", "Owner of Active Directory", "Full ownership over Active Directory"] },
    { facts: [["Supported store staff with printers."]], claims: ["Administration over printers"] },
    { facts: [["Used printers to print receipts."]], claims: ["I repair and configure printers"], places: [LETTER] },
    { facts: [["Used Intune to check device compliance."]], claims: ["I configure Intune for new laptops", "Can configure Intune"], places: [LETTER, SUMMARY] },
    { facts: [["Installed network switches in store back rooms."]], claims: ["Able to install and configure network switches"], places: [SUMMARY] },
    { facts: [["Used Active Directory to look up employee phone numbers."]], claims: ["Active Directory: administration", "Active Directory — administration and configuration", "Administration: Active Directory"] },
    { facts: [["Used Intune to check device compliance."]], claims: ["Configuration: Intune"] },
  ],
  "receiving escalations is not escalating": [
    { facts: [[ESCALATED_AD]], claims: ["Received Tier 2 escalations", "Acted as the Tier 2 escalation contact", "Took over Active Directory escalations", "Received Active Directory escalations from the help desk"] },
    { facts: [[PRINT_SERVER]], claims: ["Received printer server escalations", "Print server escalation contact for stores"] },
  ],
  "role nouns assert the role": [
    { facts: [[ROUTERS]], claims: ["Wireless engineer", "Network infrastructure engineer", "Wi-Fi design"] },
    { facts: [[OUTLOOK]], claims: ["Outlook engineer", "Outlook specialist"] },
    { facts: [["Reported to the IT manager."]], claims: ["IT Manager"], places: [SUMMARY] },
    { facts: [["Worked with our two network engineers."]], claims: ["Network Engineer"], places: [SUMMARY] },
    { facts: [["Escalated outages to the network engineer."]], claims: ["Network Engineer with experience in outages"], places: [SUMMARY] },
    { facts: [["Observed rack and stack work in the data center."]], claims: ["Racked servers in the data center"], places: [EXP] },
    { facts: [["Worked with the Active Directory administrator on account cleanups."]], claims: ["Experience with Active Directory", "Used Active Directory"] },
    { facts: [["Worked with the Intune admin."]], claims: ["Experience with Intune"] },
    { facts: [["Supported the Active Directory administrator with account cleanups."]], claims: ["Supported Active Directory", "Active Directory support"] },
  ],
  "hidden characters cannot hide words": [
    { facts: [[ESCALATED_AD]], claims: ["Active​Directory administration", "active direc­tory administration"] },
    { facts: [["Used printers to print receipts."]], claims: ["Rеpaired printers", "ﬁxed printers"] },
  ],
};

// ── Round 2: found against the redesigned reader ──
const BYPASSES_2: Record<string, Case[]> = {
  "a claim's own verb is never read as someone else's": [
    { facts: [[OBSERVED_IMAGING]], claims: ["While at the store, imaged laptops for new hires", "I was the technician who imaged every new PC", "I'm the tech who reimaged laptops for the store", "Since joining, performed PC imaging for the store", "After onboarding, handled PC imaging for new hires", "When stores opened, reimaged every register computer"] },
    { facts: [[OUTLOOK]], claims: ["Where needed, configured Outlook for staff", "As needed, configured Outlook for staff", "After hours, fixed Outlook for staff", "When required, repaired Outlook profiles for staff", "Because staff struggled, supported Outlook users", "Before store openings, installed Outlook on every register", "I was the one who configured Outlook for staff"] },
    { facts: [[ROUTERS]], claims: ["Where needed, configured customer routers", "As the on-site tech, reconfigured customer routers", "Technician who configured customer routers and wireless networks"] },
    { facts: [[PRINTERS]], claims: ["Technician who configured printers for the whole region", "I was the technician who configured printers for every store"] },
    { facts: [[NETWORK_TEAM]], claims: ["Where needed, configured the store network", "While on site, reconfigured the store network", "Technician who configured the store network"] },
  ],
  "a role noun describing the candidate asserts the role": [
    { facts: [[NETWORK_TEAM]], claims: ["Served as the networking engineer", "Was the networking admin", "Served as the networking administrator for the store", "Worked as the networking engineer", "Our networking administrator", "I'm our networking admin", "In my last role I was the networking engineer"] },
    { facts: [[OUTLOOK]], claims: ["Served as the Outlook administrator for the store", "The Outlook administrator for the store", "Acted as the Outlook admin for the store", "Became our Outlook admin", "Hired as the Outlook administrator", "I've been the Outlook administrator for our store"] },
    { facts: [[ROUTERS]], claims: ["Served as the wireless engineer for customers", "Acted as the router admin", "Became the wireless administrator for the region", "Was the Wi-Fi engineer for customers", "The router and modem engineer for customers"] },
    { facts: [[PRINTERS]], claims: ["Served as the printer administrator for every store", "Was the receipt printer administrator for the region", "Served as the printer engineer for all stores"] },
    { facts: [[ESCALATED_AD]], claims: ["Escalated account issues to Tier 2 as the domain admin", "Escalated account issues as the store's domain admin", "Escalated account issues as the Tier 2 tech", "Escalated store issues to Tier 3 as the Tier 2 technician"] },
    { facts: [[PRINT_SERVER]], claims: ["Escalated printer server issues as the region's printer management contact", "Escalated printer server issues as the print server point of contact"] },
  ],
  "an escalation word never hides the verb that governs the subject": [
    { facts: [[ESCALATED_AD]], claims: ["Staffed the Active Directory support queue, escalating to Tier 2 when needed", "Manned the Active Directory account queue, escalating only the hardest cases", "Covered the Active Directory escalation queue for Tier 1", "Triaged Active Directory escalations", "Escalated from the Active Directory support queue to Tier 2"] },
    { facts: [[PRINT_SERVER]], claims: ["Covered printer server issues, escalating to the vendor only when needed", "Staffed the print queue escalation desk"] },
  ],
  "relation words before requests, queues and policies still count in claims": [
    { facts: [[OUTLOOK]], claims: ["Outlook support requests", "Outlook (support requests)", "Worked the Outlook support queue for store staff", "Took Outlook support requests from staff", "Closed Outlook support requests from staff"] },
    { facts: [[ESCALATED_AD]], claims: ["Escalated Active Directory account issues to Tier 2 and configure policies for the domain", "Escalated Active Directory account issues to Tier 2 and maintain policies for the domain"] },
    { facts: [["Used Intune to check device compliance."]], claims: ["Configuring policies in Intune", "I configure policies in Intune", "Deploying policies through Intune"], places: [EXP, LETTER, INTERVIEW] },
    { facts: [["Used ServiceNow to log tickets."]], claims: ["Designing processes in ServiceNow"], places: [EXP, LETTER, INTERVIEW] },
  ],
  "lab wording only covers the clause it is in": [
    {
      facts: [["Built a home lab with Windows Server and Active Directory.", LAB_PROJECT]],
      claims: ["Configured Active Directory for a client, building on my home lab", "Configured Active Directory at my last job and in my home lab", "Configured Active Directory for colleagues and in my home lab", "Configured Active Directory for my clients and in a home lab", "Configured Active Directory in a home lab and for a dental office", "Configured Active Directory in my home lab and at my workplace", "Configured Active Directory for a dental office; also run a home lab"],
      places: [SUMMARY, LETTER, INTERVIEW, PROJECTS],
    },
    { facts: [["Completed a course on Microsoft Intune.", LEARNING]], claims: ["Completed a course on Microsoft Intune and rolled it out at my job", "Completed a course on Microsoft Intune, then pushed it to every store laptop"], places: [SUMMARY, LETTER, INTERVIEW, PROJECTS] },
    { facts: [["Configured Intune policies in a test lab during onboarding."]], claims: ["Configured Intune policies in a test lab, then pushed them to every store laptop", "Configured Intune policies; validated each one in a test lab first"] },
    { facts: [["Configured Intune policies in a test lab only, never in production."]], claims: ["Configured Intune policies"] },
    { facts: [["Configured Intune policies in a sandbox, not in production."]], claims: ["Configured Intune policies"] },
    { facts: [["Studied ServiceNow ticket workflows.", LEARNING]], claims: ["ServiceNow implementation for a client", "Optimised ServiceNow ticket workflows for a client", "ServiceNow workflow customisation", "ServiceNow developer"], places: [PROJECTS] },
  ],
  "assisting people is support, and helping configure is not using": [
    { facts: [[OUTLOOK]], claims: ["Assisted staff with Outlook issues", "Assisted coworkers with Outlook problems", "Helped configure Outlook for staff"] },
    { facts: [[ROUTERS]], claims: ["Helped configure wireless networks for customers"] },
  ],
  "synonyms, British spellings and noun forms are read": [
    { facts: [[OUTLOOK]], claims: ["Customised Outlook for staff", "Triaged Outlook issues for staff", "Solved Outlook problems for store staff", "Sorted out Outlook sync errors for coworkers", "Recovered deleted Outlook items for staff", "Troubleshooter for Outlook issues", "Outlook issue triage", "Outlook customization", "Outlook customisation for staff", "Outlook remediation", "Outlook optimization", "Outlook integration", "Outlook implementation for the store", "Outlook resolution for staff", "Outlook maintenance for staff"] },
    { facts: [[ESCALATED_AD]], claims: ["Escalated Active Directory account issues to Tier 2 and solved the rest myself", "Escalated Active Directory account issues to Tier 2 after solving the simple ones myself", "Escalated Active Directory account issues to Tier 2 after sorting out most of them myself", "Escalated Active Directory account issues to Tier 2 after investigating them", "Escalated Active Directory account issues to Tier 2 after triaging them"] },
    { facts: [[ROUTERS]], claims: ["Wireless network optimization for customers", "Router customization for customers", "Wireless network operations for customers"] },
  ],
  "more names for the forbidden targets": [
    { facts: [[OUTLOOK]], claims: ["Spun up mailboxes for new hires", "Granted shared mailbox access to staff", "Kept the store mail server running", "Email server upkeep"] },
    { facts: [[PRINTERS]], claims: ["Print spooler troubleshooting", "Print spooler upkeep for all stores", "Ran the print spooler for every store", "Troubleshot printer queues", "Pushed printer drivers to every store computer"] },
    { facts: [[ROUTERS]], claims: ["Perimeter security appliance troubleshooting", "Edge gateway troubleshooting"] },
  ],
  "a verb's object must be what the cited fact is about": [
    { facts: [[NETWORK_TEAM], [ROUTERS]], claims: ["Worked alongside the networking team and maintained the store network"] },
    { facts: [[OUTLOOK], [PRINTERS]], claims: ["Used Outlook as an email client and repaired the mail server", "Troubleshot the store mail server"] },
    { facts: [["Used Active Directory to look up employee phone numbers; configured receipt printers."]], claims: ["Configured each and every one of the old store's Active Directory accounts"] },
    { facts: [["Sold managed switches to customers."]], claims: ["Configured store systems for customers", "Configured and maintained store systems"] },
  ],
  "rejected wording backs nothing": [
    { facts: [[OUTLOOK, { allowedWording: ["Outlook management"] }]], claims: ["I was the one who managed Outlook for staff", "Where needed, managed Outlook for staff"] },
  ],
  "titles and employer names license nothing hands-on": [
    { facts: [["Assistant to the network administrator."]], claims: ["Network Engineer", "Network engineering"], places: [SUMMARY, SKILL] },
    { facts: [["Receptionist for the network engineering department."]], claims: ["Network engineering", "Performed network engineering"] },
    { facts: [["Scheduler for the desktop support team."]], claims: ["Provided desktop support"] },
    { facts: [["Front desk coverage for the PC imaging lab."]], claims: ["PC imaging"] },
  ],
  "writing about it or sending it on is not doing it": [
    { facts: [["Wrote guides on managed servers."]], claims: ["Server administration", "Managed servers"] },
    { facts: [["Answered questions about deployed laptops."]], claims: ["Deployed laptops"] },
    { facts: [["Wrote articles about configured routers."]], claims: ["Configured routers"] },
    { facts: [["Performed Active Directory escalations to Tier 2."]], claims: ["Supported Active Directory users", "Active Directory support"] },
    { facts: [["Prepared Active Directory escalations for Tier 2."]], claims: ["Supported Active Directory users", "Active Directory support"] },
    { facts: [["Completed the Microsoft Intune exam during onboarding."]], claims: ["Experience with Microsoft Intune"] },
    { facts: [["Completed an Intune tutorial."]], claims: ["Experience with Microsoft Intune"] },
    { facts: [["Completed Active Directory e-learning modules."]], claims: ["Used Active Directory"] },
  ],
  "hidden characters in claims and evidence": [
    { facts: [["Used Active Directory to look up employee phone numbers."]], claims: ["Con\u034Ffigured Active Directory", "Confi\uFE0Fgured Active Directory", "Trouble\u034Fshot Active Directory accounts", "Active Directory adminis\u034Ftration"], places: [EXP, SKILL] },
    { facts: [["Shad\u00ADowed senior technicians repairing receipt printers."]], claims: ["Repaired receipt printers"], places: [EXP] },
    { facts: [["Escal\u200Bated Active Directory account issues to Tier 2."]], claims: ["Active Directory support"], places: [SKILL] },
  ],
};

const FALSE_BLOCKS_2: { facts: [string, Partial<LedgerFact>?][]; claims: string[]; places?: Place[] }[] = [
  { facts: [["Resolved customer complaints in person and issued refunds within store policy."]], claims: ["Resolved customer complaints in person", "Resolved customer complaints"] },
  { facts: [["Answered phone and walk-in help desk requests from students and staff."]], claims: ["Provided phone and walk-in support to students and staff", "Provided support to students and staff"] },
  { facts: [["Diagnosed and repaired POS systems, printers, scanners and payment peripherals at retail store locations."]], claims: ["Responsible for repairing POS systems, printers and scanners", "In charge of repairing POS systems and printers at retail stores"] },
  { facts: [["Reset passwords and unlocked accounts in Active Directory for students and staff."]], claims: ["Password resets", "Account unlocks", "Active Directory password resets and account unlocks"] },
  { facts: [[ASSISTED_AUTOPILOT]], claims: ["Assisted with Windows Autopilot deployments", "Assisted the desktop team with a 40-laptop Windows Autopilot deployment"] },
  { facts: [["Used PowerShell to automate user onboarding tasks."]], claims: ["Automated user onboarding tasks with PowerShell"] },
  { facts: [["Used TeamViewer to remotely fix POS workstation issues."]], claims: ["Fixed POS workstation issues remotely with TeamViewer"] },
  { facts: [["Inspected returned barcode scanners and repaired them in the shop."]], claims: ["Repaired barcode scanners", "Barcode scanner repair"] },
  { facts: [["Received failed receipt printers from stores and repaired them."]], claims: ["Repaired failed receipt printers", "Receipt printer repair"] },
  { facts: [["Shadowed senior techs for two weeks, then independently imaged and deployed 40 laptops."]], claims: ["Imaged and deployed 40 laptops", "PC imaging"] },
  { facts: [["Shadowed the field lead for a month and eventually repaired POS terminals solo."]], claims: ["Repaired POS terminals", "POS repair"] },
  { facts: [["Followed the runbook to restore failed backups."]], claims: ["Restored failed backups"] },
  { facts: [["Followed safety procedures while installing Cat6 cabling in store ceilings."]], claims: ["Installed Cat6 cabling in store ceilings"] },
  { facts: [["Followed up with users by phone after resolving their printer issues."]], claims: ["Resolved printer issues", "Printer support"] },
  { facts: [["Led a training session on Microsoft Teams for 40 clinic staff."]], claims: ["Microsoft Teams"] },
  { facts: [["Taught JavaScript at a coding bootcamp."]], claims: ["JavaScript", "Taught JavaScript"] },
  { facts: [["Wrote React components and submitted pull requests on GitHub."]], claims: ["Used GitHub"] },
  { facts: [["Reported weekly KPIs to leadership using Power BI dashboards."]], claims: ["Power BI"] },
  { facts: [["Contributed bug fixes and new features to a React web app."]], claims: ["React"] },
  { facts: [["Worked with store staff to troubleshoot printer issues."]], claims: ["Printer troubleshooting", "Troubleshot store printer issues"] },
  { facts: [["Resolved tickets escalated from the Tier 1 help desk, including printer and VPN issues."]], claims: ["Resolved printer issues", "Printer support"] },
  { facts: [["Closed 90% of tickets on first contact with no escalation, including Outlook and printer issues."]], claims: ["Printer support"] },
  { facts: [["Performed preventive maintenance on copiers and printers at customer sites."]], claims: ["Maintained copiers and printers at customer sites", "Printer maintenance"] },
  { facts: [["Logged parts used, serial numbers and repair notes in service records for each visit."]], claims: ["Maintained service records for each visit"] },
  { facts: [["Imaged 60 laptops for new hires."]], claims: ["OS deployment"] },
  { facts: [["Ran nightly backups and tested restores."]], claims: ["Backup and restore"] },
  { facts: [["Assisted users with password resets in Active Directory."]], claims: ["Supported users with Active Directory password resets", "Helped users with Active Directory password resets"] },
  { facts: [["After onboarding, configured Intune policies for store laptops."]], claims: ["Configured Intune policies"] },
  { facts: [["When printers failed, repaired them on site."]], claims: ["Repaired printers"] },
  { facts: [["As the store technician, repaired receipt printers."]], claims: ["Repaired receipt printers"] },
  { facts: [["Since 2021, troubleshot POS terminals and receipt printers."]], claims: ["Troubleshot POS terminals"] },
  { facts: [["Imaged new laptops with the Microsoft Deployment Toolkit."]], claims: ["Microsoft Deployment Toolkit"] },
];

const FALSE_BLOCKS: { facts: [string, Partial<LedgerFact>?][]; claims: string[]; places?: Place[] }[] = [
  // A weak verb in one part of a fact does not weaken a separate hands-on verb.
  { facts: [["Repaired receipt printers and escalated network outages to the internet service provider."]], claims: ["Repaired receipt printers", "Printer repair", "Receipt printer repair"] },
  { facts: [["Answered help desk calls and escalated unresolved issues to Tier 2."]], claims: ["Help desk support", "Answered help desk calls"] },
  { facts: [["Diagnosed and repaired POS terminals, and referred warranty claims to the manufacturer."]], claims: ["Diagnosed and repaired POS terminals", "POS repair"] },
  { facts: [["Installed 25 receipt printers and shadowed the network team during a switch upgrade."]], claims: ["Installed 25 receipt printers", "Receipt printer installation"] },
  { facts: [["Coordinated with the internet service provider and replaced the failed store router."]], claims: ["Replaced the failed store router", "Router replacement"] },
  { facts: [["Repaired printers and escalated Active Directory lockouts."]], claims: ["Repaired printers"] },
  { facts: [["Reported to the regional IT manager and repaired POS terminals across stores."]], claims: ["Repaired POS terminals"] },
  { facts: [["Assisted customers by repairing their printers."]], claims: ["Repaired customer printers"] },
  { facts: [["Learned the POS system quickly and repaired POS terminals."]], claims: ["Repaired POS terminals"] },
  // Ordinary uses of weak words.
  { facts: [["Set up and imaged laptops for the testing center and exam rooms."]], claims: ["PC imaging", "Imaged laptops for the testing center", "Set up and imaged laptops"] },
  { facts: [["Supported Microsoft Teams and Zoom for online classes."]], claims: ["Microsoft Teams support", "Supported Microsoft Teams for online classes", "Microsoft Teams"] },
  { facts: [["Served as the escalation point for POS and printer issues across 30 stores."]], claims: ["POS systems", "Escalation point for POS and printer issues across 30 stores"] },
  { facts: [["Supported faculty with the learning management system and Microsoft Teams."]], claims: ["Supported faculty with Microsoft Teams", "Microsoft Teams"] },
  { facts: [["Tested Windows updates in a sandbox before rolling them out to 300 PCs."]], claims: ["Windows updates"] },
  { facts: [["Installed and repaired exam room workstations and printers at a clinic."]], claims: ["Repaired printers"] },
  { facts: [["Repaired printers and wrote tutorials for coworkers."]], claims: ["Repaired printers"] },
  // Product names that contain relation words.
  { facts: [["Logged and updated tickets in Jira Service Management."]], claims: ["Jira Service Management", "Used Jira Service Management", "Ticketing: Jira Service Management", "Logged and updated tickets in Jira", "Updated tickets in Jira"] },
  { facts: [["Used Configuration Manager to push software updates to store PCs."]], claims: ["Configuration Manager", "Used Configuration Manager to push software updates"] },
  { facts: [["Imaged new laptops with the Microsoft Deployment Toolkit."]], claims: ["Microsoft Deployment Toolkit", "Imaged laptops using the Microsoft Deployment Toolkit"] },
  { facts: [["Used the Microsoft 365 admin center to reset passwords."]], claims: ["Used the Microsoft 365 admin center to reset user passwords"] },
  // Writing and logging read the same on both sides.
  { facts: [["Reconciled cash drawers and completed end-of-shift sales reports in Excel."]], claims: ["Completed end-of-shift sales reports in Excel", "Completed sales reports in Excel"] },
  { facts: [["Wrote 12 knowledge base articles for common Wi-Fi and printing issues."]], claims: ["Wrote knowledge base articles for common Wi-Fi and printing issues"] },
  { facts: [["Logged parts used, serial numbers and repair notes in service records for each visit."]], claims: ["Service records", "Documented repairs in service records", "Logged repair notes and serial numbers in service records"] },
  { facts: [["Wrote Active Directory administration guides."]], claims: ["Authored Active Directory administration guides", "Wrote guides on Active Directory administration"] },
  // Hands-on evidence backs weaker or different wordings of the same work.
  { facts: [["Set up and reimaged computer lab PCs each semester using FOG Project."]], claims: ["Reimaged computer lab PCs", "Computer lab PC imaging"] },
  { facts: [["Trained 15 new hires on POS and food-safety procedures."]], claims: ["Training new employees"] },
  { facts: [["Supported Windows 10 PCs in the university computer labs."]], claims: ["Windows (university computer labs)"] },
  { facts: [["Capstone project: wrote Python and PowerShell scripts to automate lab user account creation.", { experienceType: "ACADEMIC", category: "PROJECT", conceptIds: ["python", "powershell"], positionId: null }]], claims: ["Python and PowerShell (capstone project)"], places: [PROJECTS] },
  { facts: [["Used TeamViewer to remotely troubleshoot POS workstations."]], claims: ["Remotely troubleshot POS workstations"] },
  { facts: [["Drove to store locations to physically repair POS terminals and receipt printers."]], claims: ["Repaired POS terminals and receipt printers on site", "POS repair", "Printer repair"] },
  { facts: [["Resolved Outlook and printer issues for store staff."]], claims: ["Printer support", "Outlook support", "Supported store staff with Outlook and printer issues"] },
  { facts: [["Handled POS hardware issues at 30 stores."]], claims: ["Supported POS hardware at 30 stores"] },
  { facts: [["Troubleshot store modem and router connectivity issues with the internet service provider."]], claims: ["Coordinated with the internet service provider to resolve store connectivity issues"] },
  { facts: [["Configured VLANs and DHCP on a Cisco switch in a Packet Tracer lab.", LAB_PROJECT]], claims: ["Configured VLANs and DHCP in a Packet Tracer lab", "Packet Tracer lab: configured VLANs and DHCP"], places: [PROJECTS] },
  { facts: [["Built a home lab with Windows Server evaluation to practice Active Directory user and group management.", LAB_PROJECT]], claims: ["Home lab: Active Directory user management", "Home lab: user and group management in Active Directory"], places: [PROJECTS] },
  { facts: [[ASSISTED_AUTOPILOT]], claims: ["Helped deploy 40 laptops using Windows Autopilot", "Assisted with deploying 40 laptops using Windows Autopilot"] },
  { facts: [["Installed and configured replacement POS terminals and receipt printers during store remodels."]], claims: ["Replaced POS terminals and receipt printers during store remodels"] },
  { facts: [["Supported faculty Exchange Online mailboxes and Outlook profiles."]], claims: ["Exchange Online"] },
  { facts: [["Supported Active Directory users at three stores."]], claims: ["Provided Active Directory support"] },
  { facts: [["Configured Intune policies for a dental practice."]], claims: ["Configured Intune policies for the dental practice"] },
  { facts: [["Administered Active Directory for a dental practice."]], claims: ["Administered Active Directory for a small dental practice", "Managed Active Directory for a dental practice"] },
];

function ctxFor(facts: [string, Partial<LedgerFact>?][]) {
  const built = facts.map(([text, extra], i) => fact(`FACT-00${i + 1}`, text, extra ?? {}));
  return { ctx: ctxOf(...built), codes: built.map((f) => f.code) };
}

describe("Red-team bypasses are blocked", () => {
  for (const [group, cases] of Object.entries(BYPASSES)) {
    describe(group, () => {
      for (const c of cases) {
        const { ctx, codes } = ctxFor(c.facts);
        for (const claim of c.claims) {
          it(`blocks “${claim}” (${c.facts.map(([t]) => t).join(" + ")})`, () => {
            for (const p of c.places ?? EVERYWHERE) {
              const r = check(ctx, claim, codes, { section: p.section, kind: p.kind, positionId: p.section === "experience" ? "pos-a" : null });
              expect(r.status, `${claim} as ${p.section}/${p.kind}`).toBe("BLOCKED");
            }
          });
        }
      }
    });
  }
});

describe("Red-team round 2 bypasses are blocked", () => {
  for (const [group, cases] of Object.entries(BYPASSES_2)) {
    describe(group, () => {
      for (const c of cases) {
        const { ctx, codes } = ctxFor(c.facts);
        for (const claim of c.claims) {
          it(`blocks “${claim}” (${c.facts.map(([t]) => t).join(" + ")})`, () => {
            for (const p of c.places ?? EVERYWHERE) {
              const r = check(ctx, claim, codes, { section: p.section, kind: p.kind, positionId: p.section === "experience" ? "pos-a" : null });
              expect(r.status, `${claim} as ${p.section}/${p.kind}`).toBe("BLOCKED");
            }
          });
        }
      }
    });
  }
});

describe("Red-team false blocks stay fixed (no relationship violation)", () => {
  for (const c of [...FALSE_BLOCKS, ...FALSE_BLOCKS_2]) {
    const { ctx, codes } = ctxFor(c.facts);
    for (const claim of c.claims) {
      it(`allows “${claim}” (${c.facts.map(([t]) => t).join(" + ")})`, () => {
        for (const p of c.places ?? [EXP, SKILL]) {
          const r = check(ctx, claim, codes, { section: p.section, kind: p.kind });
          const rel = r.violations.filter((v) => v.rule === "RELATION_EXCEEDS_EVIDENCE");
          expect(rel.map((v) => v.message), `${claim} as ${p.section}/${p.kind}`).toEqual([]);
        }
      });
    }
  }
});
