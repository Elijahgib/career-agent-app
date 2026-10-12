// SYNTHETIC demo job postings at fictional companies. Not real openings.

import type { EmploymentType, JobRecord, RemoteType } from "@/lib/domain/types";

export interface DemoJob {
  key: string;
  title: string;
  company: string;
  location: string;
  remoteType: RemoteType;
  employmentType: EmploymentType;
  salaryMin?: number;
  salaryMax?: number;
  salaryPeriod?: "YEAR" | "HOUR";
  postedDaysAgo: number;
  reqId: string;
  description: string;
  /** Extra provenance rows to demonstrate dedupe + "found early" notes. */
  alsoSeenOn?: { sourceType: string; sourceName: string; daysAfter: number }[];
  closed?: boolean;
}

export const DEMO_JOBS: DemoJob[] = [
  {
    key: "contoso-desktop",
    title: "Desktop Support Technician",
    company: "Contoso Health (demo)",
    location: "Austin, TX",
    remoteType: "ONSITE",
    employmentType: "FULL_TIME",
    salaryMin: 48000,
    salaryMax: 56000,
    salaryPeriod: "YEAR",
    postedDaysAgo: 2,
    reqId: "CH-2291",
    alsoSeenOn: [{ sourceType: "MANUAL", sourceName: "job-board alert", daysAfter: 3 }],
    description: `About the role
Contoso Health is hiring a Desktop Support Technician for our Austin clinics.

Responsibilities
- Provide desktop support to clinical and office staff
- Troubleshoot hardware, printers and peripherals
- Image and deploy Windows 11 laptops using SCCM
- Reset passwords and manage user accounts in Active Directory
- Document work in ServiceNow tickets

Requirements
- 1+ years of desktop support or help desk experience
- Hardware troubleshooting experience
- Experience with Windows 10/11
- Strong customer service skills
- Valid driver's license required for travel between clinics

Preferred Qualifications
- CompTIA A+ certification
- Experience with Microsoft 365 administration

Compensation
$48,000 - $56,000 per year, full-time, on-site in Austin, TX.`,
  },
  {
    key: "proseware-field",
    title: "Field Service Technician II",
    company: "Proseware POS Solutions (demo)",
    location: "Austin, TX",
    remoteType: "ONSITE",
    employmentType: "FULL_TIME",
    salaryMin: 52000,
    salaryMax: 60000,
    salaryPeriod: "YEAR",
    postedDaysAgo: 1,
    reqId: "PW-118",
    description: `What you'll do
- Travel to customer sites to diagnose and repair POS systems, receipt printers, scanners and payment terminals
- Install replacement hardware and peripherals
- Terminate and test Cat6 data cabling for new POS drops
- Keep accurate service records for every visit
- Explain repairs clearly to store managers

Requirements
- 2+ years of field service or hardware repair experience
- Hands-on hardware troubleshooting
- Valid driver's license and clean driving record required
- Ability to travel up to 40% within Central Texas

Nice to have
- CompTIA A+
- Experience with Windows-based POS workstations

Pay: $52,000 - $60,000 annually. Full-time.`,
  },
  {
    key: "woodgrove-itsupport",
    title: "IT Support Specialist (Tier 1)",
    company: "Woodgrove Bank (demo)",
    location: "Round Rock, TX",
    remoteType: "HYBRID",
    employmentType: "FULL_TIME",
    salaryMin: 45000,
    salaryMax: 52000,
    salaryPeriod: "YEAR",
    postedDaysAgo: 6,
    reqId: "WB-5520",
    description: `Responsibilities
- Answer inbound calls, live chat and email support requests from branch staff
- Provide Microsoft 365 support including Outlook and Teams issues
- Unlock accounts and reset passwords in Active Directory
- Track all work in ServiceNow
- Escalate network issues to the infrastructure team

Requirements
- 1+ years of help desk or customer-facing technical support experience
- Familiarity with Windows 10/11
- Excellent customer service skills

Preferred
- ITIL Foundation
- CompTIA A+

Hybrid schedule: 3 days per week in our Round Rock office. Salary $45,000 - $52,000.`,
  },
  {
    key: "litware-neteng",
    title: "Senior Network Engineer",
    company: "Litware Inc (demo)",
    location: "Austin, TX",
    remoteType: "ONSITE",
    employmentType: "FULL_TIME",
    salaryMin: 105000,
    salaryMax: 130000,
    salaryPeriod: "YEAR",
    postedDaysAgo: 4,
    reqId: "LW-77",
    description: `Responsibilities
- Design and maintain enterprise networks across 12 sites
- Configure Cisco routers and switches, BGP and OSPF
- Manage Palo Alto firewalls

Requirements
- 7+ years of network engineering experience
- CCNA required; CCNP preferred
- Bachelor's degree in Computer Science or related field required

On-site in Austin, TX. $105,000 - $130,000.`,
  },
  {
    key: "adventure-sysadmin",
    title: "Systems Administrator",
    company: "Adventure Works (demo)",
    location: "Remote (US)",
    remoteType: "REMOTE",
    employmentType: "FULL_TIME",
    salaryMin: 72000,
    salaryMax: 88000,
    salaryPeriod: "YEAR",
    postedDaysAgo: 9,
    reqId: "AW-301",
    description: `What you'll do
- Administer Windows Server, Active Directory and Group Policy
- Automate tasks with PowerShell
- Microsoft 365 administration and Intune device management

Requirements
- 3+ years of Windows administration experience
- Bachelor's degree in Information Technology required
- Experience with PowerShell scripting

Remote (US only). $72k - $88k per year.`,
  },
  {
    key: "fabrikam-helpdesk",
    title: "Help Desk Technician",
    company: "Fabrikam Logistics (demo)",
    location: "Columbus, OH",
    remoteType: "ONSITE",
    employmentType: "FULL_TIME",
    salaryMin: 46000,
    salaryMax: 53000,
    salaryPeriod: "YEAR",
    postedDaysAgo: 3,
    reqId: "FL-4410",
    description: `Responsibilities
- Provide phone and walk-in help desk support for warehouse and office staff
- Reset passwords and unlock accounts in Active Directory
- Log and resolve tickets in Jira Service Management
- Set up and image new laptops
- Troubleshoot printers and scanners

Requirements
- Help desk experience (internships count)
- Customer service skills
- Windows 10/11

Preferred
- CompTIA A+ certification
- Associate or bachelor's degree in IT

On-site in Columbus, OH. $46,000 - $53,000 per year.`,
  },
  {
    key: "trey-cleared",
    title: "IT Field Technician",
    company: "Trey Research (demo)",
    location: "Austin, TX",
    remoteType: "ONSITE",
    employmentType: "FULL_TIME",
    salaryMin: 58000,
    salaryMax: 66000,
    salaryPeriod: "YEAR",
    postedDaysAgo: 5,
    reqId: "TR-9001",
    description: `Responsibilities
- Diagnose and repair hardware at secure customer sites
- Install workstations and peripherals

Requirements
- Active Secret clearance required at time of hire
- 1+ years of hardware troubleshooting experience
- Valid driver's license

$58,000 - $66,000. On-site.`,
  },
  {
    key: "fourthcoffee-pos",
    title: "POS Support Technician",
    company: "Fourth Coffee (demo)",
    location: "Austin, TX",
    remoteType: "ONSITE",
    employmentType: "FULL_TIME",
    salaryMin: 22,
    salaryMax: 26,
    salaryPeriod: "HOUR",
    postedDaysAgo: 1,
    reqId: "FC-212",
    description: `What you'll do
- Support POS systems, receipt printers and payment terminals across our Austin cafes
- Work through a queue of work orders and tickets
- Communicate status updates to cafe managers

Requirements
- Experience troubleshooting POS hardware
- Customer communication skills

Preferred
- Phone support experience
- CompTIA A+

$22 - $26 per hour. Full-time, on-site.`,
  },
  {
    key: "relecloud-lowvoltage",
    title: "Low Voltage Technician",
    company: "Relecloud Networks (demo)",
    location: "Pflugerville, TX",
    remoteType: "ONSITE",
    employmentType: "FULL_TIME",
    salaryMin: 23,
    salaryMax: 29,
    salaryPeriod: "HOUR",
    postedDaysAgo: 11,
    reqId: "RN-58",
    description: `Responsibilities
- Install and terminate voice and data cabling (Cat6, 66 blocks, patch panels)
- Test and label cable runs
- Keep job documentation up to date

Requirements
- 1+ years of low voltage cabling experience
- Voice cabling experience required
- Valid driver's license

Preferred
- BICSI Installer certification
- OSHA 10

$23 - $29 per hour, full-time.`,
  },
  {
    key: "alpine-parttime",
    title: "Desktop Support Assistant (Part-Time)",
    company: "Alpine Ski House (demo)",
    location: "Austin, TX",
    remoteType: "ONSITE",
    employmentType: "PART_TIME",
    salaryMin: 20,
    salaryMax: 22,
    salaryPeriod: "HOUR",
    postedDaysAgo: 2,
    reqId: "ASH-14",
    description: `Part-time role, 20 hours per week.

Responsibilities
- Help staff with printers, laptops and peripherals
- Hardware troubleshooting

Requirements
- Customer service experience`,
  },
  {
    key: "coho-refurb",
    title: "IT Asset Refurbishment Technician",
    company: "Coho Recycling (demo)",
    location: "Round Rock, TX",
    remoteType: "ONSITE",
    employmentType: "FULL_TIME",
    salaryMin: 19,
    salaryMax: 22,
    salaryPeriod: "HOUR",
    postedDaysAgo: 8,
    reqId: "CR-77",
    description: `Responsibilities
- Refurbish laptops and desktops for resale
- Replace parts and test hardware
- Process warranty RMAs with vendors
- Maintain inventory management records in our ERP

Requirements
- Hardware repair experience
- Attention to detail

$19 - $22 per hour.`,
  },
  {
    key: "humongous-servicedesk",
    title: "Service Desk Analyst",
    company: "Humongous Insurance (demo)",
    location: "Remote (US)",
    remoteType: "REMOTE",
    employmentType: "FULL_TIME",
    salaryMin: 50000,
    salaryMax: 58000,
    salaryPeriod: "YEAR",
    postedDaysAgo: 2,
    reqId: "HI-3301",
    description: `Responsibilities
- Provide phone and chat support to employees nationwide
- Microsoft 365 support and account administration in Entra ID
- Work tickets in ServiceNow following ITIL practices

Requirements
- 1+ years of service desk experience
- Experience with Active Directory or Entra ID
- Strong written communication for email support

Preferred
- ITIL 4 Foundation

Remote (US). $50,000 - $58,000.`,
  },
  {
    key: "tailspin-ops",
    title: "Operations Coordinator",
    company: "Tailspin Toys (demo)",
    location: "Columbus, OH",
    remoteType: "HYBRID",
    employmentType: "FULL_TIME",
    salaryMin: 47000,
    salaryMax: 55000,
    salaryPeriod: "YEAR",
    postedDaysAgo: 4,
    reqId: "TT-61",
    description: `Responsibilities
- Build weekly staff schedules and coordinate coverage
- Prepare operations reports in Excel
- Train new team members on store procedures
- Resolve customer escalations

Requirements
- 2+ years of retail or operations experience
- Team leadership experience
- Excel skills

Preferred
- Data analysis or SQL experience

Hybrid in Columbus, OH. $47,000 - $55,000.`,
  },
  {
    key: "vanarsdel-support",
    title: "Customer Support Specialist",
    company: "VanArsdel Software (demo)",
    location: "Remote (US)",
    remoteType: "REMOTE",
    employmentType: "FULL_TIME",
    salaryMin: 44000,
    salaryMax: 50000,
    salaryPeriod: "YEAR",
    postedDaysAgo: 13,
    reqId: "VA-902",
    description: `Responsibilities
- Answer customer questions through live chat and email support
- Document solutions in Zendesk

Requirements
- 1+ years of customer service experience
- Clear written communication

Preferred
- Experience with Zendesk

Remote (US). $44,000 - $50,000.`,
  },
  {
    key: "adatum-senior",
    title: "Senior Desktop Engineer",
    company: "A. Datum Corporation (demo)",
    location: "Austin, TX",
    remoteType: "HYBRID",
    employmentType: "FULL_TIME",
    salaryMin: 95000,
    salaryMax: 115000,
    salaryPeriod: "YEAR",
    postedDaysAgo: 7,
    reqId: "AD-404",
    description: `Responsibilities
- Lead a team of desktop technicians
- Own SCCM and Intune endpoint management
- Automate deployments with PowerShell

Requirements
- 7+ years of enterprise desktop administration experience
- Expert SCCM and Intune skills

Hybrid, Austin TX. $95,000 - $115,000.`,
  },
  {
    key: "wideworld-stale",
    title: "Store Technology Technician",
    company: "Wide World Importers (demo)",
    location: "Austin, TX",
    remoteType: "ONSITE",
    employmentType: "FULL_TIME",
    salaryMin: 47000,
    salaryMax: 54000,
    salaryPeriod: "YEAR",
    postedDaysAgo: 41,
    reqId: "WWI-10",
    description: `Responsibilities
- Repair POS systems and printers in our Austin stores
- Set up new store hardware
- Track tickets in a ticketing system

Requirements
- Hardware troubleshooting experience
- Customer communication

$47,000 - $54,000.`,
  },
  {
    key: "margies-lowpay",
    title: "Retail Tech Assistant",
    company: "Margie's Travel (demo)",
    location: "Austin, TX",
    remoteType: "ONSITE",
    employmentType: "FULL_TIME",
    salaryMin: 15,
    salaryMax: 17,
    salaryPeriod: "HOUR",
    postedDaysAgo: 3,
    reqId: "MT-5",
    description: `Responsibilities
- Help store staff with printers and POS terminals
- Hardware troubleshooting

Requirements
- Customer service experience

$15 - $17 per hour.`,
  },
];

/** Convert a demo job to a JobRecord (for tests). Dates are relative to `now`. */
export function demoJobRecord(d: DemoJob, now = new Date(), opts: { verified?: boolean } = {}): JobRecord {
  const DAY = 86_400_000;
  const postedAt = new Date(now.getTime() - d.postedDaysAgo * DAY);
  return {
    id: `demo-job-${d.key}`,
    title: d.title,
    company: d.company,
    location: d.location,
    remoteType: d.remoteType,
    employmentType: d.employmentType,
    salaryMin: d.salaryMin ?? null,
    salaryMax: d.salaryMax ?? null,
    salaryCurrency: "USD",
    salaryPeriod: d.salaryPeriod ?? null,
    description: d.description,
    applyUrl: `https://example.com/careers/${d.key}`,
    reqId: d.reqId,
    status: d.closed ? "CLOSED" : "ACTIVE",
    postedAt,
    firstSeenAt: postedAt,
    lastSeenAt: now,
    lastVerifiedAt: opts.verified ? now : null,
    fieldVerification: opts.verified ? { postingExists: "VERIFIED", location: "VERIFIED", salary: "VERIFIED", employmentType: "VERIFIED", remoteType: "VERIFIED", applyUrl: "VERIFIED" } : {},
    sources: [],
  };
}
