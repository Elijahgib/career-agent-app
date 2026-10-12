import type { ReactNode } from "react";
import { verificationLabel } from "@/lib/labels";

type Tone = "green" | "blue" | "amber" | "red" | "gray" | "purple" | "teal";

const TONES: Record<Tone, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  blue: "border-blue-200 bg-blue-50 text-blue-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  red: "border-red-200 bg-red-50 text-red-800",
  gray: "border-slate-200 bg-slate-50 text-slate-700",
  purple: "border-violet-200 bg-violet-50 text-violet-800",
  teal: "border-teal-200 bg-teal-50 text-teal-800",
};

export function Badge({ tone = "gray", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`chip ${TONES[tone]}`} title={title}>
      {children}
    </span>
  );
}

const TIER_LABEL: Record<string, string> = { STRONG: "Strong match", GOOD: "Good match", STRETCH: "Stretch", SKIP: "Skip" };

/** User-facing fit badge. Shows a word label, never a numeric percentage (scores stay internal). */
export function TierBadge({ tier }: { tier: string; score?: number }) {
  const tone: Tone = tier === "STRONG" ? "green" : tier === "GOOD" ? "blue" : tier === "STRETCH" ? "amber" : "gray";
  return <Badge tone={tone}>{TIER_LABEL[tier] ?? tier}</Badge>;
}

const REQ: Record<string, { tone: Tone; label: string; help: string }> = {
  VERIFIED: { tone: "green", label: "Verified Match", help: "Backed by verified professional evidence." },
  PARTIAL: { tone: "blue", label: "Partial", help: "You have hands-on contact (for example you used it), but the posting asks for more, such as administering it." },
  LEARNING_ONLY: { tone: "purple", label: "Learning Only", help: "Only study, lab or academic evidence — not professional experience." },
  TRANSFERABLE: { tone: "teal", label: "Transferable", help: "Related verified experience. Relevant, but not claimable as this skill." },
  NOT_VERIFIED: { tone: "amber", label: "Not Verified", help: "Matches a fact you have not verified yet." },
  EXPOSURE_ONLY: { tone: "amber", label: "Exposure Only", help: "Your evidence only shows you escalated, observed, assisted with or worked alongside this — not that you did it." },
  HARD_GAP: { tone: "red", label: "Hard Gap", help: "Required by the posting; no evidence." },
  GAP: { tone: "gray", label: "Gap", help: "Preferred or responsibility item with no evidence." },
};

export function ReqStatusBadge({ status }: { status: string }) {
  const s = REQ[status] ?? { tone: "gray" as Tone, label: status, help: "" };
  return (
    <Badge tone={s.tone} title={s.help}>
      {s.label}
    </Badge>
  );
}

export function VerifBadge({ status }: { status: string }) {
  const tone: Tone = status === "VERIFIED" ? "green" : status === "LIKELY" ? "blue" : status === "UNVERIFIED" ? "amber" : "gray";
  return <Badge tone={tone}>{verificationLabel(status)}</Badge>;
}

export function GateBadge({ status }: { status: string }) {
  return status === "PASSED" ? <Badge tone="green">✓ Truth Gate passed</Badge> : <Badge tone="red">⛔ Blocked by Truth Gate</Badge>;
}

export function Card({ title, actions, children, className = "", subtitle }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
          <div>
            {title && <h2 className="text-[15px]">{title}</h2>}
            {subtitle && <p className="muted mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted mt-1 max-w-3xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function ScoreBar({ score, tone = "blue" }: { score: number; tone?: "blue" | "green" | "amber" | "red" }) {
  const color = { blue: "bg-brand", green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500" }[tone];
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.max(2, Math.min(100, score))}%` }} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line bg-slate-50/50 p-6 text-center text-sm text-muted">{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Notice({ tone = "blue", children }: { tone?: "blue" | "amber" | "red" | "green"; children: ReactNode }) {
  const cls = { blue: "border-blue-200 bg-blue-50 text-blue-900", amber: "border-amber-200 bg-amber-50 text-amber-900", red: "border-red-200 bg-red-50 text-red-900", green: "border-emerald-200 bg-emerald-50 text-emerald-900" }[tone];
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

export function fmtDate(d?: Date | string | null): string {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toISOString().slice(0, 10);
}
