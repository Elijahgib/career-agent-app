import { classifyEmail, suggestStatus } from "@/lib/email/classifier";
import { MockEmailConnector } from "@/lib/email/mock";
import type { EmailConnector } from "@/lib/email/types";
import { db } from "./db";
import { addNotifications } from "./notifications";
import { changeStatus, type AppStatus } from "./tracker";

export function emailConnectorFor(apps: { company: string; role: string; status: string }[]): EmailConnector | null {
  const kind = (process.env.EMAIL_CONNECTOR ?? "mock").toLowerCase();
  if (kind === "mock") return new MockEmailConnector(apps);
  // gmail / outlook: not implemented in v0.1 (see docs/PRIVACY.md and docs/ROADMAP.md)
  return null;
}

/** Scan the (mock) inbox and store derived signals as PENDING suggestions. Never changes status by itself. */
export async function scanInbox(profileId: string) {
  const apps = await db.application.findMany({ where: { profileId }, select: { id: true, company: true, role: true, status: true } });
  const connector = emailConnectorFor(apps);
  if (!connector) return { connector: null, created: 0 };
  const since = new Date(Date.now() - 14 * 86_400_000);
  const messages = await connector.listMessages(since);
  let created = 0;
  for (const m of messages) {
    const c = classifyEmail(m, apps.map((a) => a.company));
    if (c.type === "UNKNOWN") continue;
    const s = suggestStatus(c, apps);
    const exists = await db.emailSignal.findUnique({ where: { profileId_provider_messageId: { profileId, provider: connector.provider, messageId: m.id } } });
    if (exists) continue;
    await db.emailSignal.create({
      data: { profileId, provider: connector.provider, messageId: m.id, receivedAt: m.receivedAt, fromDomain: c.fromDomain, subject: m.subject.slice(0, 200), detectedType: c.type, company: c.company, role: c.role, confidence: c.confidence, applicationId: s.applicationId, suggestedStatus: s.suggestedStatus },
    });
    created++;
    await addNotifications(profileId, [{ type: "STATUS_EMAIL", title: `Email looks like: ${c.type.toLowerCase()}`, body: `${c.company ?? "Unknown company"} — ${s.reason} Review it in the tracker.`, applicationId: s.applicationId ?? undefined, dedupeKey: `email:${connector.provider}:${m.id}` }]);
  }
  return { connector: connector.label, created };
}

export async function resolveSignal(profileId: string, signalId: string, accept: boolean) {
  const sig = await db.emailSignal.findFirst({ where: { id: signalId, profileId } });
  if (!sig || sig.state !== "PENDING") return;
  if (accept && sig.applicationId && sig.suggestedStatus) {
    await changeStatus(profileId, sig.applicationId, sig.suggestedStatus as AppStatus, `Confirmed from email: “${sig.subject ?? ""}”`, "EMAIL_SUGGESTION");
  }
  await db.emailSignal.update({ where: { id: signalId }, data: { state: accept ? "ACCEPTED" : "DISMISSED" } });
}
