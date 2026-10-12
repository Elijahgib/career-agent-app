import { redirect } from "next/navigation";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  // First run (no profiles at all) → the guided onboarding; otherwise the dashboard.
  const anyProfile = await db.candidateProfile.findFirst({ select: { id: true } });
  redirect(anyProfile ? "/dashboard" : "/onboarding");
}
