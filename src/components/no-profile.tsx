import Link from "next/link";
import { loadDemoAction } from "@/app/actions";
import { Card } from "./ui";

export function NoProfile() {
  return (
    <div className="mx-auto max-w-xl py-10">
      <Card title="Welcome to Career Agent" subtitle="Start with your own profile, or explore with synthetic demo candidates.">
        <div className="space-y-4 text-sm">
          <p>
            Career Agent manages the whole search: profile → evidence → jobs → match → tailor → apply (you) → track → interview prep → skill gaps. Every generated sentence must be backed by
            verified evidence — the <strong>Truth Gate</strong> blocks anything that isn&apos;t.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/onboarding" className="btn btn-primary">
              Get started
            </Link>
            <form action={loadDemoAction}>
              <button className="btn">Load synthetic demo data</button>
            </form>
          </div>
          <p className="muted">The guided setup walks you through identity, work history, skills, preferences, and a truth review. Demo data is entirely fictional (example.com addresses, fictional companies).</p>
        </div>
      </Card>
    </div>
  );
}
