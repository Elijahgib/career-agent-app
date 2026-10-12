// Regression fixture modeled on a real-world 3-role resume layout (synthetic data only):
// employer / title / dates / location on SEPARATE lines, with un-glyphed duty bullets beneath
// each role. The parser must keep the three roles distinct and attach bullets to the right one.
import { describe, expect, it } from "vitest";
import { parseResumeText } from "@/lib/resume/parse";

const THREE_ROLES = `Alex Carter
St. Louis, MO
alex.carter@example.com | (314) 555-0142

WORK EXPERIENCE
Northwind Retail
Customer Engineer
Nov 2024 to Present
St. Louis, MO
Installed and serviced self-checkout and POS hardware for retail clients
Diagnosed network and peripheral faults on-site
Logged service calls and parts usage

Volt Electric
Com Tech 1
Aug 2023 to Mar 2024
St. Louis, MO
Pulled and terminated low-voltage cabling
Tested and labeled network drops

Brightwave Communications
Field Technician 2
Feb 2022 to Nov 2022
St. Louis, MO
Installed residential internet and TV equipment
Troubleshot signal issues at the demarcation point

EDUCATION
Ranken-style Technical College
Certificate in Welding and Fabrication
2023

SKILLS
Hardware troubleshooting, POS systems, Low-voltage cabling, Networking, Windows, Customer service
`;

describe("multi-role resume (3 jobs, separate-line layout)", () => {
  const r = parseResumeText(THREE_ROLES);

  it("keeps three distinct roles (does not collapse or fragment)", () => {
    expect(r.positions).toHaveLength(3);
    expect(r.positions.map((p) => p.employer)).toEqual(["Northwind Retail", "Volt Electric", "Brightwave Communications"]);
    expect(r.positions.map((p) => p.title)).toEqual(["Customer Engineer", "Com Tech 1", "Field Technician 2"]);
  });

  it("attaches the right bullets to each role (3 + 2 + 2 = 7)", () => {
    expect(r.positions.map((p) => p.bullets.length)).toEqual([3, 2, 2]);
    expect(r.positions.reduce((s, p) => s + p.bullets.length, 0)).toBe(7);
    expect(r.positions[0].bullets[0]).toMatch(/self-checkout and POS hardware/);
    expect(r.positions[2].bullets[1]).toMatch(/demarcation point/);
  });

  it("parses dates (incl. present) and locations per role", () => {
    expect(r.positions.map((p) => p.startDate)).toEqual(["2024-11", "2023-08", "2022-02"]);
    expect(r.positions.map((p) => p.endDate)).toEqual([null, "2024-03", "2022-11"]);
    expect(r.positions.every((p) => p.location === "St. Louis, MO")).toBe(true);
  });

  it("parses one education entry (credential + school + field + year)", () => {
    expect(r.education).toHaveLength(1);
    const e = r.education[0];
    expect(e.credential).toMatch(/Certificate in Welding and Fabrication/);
    expect(e.institution).toBe("Ranken-style Technical College");
    expect(e.field).toBe("Welding and Fabrication");
    expect(e.endDate).toBe("2023-01");
  });

  it("parses skills separately and finds no certifications", () => {
    expect(r.skills).toEqual(["Hardware troubleshooting", "POS systems", "Low-voltage cabling", "Networking", "Windows", "Customer service"]);
    expect(r.certifications).toHaveLength(0);
  });
});

describe("resume layout variants", () => {
  it("dates right-aligned on the same row as the title", () => {
    const r = parseResumeText(`EXPERIENCE
Globex Corp
Help Desk Analyst                         Jan 2021 - Mar 2022
Austin, TX
Resolved tier-1 tickets and reset accounts`);
    expect(r.positions).toHaveLength(1);
    expect(r.positions[0].employer).toBe("Globex Corp");
    expect(r.positions[0].title).toBe("Help Desk Analyst");
    expect(r.positions[0].startDate).toBe("2021-01");
    expect(r.positions[0].endDate).toBe("2022-03");
    expect(r.positions[0].location).toBe("Austin, TX");
    expect(r.positions[0].bullets).toHaveLength(1);
  });

  it("single-line education: credential, school, location, year, GPA", () => {
    const r = parseResumeText(`EDUCATION
B.S. in Information Technology, State University, Austin TX, 2020, GPA 3.8`);
    expect(r.education).toHaveLength(1);
    expect(r.education[0].institution).toBe("State University");
    expect(r.education[0].field).toBe("Information Technology");
    expect(r.education[0].endDate).toBe("2020-01");
    expect(r.education[0].gpa).toBe("3.8");
  });

  it("skill categories with labels are flattened into individual skills", () => {
    const r = parseResumeText(`SKILLS
Networking: TCP/IP, DNS, DHCP
Tools: Jira, Git`);
    expect(r.skills).toEqual(expect.arrayContaining(["TCP/IP", "DNS", "DHCP", "Jira", "Git"]));
    expect(r.skills).not.toContain("Networking: TCP/IP");
  });
});
