import type { Metadata } from "next";
import Link from "next/link";
import { AutoSubmitSelect } from "@/components/client";
import { db } from "@/server/db";
import { unreadCount } from "@/server/notifications";
import { listProfiles } from "@/server/profiles";
import { getActiveProfileId } from "@/server/session";
import { switchProfile } from "./actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "Career Agent",
  description: "Find strong-fit jobs early, tailor truthfully, and manage the entire search in one place.",
};

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "◧" },
  { href: "/profile", label: "Profile", icon: "◉" },
  { href: "/evidence", label: "Evidence Ledger", icon: "✓" },
  { href: "/jobs", label: "Jobs", icon: "◎" },
  { href: "/tracker", label: "Tracker", icon: "▤" },
  { href: "/documents", label: "Documents", icon: "▢" },
  { href: "/interview", label: "Interview prep", icon: "◌" },
  { href: "/skills", label: "Skill gaps", icon: "△" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [profiles, activeId] = await Promise.all([listProfiles(), getActiveProfileId()]);
  const unread = activeId ? await unreadCount(activeId) : 0;
  const active = profiles.find((p) => p.id === activeId);
  const pendingSignals = activeId ? await db.emailSignal.count({ where: { profileId: activeId, state: "PENDING" } }) : 0;
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-white px-3 py-4 md:flex">
            <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2 text-ink no-underline hover:no-underline">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">CA</span>
              <span className="leading-tight">
                <span className="block text-sm font-semibold">Career Agent</span>
                <span className="block text-[11px] text-muted">truthful job search</span>
              </span>
            </Link>
            <nav className="flex flex-col gap-0.5">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 no-underline hover:bg-slate-100 hover:no-underline">
                  <span className="w-4 text-center text-muted">{n.icon}</span>
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto rounded-lg bg-slate-50 p-2 text-[11px] leading-snug text-muted">
              Local-first MVP. No telemetry. No auto-apply — you submit every application yourself.
            </div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="app-top sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-white/90 px-4 py-2 backdrop-blur md:px-8">
              <nav className="flex flex-wrap gap-2 text-sm md:hidden">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href}>
                    {n.label}
                  </Link>
                ))}
              </nav>
              <div className="ml-auto flex items-center gap-3">
                {profiles.length > 0 ? (
                  <form action={switchProfile} className="flex items-center gap-2">
                    <label htmlFor="profileId" className="text-xs text-muted">
                      Candidate
                    </label>
                    <AutoSubmitSelect key={active?.id ?? "none"} name="profileId" defaultValue={active?.id} className="!w-56 !py-1" options={profiles.map((p) => ({ value: p.id, label: p.displayName }))} />
                    <noscript>
                      <button className="btn btn-sm">Switch</button>
                    </noscript>
                  </form>
                ) : (
                  <Link href="/onboarding" className="btn btn-primary btn-sm">
                    Get started
                  </Link>
                )}
                <Link href="/notifications" className="btn btn-ghost btn-sm" title="Notifications">
                  🔔 {unread > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] text-white">{unread}</span>}
                </Link>
                {pendingSignals > 0 && (
                  <Link href="/tracker#email" className="btn btn-ghost btn-sm" title="Email suggestions awaiting confirmation">
                    ✉ {pendingSignals}
                  </Link>
                )}
              </div>
            </header>
            {active?.isDemo && (
              <div className="flex flex-wrap items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-900">
                <span aria-hidden>🧪</span>
                <span>
                  <strong>Demo mode</strong> — you&apos;re viewing a synthetic sample candidate. Nothing here is real data.
                </span>
                <Link href="/onboarding" className="underline">
                  Create your own profile
                </Link>
              </div>
            )}
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
