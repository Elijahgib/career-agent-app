// Email connector architecture (v0.1: interface + mock only).
// Real Gmail/Outlook connectors would implement EmailConnector with OAuth and
// read-only scopes. The app stores only derived signals (type, company, role,
// confidence) — never full message bodies. Nothing is ever sent.

export interface EmailMessage {
  id: string;
  receivedAt: Date;
  from: string; // address
  subject: string;
  /** Plain-text body; processed in memory and discarded. */
  body: string;
}

export interface EmailConnector {
  readonly provider: "mock" | "gmail" | "outlook";
  readonly label: string;
  /** Read-only. Fetch messages received after `since` that look job-related. */
  listMessages(since: Date): Promise<EmailMessage[]>;
}

export type EmailSignalType = "CONFIRMATION" | "INTERVIEW" | "REJECTION" | "OFFER" | "UNKNOWN";

export interface ClassifiedEmail {
  messageId: string;
  type: EmailSignalType;
  confidence: number; // 0..1
  company: string | null;
  role: string | null;
  fromDomain: string | null;
  subject: string;
  receivedAt: Date;
}

export interface StatusSuggestion {
  messageId: string;
  applicationId: string | null;
  suggestedStatus: "APPLIED" | "SCREEN" | "INTERVIEW" | "REJECTED" | "OFFER" | null;
  /** Always true below the auto-confirm threshold; v0.1 always requires confirmation. */
  requiresConfirmation: true;
  reason: string;
}
