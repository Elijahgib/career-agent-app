import type { EmailConnector, EmailMessage } from "./types";

/** Synthetic inbox for demos and tests. Generates job-related emails for the given applications. */
export class MockEmailConnector implements EmailConnector {
  readonly provider = "mock" as const;
  readonly label = "Mock inbox (synthetic messages)";
  constructor(private apps: { company: string; role: string; status: string }[], private now = new Date()) {}

  async listMessages(since: Date): Promise<EmailMessage[]> {
    const out: EmailMessage[] = [];
    const t = (h: number) => new Date(this.now.getTime() - h * 3_600_000);
    this.apps.slice(0, 4).forEach((a, i) => {
      const company = a.company.replace(/\s*\(demo\)\s*$/, "");
      const domain = `${company.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`;
      if (a.status === "SAVED" || a.status === "READY" || a.status === "APPLIED") {
        out.push({ id: `mock-confirm-${i}`, receivedAt: t(30 + i), from: `no-reply@${domain}`, subject: `Thank you for applying to ${company}`, body: `Hi,\n\nThank you for your application for the ${a.role} position at ${company}. We have received your application and will be in touch.\n\n${company} Talent Team` });
      }
      if (a.status === "APPLIED" && i % 2 === 0) {
        out.push({ id: `mock-interview-${i}`, receivedAt: t(5 + i), from: `recruiting@${domain}`, subject: `Interview request — ${a.role}`, body: `Hello,\n\nWe would like to schedule a phone screen for the ${a.role} position at ${company}. Please share your availability for a call this week.\n\nThanks,\nRecruiting at ${company}.` });
      }
      if (a.status === "SCREEN") {
        out.push({ id: `mock-reject-${i}`, receivedAt: t(2), from: `careers@${domain}`, subject: `Your application with ${company}`, body: `Thank you for your interest in the ${a.role} role. Unfortunately, we have decided to move forward with other candidates at this time.\n\n${company}` });
      }
    });
    out.push({ id: "mock-newsletter", receivedAt: t(1), from: "digest@jobs.example", subject: "10 new jobs for you", body: "Here are this week's job alerts." });
    return out.filter((m) => m.receivedAt >= since);
  }
}
