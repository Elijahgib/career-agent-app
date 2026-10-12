export type NotificationType = "STRONG_MATCH" | "FOLLOW_UP" | "INTERVIEW_REMINDER" | "STATUS_EMAIL" | "JOB_REACTIVATED";

export interface NotificationDraft {
  type: NotificationType;
  title: string;
  body: string;
  jobId?: string;
  applicationId?: string;
  /** Prevents duplicates: one notification per (profile, dedupeKey). */
  dedupeKey: string;
}
