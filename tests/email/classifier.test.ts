import { describe, expect, it } from "vitest";
import { classifyEmail, suggestStatus } from "@/lib/email/classifier";
import { MockEmailConnector } from "@/lib/email/mock";

const msg = (subject: string, body: string) => ({ id: subject, receivedAt: new Date("2026-10-04T10:00:00Z"), from: "talent@examplecorp.example", subject, body });

describe("email classifier", () => {
  it("detects confirmations, interviews, rejections and offers", () => {
    expect(classifyEmail(msg("Thank you for applying", "We have received your application for the IT Support Technician position at Example Corp.")).type).toBe("CONFIRMATION");
    expect(classifyEmail(msg("Next steps", "We would like to schedule a phone screen for the role at Example Corp.")).type).toBe("INTERVIEW");
    expect(classifyEmail(msg("Update", "Unfortunately, we have decided to move forward with other candidates at Example Corp.")).type).toBe("REJECTION");
    expect(classifyEmail(msg("Offer", "We are pleased to offer you the position at Example Corp.")).type).toBe("OFFER");
    expect(classifyEmail(msg("Newsletter", "Ten tips for your resume")).type).toBe("UNKNOWN");
  });

  it("matches the company to a tracked application and always requires confirmation", () => {
    const c = classifyEmail(msg("Interview request", "We would like to schedule an interview for the Help Desk Technician position at Fabrikam Logistics."), ["Fabrikam Logistics (demo)"]);
    const s = suggestStatus(c, [{ id: "app-1", company: "Fabrikam Logistics (demo)", role: "Help Desk Technician", status: "APPLIED" }]);
    expect(s).toMatchObject({ applicationId: "app-1", suggestedStatus: "INTERVIEW", requiresConfirmation: true });
  });

  it("lowers confidence and suggests nothing actionable when the company is unknown", () => {
    const c = classifyEmail(msg("Thanks", "Thank you for your application."));
    expect(c.confidence).toBeLessThan(0.75);
    expect(suggestStatus(c, []).applicationId).toBeNull();
  });
});

describe("mock connector", () => {
  it("produces synthetic job emails for tracked applications", async () => {
    const now = new Date("2026-10-04T12:00:00Z");
    const m = new MockEmailConnector([{ company: "Contoso Health (demo)", role: "Desktop Support Technician", status: "APPLIED" }], now);
    const msgs = await m.listMessages(new Date("2026-09-20"));
    const types = msgs.map((x) => classifyEmail(x, ["Contoso Health (demo)"]).type);
    expect(types).toContain("CONFIRMATION");
    expect(types).toContain("INTERVIEW");
    expect(types).toContain("UNKNOWN"); // the newsletter
  });
});
