import { cookies } from "next/headers";
import { db } from "./db";

const COOKIE = "cap_profile";

/** The active candidate profile for this browser (local, multi-profile beta testing). */
export async function getActiveProfileId(): Promise<string | null> {
  const store = await cookies();
  const id = store.get(COOKIE)?.value;
  if (id) {
    const exists = await db.candidateProfile.findUnique({ where: { id }, select: { id: true } });
    if (exists) return id;
  }
  const first = await db.candidateProfile.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  return first?.id ?? null;
}

export async function setActiveProfileCookie(id: string) {
  const store = await cookies();
  store.set(COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export async function clearActiveProfileCookie() {
  const store = await cookies();
  store.delete(COOKIE);
}
