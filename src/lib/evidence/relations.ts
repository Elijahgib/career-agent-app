// RELATIONSHIP SEMANTICS
//
// Keyword presence is not evidence. "Escalated Active Directory account issues
// to Tier 2" mentions Active Directory but shows only an ESCALATED_TO
// relationship to it — it must never authorize "Active Directory support".
//
// This module gives every (fact, concept) pair a set of relations derived from
// FACT + RELATIONSHIP + CONTEXT + ALLOWED WORDING, and gives every concept
// mention in a generated claim the relation(s) the claim asserts. The Truth
// Gate then requires: for each asserted relation, some cited fact holds an
// evidence relation that SATISFIES it. A weaker relationship never authorizes
// a stronger claim.
//
// Reading strategy (the same verb means the same thing on both sides):
//   evidence → conservative: weak cues govern their clause; third-party, passive and
//              negated verbs show exposure only; an ungoverned mention shows use at most
//   claims   → strict: every relation word is asserted; words with no concept of their
//              own ("resolved them", "Active Directory: administration") attach to the
//              concepts they refer back to, the rest are checked against the cited facts

import { RELATIONS, type LedgerFact, type Relation } from "@/lib/domain/types";
import { getConcept, impliedClosure, type ConceptKind } from "@/lib/ontology/concepts";
import { detectConcepts, normalizeText, spanContains, type ConceptMention, type Span } from "@/lib/ontology/detect";

export { RELATIONS };
export type { Relation };

/**
 * Relation tokens before they are resolved against a concept:
 *   ACT   — "performed / handled / provided": the concept's own activity (tools: used)
 *   BUILD — "built / created / implemented": the concept's activity, else INSTALLED
 *   REC   — "logged / documented / wrote": PERFORMED for record-keeping concepts, else USED
 *   ISSUE — "resolved <X> issues": SUPPORTED (troubleshot, for troubleshooting concepts)
 *   MAINT — "maintained / maintenance": PERFORMED for record-keeping concepts, else SUPPORTED
 */
export type RelToken = Relation | "ACT" | "BUILD" | "REC" | "ISSUE" | "MAINT";

// ───────────────────────── Lattice ─────────────────────────

/** Saying you did less, or merely saw it, is never an overstatement of hands-on evidence. */
const HANDS_ON_FLOOR: Relation[] = ["USED", "ASSISTED", "WORKED_ALONGSIDE", "OBSERVED", "STUDIED"];
/** Using a tool is not helping with the work done on it ("helped configure Outlook"). */
const USE_FLOOR: Relation[] = ["USED", "WORKED_ALONGSIDE", "OBSERVED", "STUDIED"];

/** Evidence relation → the claimed relations it can authorize (reflexive). */
export const SATISFIES: Record<Relation, readonly Relation[]> = {
  ADMINISTERED: ["ADMINISTERED", "CONFIGURED", "SUPPORTED", "TROUBLESHOT", "PERFORMED", ...HANDS_ON_FLOOR],
  CONFIGURED: ["CONFIGURED", "PERFORMED", ...HANDS_ON_FLOOR],
  INSTALLED: ["INSTALLED", "PERFORMED", ...HANDS_ON_FLOOR],
  REPAIRED: ["REPAIRED", "TROUBLESHOT", "SUPPORTED", "PERFORMED", ...HANDS_ON_FLOOR],
  TROUBLESHOT: ["TROUBLESHOT", "SUPPORTED", "PERFORMED", ...HANDS_ON_FLOOR],
  SUPPORTED: ["SUPPORTED", ...HANDS_ON_FLOOR],
  PERFORMED: ["PERFORMED", ...HANDS_ON_FLOOR],
  USED: USE_FLOOR,
  ASSISTED: ["ASSISTED", "WORKED_ALONGSIDE", "OBSERVED"],
  WORKED_ALONGSIDE: ["WORKED_ALONGSIDE"],
  OBSERVED: ["OBSERVED"],
  ESCALATED_TO: ["ESCALATED_TO"],
  STUDIED: ["STUDIED"],
  LAB_ONLY: ["LAB_ONLY", "STUDIED"],
  MENTIONED_ONLY: ["MENTIONED_ONLY"],
};

export function satisfies(evidence: Relation, claim: Relation): boolean {
  return SATISFIES[evidence].includes(claim);
}

/** Relations that show hands-on professional experience with the subject. */
export const EXPERIENCE_RELATIONS: ReadonlySet<Relation> = new Set<Relation>(["ADMINISTERED", "CONFIGURED", "INSTALLED", "REPAIRED", "TROUBLESHOT", "SUPPORTED", "PERFORMED", "USED"]);
/** Study / lab relations — learning, never professional experience. */
export const LEARNING_RELATIONS: ReadonlySet<Relation> = new Set<Relation>(["STUDIED", "LAB_ONLY"]);
/** Exposure without doing: these authorize nothing stronger than themselves. */
export const EXPOSURE_RELATIONS: ReadonlySet<Relation> = new Set<Relation>(["ASSISTED", "WORKED_ALONGSIDE", "OBSERVED", "ESCALATED_TO", "MENTIONED_ONLY"]);
/** Relations that, when they govern a clause of evidence, override stronger readings. */
const WEAK: ReadonlySet<RelToken> = new Set<RelToken>([...EXPOSURE_RELATIONS, ...LEARNING_RELATIONS]);
const isWeak = (t: RelToken) => WEAK.has(t);

export const RELATION_INFO: Record<Relation, { label: string; strength: number; description: string }> = {
  ADMINISTERED: { label: "administered", strength: 9, description: "Owned / managed / administered the system or activity" },
  CONFIGURED: { label: "configured", strength: 8, description: "Configured or provisioned it" },
  INSTALLED: { label: "installed", strength: 7, description: "Installed, deployed or set it up" },
  REPAIRED: { label: "repaired", strength: 7, description: "Repaired or fixed it (implies troubleshooting it)" },
  TROUBLESHOT: { label: "troubleshot", strength: 6, description: "Diagnosed and troubleshot it" },
  SUPPORTED: { label: "supported", strength: 5, description: "Supported it or its users" },
  PERFORMED: { label: "performed", strength: 4, description: "Did the activity" },
  USED: { label: "used", strength: 3, description: "Used it hands-on" },
  ASSISTED: { label: "assisted", strength: 2, description: "Assisted someone else who did it" },
  WORKED_ALONGSIDE: { label: "worked alongside", strength: 1, description: "Worked near the people who did it" },
  OBSERVED: { label: "observed", strength: 1, description: "Watched it being done" },
  ESCALATED_TO: { label: "escalated", strength: 1, description: "Escalated or reported it to someone else" },
  STUDIED: { label: "studied", strength: 1, description: "Studied it (course, reading, exam prep)" },
  LAB_ONLY: { label: "lab only", strength: 1, description: "Practised it in a lab, not on the job" },
  MENTIONED_ONLY: { label: "mentioned only", strength: 0, description: "Only mentioned; no relationship shown" },
};

/**
 * What a reader sees: compatibility forms folded (ligatures, full-width letters), invisible and
 * combining characters removed, so hidden characters can't split or disguise words.
 */
export function sanitizeText(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").replace(/\p{Default_Ignorable_Code_Point}/gu, "").normalize("NFC");
}

export function isRelation(x: unknown): x is Relation {
  return typeof x === "string" && (RELATIONS as readonly string[]).includes(x);
}

/** Concepts whose activity *is* keeping records — logging them is doing them. */
const RECORD_CONCEPTS = new Set(["service-records", "documentation", "asset-tracking", "work-orders", "ticketing", "customer-communication", "scheduling", "warranty-admin", "medical-billing"]);

/** Resolve a token for a concept ("performed desktop support" = SUPPORTED). */
export function resolveToken(t: RelToken, conceptId: string): Relation {
  const c = getConcept(conceptId);
  switch (t) {
    case "ACT":
      return c?.intrinsic ?? (c && (c.kind === "tool" || c.kind === "platform") ? "USED" : "PERFORMED");
    case "BUILD":
      return c?.intrinsic ?? "INSTALLED";
    case "REC":
      return RECORD_CONCEPTS.has(conceptId) ? "PERFORMED" : "USED";
    case "ISSUE":
      return c?.intrinsic === "TROUBLESHOT" ? "TROUBLESHOT" : "SUPPORTED";
    case "MAINT":
      return RECORD_CONCEPTS.has(conceptId) ? "PERFORMED" : "SUPPORTED";
    default:
      return t;
  }
}

/** Resolve a token with no particular concept (fact ceilings, verbs with their own object). */
function resolveGeneric(t: RelToken): Relation {
  return t === "ACT" ? "PERFORMED" : t === "BUILD" ? "INSTALLED" : t === "REC" ? "USED" : t === "ISSUE" || t === "MAINT" ? "SUPPORTED" : t;
}

// ───────────────────────── Cue lexicon ─────────────────────────

/**
 * past   — past-tense verb; binds forward
 * verb   — other finite verb forms; binds forward
 * both   — gerunds and -s forms that can be verb or noun ("troubleshooting printers",
 *          "printer troubleshooting")
 * noun   — binds backward ("Active Directory administration"); forward only with a
 *          following preposition ("support for printers")
 * base   — bare form: a verb after "to", a pronoun, a modal, "and" or at clause start,
 *          otherwise a noun
 * phrase — multi-word verbal phrase; binds forward
 */
type CueForm = "past" | "verb" | "both" | "noun" | "base" | "phrase";
type LexToken = RelToken | "NONE";

const C: [string, LexToken, CueForm][] = [
  // ── ADMINISTERED (ownership, design, management) ──
  ["administered", "ADMINISTERED", "past"], ["administrated", "ADMINISTERED", "past"], ["managed", "ADMINISTERED", "past"], ["owned", "ADMINISTERED", "past"],
  ["oversaw", "ADMINISTERED", "past"], ["governed", "ADMINISTERED", "past"], ["architected", "ADMINISTERED", "past"], ["engineered", "ADMINISTERED", "past"],
  ["designed", "ADMINISTERED", "past"], ["directed", "ADMINISTERED", "past"], ["planned", "ADMINISTERED", "past"], ["led", "ADMINISTERED", "past"], ["headed", "ADMINISTERED", "past"],
  ["took charge of", "ADMINISTERED", "phrase"], ["operations", "ADMINISTERED", "noun"], ["stewardship", "ADMINISTERED", "noun"],
  ["responsible for", "ADMINISTERED", "phrase"], ["in charge of", "ADMINISTERED", "phrase"], ["took over", "ADMINISTERED", "phrase"], ["took ownership of", "ADMINISTERED", "phrase"],
  ["accountable for", "ADMINISTERED", "phrase"], ["owner of", "ADMINISTERED", "phrase"],
  ["administering", "ADMINISTERED", "both"], ["managing", "ADMINISTERED", "both"], ["designing", "ADMINISTERED", "both"], ["planning", "ADMINISTERED", "both"],
  ["overseeing", "ADMINISTERED", "verb"], ["administers", "ADMINISTERED", "verb"], ["manages", "ADMINISTERED", "verb"], ["oversees", "ADMINISTERED", "verb"], ["owns", "ADMINISTERED", "verb"],
  ["leads", "ADMINISTERED", "verb"], ["designs", "ADMINISTERED", "verb"],
  ["administer", "ADMINISTERED", "base"], ["manage", "ADMINISTERED", "base"], ["oversee", "ADMINISTERED", "base"], ["architect", "ADMINISTERED", "base"], ["design", "ADMINISTERED", "base"], ["lead", "ADMINISTERED", "base"],
  ["administration", "ADMINISTERED", "noun"], ["administrator", "ADMINISTERED", "noun"], ["administrators", "ADMINISTERED", "noun"], ["admin", "ADMINISTERED", "noun"], ["admins", "ADMINISTERED", "noun"],
  ["administrative", "ADMINISTERED", "noun"], ["management", "ADMINISTERED", "noun"], ["ownership", "ADMINISTERED", "noun"], ["owner", "ADMINISTERED", "noun"], ["engineering", "ADMINISTERED", "noun"],
  ["engineer", "ADMINISTERED", "noun"], ["engineers", "ADMINISTERED", "noun"], ["architecture", "ADMINISTERED", "noun"], ["governance", "ADMINISTERED", "noun"],
  // ── CONFIGURED ──
  ["configured", "CONFIGURED", "past"], ["reconfigured", "CONFIGURED", "past"], ["customized", "CONFIGURED", "past"], ["programmed", "CONFIGURED", "past"], ["provisioned", "CONFIGURED", "past"],
  ["scripted", "CONFIGURED", "past"], ["automated", "CONFIGURED", "past"], ["hardened", "CONFIGURED", "past"], ["secured", "CONFIGURED", "past"], ["segmented", "CONFIGURED", "past"],
  ["migrated", "CONFIGURED", "past"], ["enrolled", "CONFIGURED", "past"], ["integrated", "CONFIGURED", "past"], ["optimized", "CONFIGURED", "past"], ["tuned", "CONFIGURED", "past"], ["recreated", "CONFIGURED", "past"],
  ["configuring", "CONFIGURED", "both"], ["provisioning", "CONFIGURED", "both"], ["customizing", "CONFIGURED", "both"], ["hardening", "CONFIGURED", "both"], ["securing", "CONFIGURED", "both"], ["migrating", "CONFIGURED", "both"],
  ["configures", "CONFIGURED", "verb"],
  ["configure", "CONFIGURED", "base"], ["customize", "CONFIGURED", "base"], ["provision", "CONFIGURED", "base"], ["automate", "CONFIGURED", "base"], ["harden", "CONFIGURED", "base"], ["migrate", "CONFIGURED", "base"],
  ["tailored", "CONFIGURED", "past"], ["wiped", "CONFIGURED", "past"], ["locked down", "CONFIGURED", "past"],
  ["customization", "CONFIGURED", "noun"], ["optimization", "CONFIGURED", "noun"], ["integration", "CONFIGURED", "noun"], ["enablement", "CONFIGURED", "noun"],
  ["configuration", "CONFIGURED", "noun"], ["configurations", "CONFIGURED", "noun"], ["migration", "CONFIGURED", "noun"], ["migrations", "CONFIGURED", "noun"], ["enrollment", "CONFIGURED", "noun"],
  // ── INSTALLED ──
  ["installed", "INSTALLED", "past"], ["reinstalled", "INSTALLED", "past"], ["deployed", "INSTALLED", "past"], ["rolled out", "INSTALLED", "past"], ["set up", "INSTALLED", "past"], ["mounted", "INSTALLED", "past"],
  ["racked", "INSTALLED", "past"], ["wired", "INSTALLED", "past"], ["terminated", "INSTALLED", "past"], ["upgraded", "INSTALLED", "past"], ["patched", "INSTALLED", "past"], ["stood up", "INSTALLED", "past"],
  ["flashed", "INSTALLED", "past"], ["cloned", "INSTALLED", "past"], ["reloaded", "INSTALLED", "past"], ["staged", "INSTALLED", "past"], ["redeployed", "INSTALLED", "past"],
  ["spun up", "INSTALLED", "past"], ["pushed", "INSTALLED", "past"], ["applied", "INSTALLED", "past"], ["rolled it out", "INSTALLED", "past"], ["rolled them out", "INSTALLED", "past"],
  ["pushed it out", "INSTALLED", "past"], ["implementation", "INSTALLED", "noun"],
  ["installing", "INSTALLED", "both"], ["rolling out", "INSTALLED", "both"], ["deploying", "INSTALLED", "both"], ["upgrading", "INSTALLED", "both"], ["patching", "INSTALLED", "both"],
  ["setting up", "INSTALLED", "verb"], ["installs", "INSTALLED", "verb"], ["deploys", "INSTALLED", "verb"],
  ["install", "INSTALLED", "base"], ["deploy", "INSTALLED", "base"], ["upgrade", "INSTALLED", "base"], ["patch", "INSTALLED", "base"],
  ["installation", "INSTALLED", "noun"], ["installations", "INSTALLED", "noun"], ["deployment", "INSTALLED", "noun"], ["deployments", "INSTALLED", "noun"],
  ["rollout", "INSTALLED", "noun"], ["rollouts", "INSTALLED", "noun"], ["setup", "INSTALLED", "noun"], ["upgrades", "INSTALLED", "noun"],
  // ── REPAIRED ──
  ["repaired", "REPAIRED", "past"], ["fixed", "REPAIRED", "past"], ["serviced", "REPAIRED", "past"], ["restored", "REPAIRED", "past"], ["rebuilt", "REPAIRED", "past"], ["remediated", "REPAIRED", "past"],
  ["repairing", "REPAIRED", "both"], ["rebuilding", "REPAIRED", "both"], ["remediating", "REPAIRED", "both"], ["fixing", "REPAIRED", "both"], ["servicing", "REPAIRED", "both"], ["restoring", "REPAIRED", "both"], ["repairs", "REPAIRED", "both"], ["fixes", "REPAIRED", "both"],
  ["repair", "REPAIRED", "base"], ["fix", "REPAIRED", "base"], ["restore", "REPAIRED", "base"],
  ["recovered", "REPAIRED", "past"], ["remediation", "REPAIRED", "noun"],
  // ── TROUBLESHOT ──
  ["troubleshot", "TROUBLESHOT", "past"], ["troubleshooted", "TROUBLESHOT", "past"], ["diagnosed", "TROUBLESHOT", "past"], ["debugged", "TROUBLESHOT", "past"],
  ["troubleshooting", "TROUBLESHOT", "both"], ["diagnosing", "TROUBLESHOT", "both"], ["debugging", "TROUBLESHOT", "both"], ["diagnoses", "TROUBLESHOT", "both"], ["troubleshoots", "TROUBLESHOT", "verb"],
  ["troubleshoot", "TROUBLESHOT", "base"], ["diagnose", "TROUBLESHOT", "base"], ["debug", "TROUBLESHOT", "base"],
  ["diagnosis", "TROUBLESHOT", "noun"], ["diagnostics", "TROUBLESHOT", "noun"], ["troubleshooter", "TROUBLESHOT", "noun"],
  ["investigated", "TROUBLESHOT", "past"], ["investigating", "TROUBLESHOT", "both"],
  // ── SUPPORTED ──
  ["supported", "SUPPORTED", "past"], ["helped", "SUPPORTED", "past"], ["maintained", "MAINT", "past"],
  ["supporting", "SUPPORTED", "both"], ["helping", "SUPPORTED", "both"], ["supports", "SUPPORTED", "both"], ["maintaining", "MAINT", "both"],
  ["helps", "SUPPORTED", "verb"], ["maintains", "MAINT", "verb"],
  ["support", "SUPPORTED", "base"], ["help", "SUPPORTED", "base"], ["maintain", "MAINT", "base"],
  ["maintenance", "MAINT", "noun"], ["upkeep", "MAINT", "noun"],
  ["triaged", "SUPPORTED", "past"], ["triaging", "SUPPORTED", "both"], ["triage", "SUPPORTED", "base"], ["staffed", "SUPPORTED", "past"], ["manned", "SUPPORTED", "past"],
  ["covered", "SUPPORTED", "past"], ["walked users through", "SUPPORTED", "phrase"], ["walked customers through", "SUPPORTED", "phrase"], ["walked staff through", "SUPPORTED", "phrase"],
  ["point person", "SUPPORTED", "noun"],
  ["specialist", "SUPPORTED", "noun"], ["expert", "SUPPORTED", "noun"], ["sme", "SUPPORTED", "noun"],
  ["escalation point", "SUPPORTED", "noun"], ["escalation contact", "SUPPORTED", "noun"], ["point of escalation", "SUPPORTED", "noun"],
  // ── USED ──
  ["used", "USED", "past"], ["utilized", "USED", "past"], ["operated", "USED", "past"], ["leveraged", "USED", "past"],
  ["using", "USED", "both"], ["utilizing", "USED", "both"], ["operating", "USED", "both"], ["uses", "USED", "verb"],
  ["use", "USED", "base"], ["operate", "USED", "base"],
  ["worked with", "USED", "phrase"], ["working with", "USED", "phrase"], ["experience with", "USED", "phrase"], ["experience in", "USED", "phrase"], ["experienced with", "USED", "phrase"],
  ["experienced in", "USED", "phrase"], ["familiar with", "USED", "phrase"], ["familiarity with", "USED", "phrase"], ["proficient in", "USED", "phrase"], ["proficient with", "USED", "phrase"],
  ["proficiency in", "USED", "phrase"], ["proficiency with", "USED", "phrase"], ["skilled in", "USED", "phrase"], ["skilled with", "USED", "phrase"], ["knowledge of", "USED", "phrase"],
  ["hands on experience", "USED", "phrase"], ["hands on", "USED", "phrase"], ["expertise in", "USED", "phrase"], ["expertise with", "USED", "phrase"], ["comfortable with", "USED", "phrase"],
  ["experience", "USED", "noun"], ["usage", "USED", "noun"], ["expertise", "USED", "noun"], ["skills", "USED", "noun"], ["proficiency", "USED", "noun"],
  // ── ACT — generic "did the activity" ──
  ["performed", "ACT", "past"], ["completed", "ACT", "past"], ["handled", "ACT", "past"], ["provided", "ACT", "past"], ["delivered", "ACT", "past"], ["conducted", "ACT", "past"],
  ["executed", "ACT", "past"], ["carried out", "ACT", "past"], ["ran", "ACT", "past"], ["answered", "ACT", "past"], ["responded", "ACT", "past"], ["fielded", "ACT", "past"],
  ["resolved", "ACT", "past"], ["processed", "ACT", "past"], ["reset", "ACT", "past"], ["unlocked", "ACT", "past"], ["reconciled", "ACT", "past"], ["did", "ACT", "past"],
  ["tested", "ACT", "past"], ["scheduled", "ACT", "past"], ["prepared", "ACT", "past"], ["trained", "ACT", "past"], ["onboarded", "ACT", "past"], ["assigned", "ACT", "past"],
  ["issued", "ACT", "past"], ["inspected", "ACT", "past"], ["monitored", "ACT", "past"], ["received", "ACT", "past"], ["replaced", "ACT", "past"], ["worked", "ACT", "past"],
  ["solved", "ACT", "past"], ["solving", "ACT", "both"], ["solve", "ACT", "base"], ["sorted out", "ACT", "past"], ["sorting out", "ACT", "both"], ["closed", "ACT", "past"], ["worked through", "ACT", "phrase"], ["taught", "ACT", "past"],
  ["teaching", "ACT", "both"], ["teach", "ACT", "base"], ["coached", "ACT", "past"], ["contributed", "ACT", "past"], ["pulled", "ACT", "past"], ["balanced", "ACT", "past"],
  ["balancing", "ACT", "both"], ["resolution", "ISSUE", "noun"],
  ["worked on", "ACT", "phrase"], ["acted as", "ACT", "phrase"], ["served as", "ACT", "phrase"],
  ["performing", "ACT", "both"], ["handling", "ACT", "both"], ["providing", "ACT", "both"], ["completing", "ACT", "both"], ["resolving", "ACT", "both"], ["replacing", "ACT", "both"],
  ["testing", "ACT", "both"], ["monitoring", "ACT", "both"],
  ["perform", "ACT", "base"], ["handle", "ACT", "base"], ["provide", "ACT", "base"], ["complete", "ACT", "base"], ["resolve", "ACT", "base"], ["replace", "ACT", "base"], ["do", "ACT", "base"],
  ["replacement", "ACT", "noun"], ["replacements", "ACT", "noun"],
  // ── BUILD ──
  ["built", "BUILD", "past"], ["created", "BUILD", "past"], ["developed", "BUILD", "past"], ["implemented", "BUILD", "past"], ["established", "BUILD", "past"],
  ["building", "BUILD", "both"], ["creating", "BUILD", "both"], ["developing", "BUILD", "both"], ["implementing", "BUILD", "both"],
  ["build", "BUILD", "base"], ["create", "BUILD", "base"], ["develop", "BUILD", "base"], ["implement", "BUILD", "base"], ["developer", "BUILD", "noun"],
  // ── REC — recording / communicating ──
  ["wrote", "REC", "past"], ["documented", "REC", "past"], ["logged", "REC", "past"], ["recorded", "REC", "past"], ["tracked", "REC", "past"], ["updated", "REC", "past"],
  ["communicated", "REC", "past"], ["explained", "REC", "past"], ["described", "REC", "past"], ["entered", "REC", "past"], ["filed", "REC", "past"], ["authored", "REC", "past"],
  ["reviewed", "REC", "past"], ["labeled", "REC", "past"], ["labelled", "REC", "past"],
  ["writing", "REC", "both"], ["documenting", "REC", "both"], ["logging", "REC", "both"], ["tracking", "REC", "both"], ["communicating", "REC", "both"], ["explaining", "REC", "both"], ["updating", "REC", "both"],
  // ── ASSISTED ──
  ["assisted", "ASSISTED", "past"], ["participated", "ASSISTED", "past"], ["assisting", "ASSISTED", "both"], ["assists", "ASSISTED", "verb"],
  ["assist", "ASSISTED", "base"], ["helped with", "ASSISTED", "phrase"], ["assisted with", "ASSISTED", "phrase"], ["helped to", "ASSISTED", "phrase"], ["under supervision", "ASSISTED", "phrase"],
  ["under the supervision of", "ASSISTED", "phrase"], ["supervised by", "ASSISTED", "phrase"],
  // ── WORKED_ALONGSIDE (plus TEAM_PATTERN below) ──
  ["alongside", "WORKED_ALONGSIDE", "phrase"], ["collaborated with", "WORKED_ALONGSIDE", "phrase"], ["partnered with", "WORKED_ALONGSIDE", "phrase"],
  ["coordinated with", "WORKED_ALONGSIDE", "phrase"], ["liaised with", "WORKED_ALONGSIDE", "phrase"], ["in partnership with", "WORKED_ALONGSIDE", "phrase"],
  ["worked closely with", "WORKED_ALONGSIDE", "phrase"],
  // ── OBSERVED ──
  ["observed", "OBSERVED", "past"], ["shadowed", "OBSERVED", "past"], ["watched", "OBSERVED", "past"], ["witnessed", "OBSERVED", "past"], ["followed", "OBSERVED", "past"], ["toured", "OBSERVED", "past"],
  ["observing", "OBSERVED", "both"], ["shadowing", "OBSERVED", "both"], ["observe", "OBSERVED", "base"], ["shadow", "OBSERVED", "base"],
  ["sat in on", "OBSERVED", "phrase"], ["exposure to", "OBSERVED", "phrase"], ["exposed to", "OBSERVED", "phrase"], ["took notes", "OBSERVED", "phrase"], ["was present", "OBSERVED", "phrase"],
  ["were present", "OBSERVED", "phrase"], ["observation", "OBSERVED", "noun"],
  // ── ESCALATED_TO (escalating or reporting it to someone else) ──
  ["escalated", "ESCALATED_TO", "past"], ["escalating", "ESCALATED_TO", "both"], ["escalates", "ESCALATED_TO", "verb"], ["escalate", "ESCALATED_TO", "base"],
  ["escalation", "ESCALATED_TO", "noun"], ["escalations", "ESCALATED_TO", "noun"], ["referred", "ESCALATED_TO", "past"], ["handed off", "ESCALATED_TO", "past"],
  ["routed", "ESCALATED_TO", "past"], ["forwarded", "ESCALATED_TO", "past"], ["passed along", "ESCALATED_TO", "past"], ["reported to", "ESCALATED_TO", "phrase"], ["reported", "ESCALATED_TO", "past"],
  ["notified", "ESCALATED_TO", "past"], ["informed", "ESCALATED_TO", "past"], ["contacted", "ESCALATED_TO", "past"], ["called", "ESCALATED_TO", "past"], ["sent", "ESCALATED_TO", "past"],
  ["asked", "ESCALATED_TO", "past"], ["requested", "ESCALATED_TO", "past"], ["submitted", "ESCALATED_TO", "past"], ["transferred", "ESCALATED_TO", "past"],
  ["opened tickets", "ESCALATED_TO", "phrase"], ["opened a ticket", "ESCALATED_TO", "phrase"], ["raised tickets", "ESCALATED_TO", "phrase"], ["raised a ticket", "ESCALATED_TO", "phrase"],
  // ── STUDIED ──
  ["studied", "STUDIED", "past"], ["studying", "STUDIED", "both"], ["studies", "STUDIED", "both"], ["study", "STUDIED", "base"], ["learning", "STUDIED", "both"],
  ["learned", "STUDIED", "past"], ["learnt", "STUDIED", "past"], ["attended", "STUDIED", "past"], ["attending", "STUDIED", "both"], ["coursework", "STUDIED", "noun"], ["courses", "STUDIED", "noun"],
  ["online course", "STUDIED", "phrase"], ["a course", "STUDIED", "phrase"], ["course in", "STUDIED", "phrase"], ["course on", "STUDIED", "phrase"], ["tutorial", "STUDIED", "noun"],
  ["tutorials", "STUDIED", "noun"], ["bootcamp", "STUDIED", "noun"], ["self study", "STUDIED", "phrase"], ["self taught", "STUDIED", "phrase"], ["preparing for", "STUDIED", "phrase"],
  ["pursuing", "STUDIED", "both"], ["read about", "STUDIED", "phrase"], ["reading about", "STUDIED", "phrase"], ["completed training", "STUDIED", "phrase"],
  ["took a course", "STUDIED", "phrase"], ["took a class", "STUDIED", "phrase"], ["took classes", "STUDIED", "phrase"], ["took courses", "STUDIED", "phrase"], ["enrolled in", "STUDIED", "phrase"],
  ["introduced to", "STUDIED", "phrase"], ["workshop", "STUDIED", "noun"], ["workshops", "STUDIED", "noun"], ["webinar", "STUDIED", "noun"], ["webinars", "STUDIED", "noun"],
  ["seminar", "STUDIED", "noun"], ["lecture", "STUDIED", "noun"], ["lectures", "STUDIED", "noun"], ["training session", "STUDIED", "noun"], ["exam", "STUDIED", "noun"],
  ["exams", "STUDIED", "noun"], ["e learning", "STUDIED", "phrase"], ["elearning", "STUDIED", "phrase"], ["modules", "STUDIED", "noun"],
  // ── LAB_ONLY ──
  ["home lab", "LAB_ONLY", "phrase"], ["homelab", "LAB_ONLY", "phrase"], ["personal lab", "LAB_ONLY", "phrase"], ["practice lab", "LAB_ONLY", "phrase"],
  ["lab environment", "LAB_ONLY", "phrase"], ["virtual lab", "LAB_ONLY", "phrase"], ["test lab", "LAB_ONLY", "phrase"], ["in a lab", "LAB_ONLY", "phrase"],
  ["lab exercise", "LAB_ONLY", "phrase"], ["lab exercises", "LAB_ONLY", "phrase"], ["packet tracer", "LAB_ONLY", "phrase"], ["tryhackme", "LAB_ONLY", "phrase"],
  ["hack the box", "LAB_ONLY", "phrase"], ["hackthebox", "LAB_ONLY", "phrase"], ["gns3", "LAB_ONLY", "phrase"], ["sandbox", "LAB_ONLY", "noun"],
  ["practiced", "LAB_ONLY", "past"], ["practicing", "LAB_ONLY", "both"], ["simulated", "LAB_ONLY", "past"], ["simulation", "LAB_ONLY", "noun"],
  // ── NONE — ordinary phrases that contain cue words ──
  ["exam room", "NONE", "phrase"], ["exam rooms", "NONE", "phrase"], ["learning management system", "NONE", "phrase"], ["learning management", "NONE", "phrase"],
  ["learning center", "NONE", "phrase"], ["machine learning", "NONE", "phrase"], ["phishing simulation", "NONE", "phrase"], ["phishing simulations", "NONE", "phrase"],
  ["simulation lab", "NONE", "phrase"], ["dental practice", "NONE", "phrase"], ["medical practice", "NONE", "phrase"], ["veterinary practice", "NONE", "phrase"],
  ["law practice", "NONE", "phrase"], ["best practice", "NONE", "phrase"], ["best practices", "NONE", "phrase"], ["practice management", "NONE", "phrase"],
  ["training room", "NONE", "phrase"], ["world class", "NONE", "phrase"], ["user experience", "NONE", "phrase"], ["customer experience", "NONE", "phrase"],
  ["followed up", "NONE", "phrase"], ["follow up", "NONE", "phrase"],
];

interface CueDef {
  rel: LexToken;
  form: CueForm;
  re: RegExp;
}

const CUES: CueDef[] = C.map(([phrase, rel, form]) => ({
  rel,
  form,
  re: new RegExp(`(?<![a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}(?![a-z0-9])`, "g"),
}));

/** "worked with the network engineering team", "worked for the IT manager", "sat near the network team" */
const TEAM_PATTERN =
  /(?<![a-z0-9])(worked|working|collaborated|collaborating|partnered|partnering|coordinated|coordinating|liaised|liaising|sat|reported)\s+(closely\s+)?(with|alongside|in\s+with|for|near|under)\s+((the|our|a|an|its|their|two|three|several|senior|lead)\s+)*([a-z0-9+#.']+\s+){0,4}(team|teams|department|departments|group|groups|engineer|engineers|vendor|vendors|administrator|administrators|admin|admins|technician|technicians|contractors?|specialists?|analysts?|crew|manager|managers|lead|leads|architect|architects|director|supervisor)(?![a-z0-9])/g;

const DOCUMENTS = new Set(["guide", "guides", "article", "articles", "note", "notes", "report", "reports", "procedure", "procedures", "manual", "manuals", "documents", "documentation", "record", "records", "log", "logs", "instructions", "checklist", "checklists", "template", "templates", "form", "forms", "summary", "summaries", "history", "steps", "slides", "videos", "faq", "faqs", "wiki", "sop", "sops", "runbook", "runbooks", "playbook", "playbooks", "protocol", "protocols", "rma", "rmas", "claims", "invoice", "invoices"]);
/** Evidence: a verb whose object is one of these is about the record or the people, not the subject after it. */
const ARTIFACTS = new Set([...DOCUMENTS, "request", "requests", "ticket", "tickets", "question", "questions", "status", "team", "teams", "staff"]);
/** A relation word directly before one of these is a modifier ("repair notes", "support role"), not an action. */
const MODIFIED_NOUNS = new Set([...DOCUMENTS, "ticket", "tickets", "request", "requests", "status", "queue", "queues", "team", "teams", "tool", "tools", "kit", "kits", "bench", "station", "stations", "cart", "carts", "process", "processes", "policy", "policies", "role", "roles", "position", "positions", "job", "jobs", "contract", "contracts", "agreement", "agreements", "budget", "budgets"]);
const ISSUE_NOUNS = new Set(["issue", "issues", "problem", "problems", "error", "errors", "failure", "failures", "outage", "outages", "incident", "incidents", "lockout", "lockouts", "fault", "faults", "ticket", "tickets", "request", "requests", "complaint", "complaints", "question", "questions"]);
const PREPOSITIONS = new Set(["of", "for", "with", "in", "on", "over", "to", "across", "within", "around"]);
const STOP_BETWEEN = new Set(["to", "for", "with", "at", "in", "on", "of", "from", "by", "and", "or", "as", "via", "into", "across", "per", "during", "while", "over"]);
const JOINER = /^[\s,&/()]*((and|or|then|and then|plus)[\s,()]*)?$/;
const LINKERS = new Set(["with", "in", "on", "to", "for", "the", "a", "an", "of", "our", "their", "my", "its", "this"]);
const VERB_LEAD = new Set(["to", "i", "we", "you", "they", "can", "could", "will", "would", "should", "may", "might", "must", "also", "and", "or", "then", "not", "never", "able", "help", "helped", "currently", "daily", "routinely", "regularly", "independently", "personally", "often", "frequently"]);
const SUBJ_REL = new Set(["who", "that", "which", "whom", "whose"]);
const SUBORD = new Set(["while", "when", "as", "after", "before", "because", "until", "whereas", "where", "once", "since"]);
const SELF = new Set(["i", "we", "me", "myself", "ourselves"]);
const BE = new Set(["was", "were", "been", "being", "is", "are", "be", "got", "get"]);
const NEGATORS = new Set(["not", "never", "no", "without", "unable", "cannot", "nor", "neither"]);
const PRONOUNS = new Set(["it", "them", "this", "these", "those", "same", "both", "they", "itself", "themselves"]);
const TAIL_WORDS = new Set([...PREPOSITIONS, "at", "by", "daily", "independently", "myself", "solo", "too", "again", "onsite", "remotely", "regularly", "personally", "alone", "later", "first", "well"]);
const DETERMINERS = new Set(["the", "our", "a", "an", "their", "its", "his", "her", "my", "your", "each"]);
const TOPIC_PREPS = new Set(["on", "about", "for", "covering", "regarding", "of"]);
const ROLE_NOUNS = new Set(["administrator", "administrators", "admin", "admins", "engineer", "engineers", "owner", "specialist", "expert", "sme", "architect", "developer", "troubleshooter"]);
/** Verbs whose object is a person ("supported the AD administrator"): the role noun then names someone else. */
const PERSON_VERBS = new Set<RelToken>(["SUPPORTED", "ASSISTED", "WORKED_ALONGSIDE", "ESCALATED_TO", "OBSERVED", "REC"]);
const IRREGULAR_PAST = /\b(troubleshot|built|ran|rebuilt|set up|oversaw|did|led|sent|took)\b/;
/** Weak nouns that govern a clause even without a verb ("escalations", "coursework"). */
const WEAK_NOUNS = new Set(["escalation", "escalations", "coursework", "courses", "bootcamp", "observation", "workshop", "workshops", "webinar", "webinars", "seminar", "lecture", "lectures", "training session", "exam", "exams", "tutorial", "tutorials", "modules", "e learning", "elearning"]);
/** Verbs that teach or run a learning session: the session is theirs, the topic is something they know. */
const TEACH = new Set(["led", "taught", "teach", "teaching", "delivered", "presented", "ran", "hosted", "gave", "facilitated", "conducted", "created", "wrote", "recorded", "built", "designed", "developed", "authored"]);
/** Learning nouns a teacher can run. */
const SESSION_NOUNS = new Set(["workshop", "workshops", "webinar", "webinars", "seminar", "lecture", "lectures", "training session", "courses", "bootcamp", "tutorial", "tutorials", "modules", "exam", "exams"]);
/** People a candidate helps directly ("assisted users with password resets" is support, not assisting a colleague). */
const PEOPLE = new Set(["user", "users", "customer", "customers", "staff", "employee", "employees", "student", "students", "faculty", "client", "clients", "patient", "patients", "guest", "guests", "member", "members", "people", "coworker", "coworkers", "colleague", "colleagues", "caller", "callers", "shopper", "shoppers", "teacher", "teachers", "nurse", "nurses", "doctor", "doctors", "end"]);
/** Places and units a verb-less fact may name without doing their work ("receptionist for the network engineering department"). */
const ORG_NOUNS = new Set(["department", "departments", "team", "teams", "room", "rooms", "lab", "labs", "office", "offices", "desk", "group", "unit", "division", "center", "centre", "floor", "building", "area", "manager", "director", "lead"]);
/** Things that are documents or procedures when "followed". */
const PROCEDURES = new Set(["runbook", "runbooks", "playbook", "playbooks", "procedure", "procedures", "process", "processes", "steps", "instructions", "checklist", "checklists", "guide", "guides", "protocol", "protocols", "policy", "policies", "sop", "sops", "rules", "standards", "guidelines", "directions", "plan", "plans", "script", "scripts", "documentation"]);
const ADVERBS = new Set(["independently", "personally", "later", "eventually", "then", "also", "solo", "myself", "directly", "successfully", "quickly", "regularly", "routinely", "subsequently", "afterwards", "afterward", "soon"]);
/** Escalation-like verbs that only escalate when they send something "to" someone. */
const TO_DEPENDENT = new Set(["reported", "submitted", "sent", "forwarded"]);
const INSTRUMENT_PREPS = new Set(["with", "using", "via", "through"]);
/** Verbs that receive escalations rather than send them. */
const RECEIVE = new Set(["received", "took", "handled", "triaged", "covered", "worked", "owned", "managed", "resolved", "staffed", "manned", "took over", "solved", "fielded"]);
/** -ed words that are adjectives, not verbs, when deciding whether a clause has a verb. */
const ADJ_ED = new Set(["experienced", "skilled", "certified", "licensed", "based", "related", "advanced", "detailed", "dedicated", "required", "limited", "mixed", "varied", "networked", "distributed", "centralized", "unauthorized", "authorized", "shared", "hybrid", "united", "talented", "motivated", "organized", "oriented", "focused", "need", "speed", "seed", "red", "bed", "damaged", "failed", "returned", "defective", "assorted", "unused", "aged", "outdated", "dated", "connected", "escalated", "affected", "locked", "infected", "compromised", "detected", "requested", "extended", "listed", "named", "titled", "noted", "registered", "verified", "qualified", "interested", "sized", "seated", "paced", "valued", "approved", "inherited", "based", "headquartered", "located", "contracted", "salaried", "unpaid", "paid", "advanced"]);
/** Words that put a lab claim back into production ("at work and in my home lab"). */
const PRODUCTION = /\b(at (?:my |our |the |a )?(?:work|job|last job|previous job|current job|workplace|employer|company|office|clinic|store|school)|on the job|in production|production|company[\s-]wide|professionally|beyond|not just|not only|as well as|also at|for (?:a |an |my |our |the |every |all |each )?(?:[a-z]+ )?(?:staff|users?|customers?|clients?|employees?|students|faculty|stores?|business|company|offices?|locations?|sites?|colleagues|coworkers|employer|organization|organisation|practice|clinic|school|team)|to (?:every|all|each) |across \d+|at \d+|\d+ (?:pcs|laptops|devices|users|computers|workstations|stores|staff|employees|endpoints))\b/i;

/** Production wording that is not negated or deferred ("never in production", "before the production rollout"). */
export function productionScope(text: string): boolean {
  const re = new RegExp(PRODUCTION.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const before = normalizeText(text.slice(Math.max(0, m.index - 24), m.index));
    if (/\b(never|not|no|without|before|only|instead of|rather than)\s+(?:[a-z]+\s+){0,2}$/.test(before)) continue;
    return true;
  }
  return false;
}

// ───────────────────────── Text model ─────────────────────────

interface Token {
  start: number;
  end: number;
  word: string;
}

export interface CueHit {
  start: number;
  end: number;
  rel: RelToken;
  form: Exclude<CueForm, "base">;
  word: string;
  /** Bare form read as a verb (allowed in noun chains: "printer setup and repair"). */
  baseDerived?: boolean;
  /** Done by someone else ("while technicians configured", "laptops were imaged by IT"). */
  thirdParty?: boolean;
  /** A weak verb that took in the activity after it ("assisted with deploying", "helped deploy"). */
  governs?: boolean;
  /** A participle after a noun ("parts used", "issues resolved"): describes that noun, binds nothing forward. */
  postNominal?: boolean;
  /** A relation noun modifying another noun ("support requests"): binds only to the concept right before it. */
  modifier?: boolean;
  /** For an assisting verb, the activity assisted ("helped configure" → CONFIGURED). */
  activity?: RelToken;
}

interface TextCtx {
  norm: string;
  tokens: Token[];
  breaks: number[];
  tokStart: Map<number, number>;
}

function tokenize(norm: string): Token[] {
  const out: Token[] = [];
  const re = /[a-z0-9+#']+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) out.push({ start: m.index, end: m.index + m[0].length, word: m[0] });
  return out;
}

const ABBREV = /(?:^|[^a-z])(e\.g|i\.e|etc|incl|approx|vs|inc|ltd|dept|no|st|jr|sr)\.$/i;

/** Character offsets that start a new clause (sentence end, semicolon, colon, newline, dash, " but "). */
function clauseBreaks(original: string): number[] {
  const out: number[] = [];
  const re = /[.;:!?](?=\s|$)|\n|[—–]|\sbut\s/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(original))) {
    if (m[0] === "." && ABBREV.test(original.slice(Math.max(0, m.index - 6), m.index + 1))) continue;
    out.push(m.index);
  }
  return out;
}

function textCtx(text: string): TextCtx {
  const norm = normalizeText(text);
  const tokens = tokenize(norm);
  return { norm, tokens, breaks: clauseBreaks(text), tokStart: new Map(tokens.map((t, i) => [t.start, i])) };
}

function sameClause(breaks: number[], a: number, b: number): boolean {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return !breaks.some((i) => i >= lo && i < hi);
}

function wordsBetween(tokens: Token[], from: number, to: number): Token[] {
  return tokens.filter((t) => t.start >= from && t.end <= to);
}

/** Index of the first token at or after a position. */
function tokenIndexFrom(ctx: TextCtx, pos: number): number {
  const exact = ctx.tokStart.get(pos);
  if (exact !== undefined) return exact;
  const i = ctx.tokens.findIndex((t) => t.start >= pos);
  return i === -1 ? ctx.tokens.length : i;
}

/** Up to n tokens before a position in the same clause, nearest first. */
function tokensBefore(ctx: TextCtx, pos: number, n: number): Token[] {
  const out: Token[] = [];
  for (let i = tokenIndexFrom(ctx, pos) - 1; i >= 0 && out.length < n; i--) {
    const t = ctx.tokens[i];
    if (!sameClause(ctx.breaks, t.start, pos)) break;
    out.push(t);
  }
  return out;
}

/** Up to n tokens after a position in the same clause. */
function tokensAfter(ctx: TextCtx, pos: number, n: number): Token[] {
  const out: Token[] = [];
  for (let i = tokenIndexFrom(ctx, pos); i < ctx.tokens.length && out.length < n; i++) {
    const t = ctx.tokens[i];
    if (!sameClause(ctx.breaks, pos, t.start)) break;
    out.push(t);
  }
  return out;
}

/** Text between two offsets contains a comma, semicolon or parenthesis (a phrase boundary). */
function phraseBreak(norm: string, a: number, b: number): boolean {
  return /[,;()]/.test(norm.slice(Math.min(a, b), Math.max(a, b)));
}

/**
 * Evidence only: is the action at [pos, end) done by someone other than the candidate?
 * Claims never get this reading — a claim that says a verb asserts it.
 */
function otherAgent(ctx: TextCtx, pos: number, end: number, isCue: (t: Token) => boolean): boolean {
  const back = tokensBefore(ctx, pos, 6);
  for (let k = 0; k < back.length; k++) {
    const w = back[k].word;
    if (SELF.has(w) || isCue(back[k]) || phraseBreak(ctx.norm, back[k].end, pos)) break;
    if (SUBJ_REL.has(w)) return k <= 2; // "staff who administered", "that the team configured"
    // "while senior technicians configured": a subordinate clause with its own (non-self) subject.
    if (SUBORD.has(w)) return k >= 1 && back.slice(0, k).some((t) => !DETERMINERS.has(t.word) && !ADVERBS.has(t.word));
  }
  // Passive voice: "laptops were imaged by senior technicians", "laptops were imaged".
  if (back.slice(0, 2).some((t) => BE.has(t.word))) {
    const after = tokensAfter(ctx, end, 4);
    const by = after.findIndex((t) => t.word === "by");
    if (by !== -1) return !SELF.has(after[by + 1]?.word ?? "");
    return true;
  }
  return false;
}

/** Evidence only: "never configured", "not authorized to reset" — but not "not only" or "without supervision, repaired". */
function negated(ctx: TextCtx, pos: number): boolean {
  const back = tokensBefore(ctx, pos, 3);
  for (let k = 0; k < back.length; k++) {
    if (phraseBreak(ctx.norm, back[k].end, pos)) return false;
    const w = back[k].word;
    if ((NEGATORS.has(w) || w.endsWith("n't")) && !/^(only|just)$/.test(back[k - 1]?.word ?? "")) return w === "without" || w === "no" ? k === 0 : true;
  }
  return false;
}

/** British spellings read like American ones ("customised" → "customized"); length is preserved. */
function americanize(norm: string): string {
  return norm.replace(/([a-z]{2,})is(e|ed|es|ing|ation|ations|er|ers)(?![a-z])/g, "$1iz$2").replace(/([a-z]{2,})ys(e|ed|es|ing)(?![a-z])/g, "$1yz$2");
}

function findCues(ctx: TextCtx, mode: "claim" | "evidence", mentions: Span[]): CueHit[] {
  const { norm, breaks, tokens } = ctx;
  const cueText = americanize(norm);
  const raw: { start: number; end: number; rel: LexToken; form: CueForm; word: string; len: number }[] = [];
  TEAM_PATTERN.lastIndex = 0;
  let tm: RegExpExecArray | null;
  while ((tm = TEAM_PATTERN.exec(cueText))) {
    // Anchor the cue on the verb + preposition, so it binds forward to the team's subject.
    const anchor = tm[0].match(/^[a-z]+\s+(closely\s+)?(with|alongside|in\s+with|for|near|under)/)![0];
    raw.push({ start: tm.index, end: tm.index + anchor.length, rel: "WORKED_ALONGSIDE", form: "phrase", word: anchor, len: 1000 + anchor.length });
  }
  for (const c of CUES) {
    c.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = c.re.exec(cueText))) raw.push({ start: m.index, end: m.index + m[0].length, rel: c.rel, form: c.form, word: m[0].replace(/\s+/g, " "), len: m[0].length });
  }
  raw.sort((a, b) => b.len - a.len || a.start - b.start);
  const kept: typeof raw = [];
  for (const h of raw) if (!kept.some((k) => k.start < h.end && h.start < k.end)) kept.push(h);
  // Verbs outside the lexicon still say something: a past-tense verb in verb position asserts at least use.
  const inMention = (s: Span) => mentions.some((m) => m.start < s.end && s.start < m.end);
  for (const t of tokens) {
    if (!/^[a-z]{3,}ed$/.test(t.word) || ADJ_ED.has(t.word) || kept.some((k) => k.start < t.end && t.start < k.end) || inMention(t)) continue;
    const prev = tokensBefore(ctx, t.start, 1)[0];
    const before = norm.slice(0, t.start).trimEnd();
    const verbPos = !prev || /[,;(]$/.test(before) || SELF.has(prev.word) || VERB_LEAD.has(prev.word) || ADVERBS.has(prev.word) || prev.word.endsWith("ly");
    if (verbPos) kept.push({ start: t.start, end: t.end, rel: "USED", form: "past", word: t.word, len: t.word.length });
  }
  kept.sort((a, b) => a.start - b.start);
  const keptStarts = new Set(kept.filter((k) => k.rel !== "NONE").map((k) => k.start));
  const isCueTok = (t: Token) => keptStarts.has(t.start);

  const out: CueHit[] = [];
  for (const h of kept) {
    if (h.rel === "NONE") continue;
    const prevToks = tokensBefore(ctx, h.start, 2);
    const nextToks = tokensAfter(ctx, h.end, 4);
    const next = nextToks[0]?.word;
    let form = h.form;
    let rel = h.rel as RelToken;
    let baseDerived = false;
    if (form === "base") {
      const before = norm.slice(0, h.start).trimEnd();
      const p1 = prevToks[0]?.word;
      const p2 = prevToks[1]?.word;
      const clauseStart = !prevToks.length || /[,(]$/.test(before);
      const verbal = clauseStart || (p1 !== undefined && (VERB_LEAD.has(p1) || SELF.has(p1))) || (p1?.endsWith("ly") && (p2 === undefined || VERB_LEAD.has(p2)));
      form = verbal ? "verb" : "noun";
      baseDerived = Boolean(verbal);
    }
    const verbalReading = baseDerived || (h.form === "both" && (!prevToks.length || SELF.has(prevToks[0].word) || VERB_LEAD.has(prevToks[0].word)));
    // "repair notes", "troubleshooting guides": a modifier of a document is not an action. Evidence also reads
    // "support role", "support requests" as modifiers; claims keep them as relation nouns ("Outlook support requests").
    let modifier = false;
    if ((h.form === "base" || h.form === "both") && next && MODIFIED_NOUNS.has(next)) {
      if (mode === "evidence" || DOCUMENTS.has(next)) continue;
      if (!verbalReading) {
        form = "noun";
        modifier = true;
      }
    }
    // "Resolved escalated tickets": a participle used as an adjective right after a verb.
    const prev = out[out.length - 1];
    if (form === "past" && prev && (prev.form === "past" || prev.form === "verb") && /^\s+$/.test(norm.slice(prev.end, h.start))) continue;
    // "Followed the runbook / procedures": following instructions is not observing.
    if (h.word === "followed" && nextToks.slice(0, 3).some((t) => PROCEDURES.has(t.word))) continue;
    // "no escalation", "without escalations": nothing was escalated.
    if (rel === "ESCALATED_TO" && form === "noun" && /^(no|without|zero)$/.test(prevToks[0]?.word ?? "")) continue;
    // "Reported weekly KPIs", "Submitted RMAs": only sending something *to* someone is escalating.
    if (TO_DEPENDENT.has(h.word) && !nextToks.concat(tokensAfter(ctx, h.end, 7)).some((t) => t.word === "to")) rel = "REC";
    // "Assisted users with password resets", "helped customers with printer issues": supporting people.
    if (rel === "ASSISTED" && /^(assisted|assisting|assist|assists|helped with|assisted with)$/.test(h.word) && nextToks.slice(0, 3).some((t) => PEOPLE.has(t.word))) rel = "SUPPORTED";
    out.push({ start: h.start, end: h.end, rel, form: form as CueHit["form"], word: h.word, baseDerived, modifier });
  }

  // "Led a training session on Teams", "taught JavaScript at a bootcamp": the session belongs to the teacher,
  // and the topic is something they know (used), not something they studied.
  for (let i = out.length - 1; i >= 0; i--) {
    const c = out[i];
    if (!SESSION_NOUNS.has(c.word)) continue;
    const teacher = out.slice(0, i).reverse().find((t) => TEACH.has(t.word) && sameClause(breaks, t.start, c.start) && wordsBetween(tokens, t.end, c.start).length <= 5);
    if (teacher) {
      out.splice(i, 1);
      teacher.rel = "USED";
    }
  }
  // "helped deploy", "helped install": assisting someone else.
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i];
    const b = out[i + 1];
    if (/^help(ed|ing|s)?$/.test(a.word) && b.form === "verb" && /^\s+$/.test(norm.slice(a.end, b.start))) {
      out.splice(i, 2, { ...a, end: b.end, rel: "ASSISTED", form: "past", word: `${a.word} ${b.word}`, governs: true, activity: b.rel });
    }
  }
  // "responsible for repairing POS systems": the duty is the activity named, not ownership of the object.
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i];
    const b = out[i + 1];
    if (/^(responsible for|in charge of|accountable for)$/.test(a.word) && (b.form === "both" || b.form === "verb") && /^\s+$/.test(norm.slice(a.end, b.start))) {
      out.splice(i, 2, { ...b, start: a.start, word: `${a.word} ${b.word}` });
    }
  }
  // "assisted (the desktop team) with deploying": the weak verb governs the activity it introduces.
  for (let i = 0; i < out.length - 1; i++) {
    const w = out[i];
    if (!isWeak(w.rel) || w.form === "noun") continue;
    const g = out[i + 1];
    if (g.form !== "both" || isWeak(g.rel) || !sameClause(breaks, w.start, g.start)) continue;
    const between = norm.slice(w.end, g.start);
    const words = between.trim() ? between.trim().split(/\s+/) : [];
    const linked = /\b(with|in|on)\s*$/.test(between) || (/(with|in|on)$/.test(w.word) && words.length === 0);
    if (linked && words.length <= 4 && !/[,;:(]/.test(between)) out.splice(i, 2, { ...w, end: g.end, word: `${w.word} … ${g.word}`, governs: true, activity: w.rel === "ASSISTED" ? g.rel : undefined });
  }

  // "Logged parts used, serial numbers…", "Outlook issues resolved for staff": a participle after a noun.
  for (const c of out) {
    if (c.form !== "past") continue;
    const p = tokensBefore(ctx, c.start, 1)[0];
    if (!p || isCueTok(p) || SELF.has(p.word) || BE.has(p.word) || VERB_LEAD.has(p.word) || PRONOUNS.has(p.word) || ADVERBS.has(p.word) || /^(and|or|then|but|to|who|that|which)$/.test(p.word)) continue;
    if (/[,;(]\s*$/.test(norm.slice(0, c.start))) continue;
    const nextTok = tokensAfter(ctx, c.end, 1)[0];
    if (!nextTok || PREPOSITIONS.has(nextTok.word) || /^\s*[,;)]/.test(norm.slice(c.end)) || ["by", "at", "during", "on", "from"].includes(nextTok.word)) c.postNominal = true;
  }

  // Evidence: who did it — and did they? (Claims are read as written.)
  if (mode === "evidence") {
    for (const c of out) {
      if (c.form !== "past" && c.form !== "verb" && c.form !== "phrase") continue;
      if (otherAgent(ctx, c.start, c.end, isCueTok)) {
        c.rel = "OBSERVED";
        c.thirdParty = true;
      } else if (negated(ctx, c.start)) c.rel = "MENTIONED_ONLY";
    }
  }
  return out;
}

// ───────────────────────── Binding ─────────────────────────

/** One relation attached to a mention, with the span of the words it came from. */
export interface RelPart extends Span {
  tok: RelToken;
  /** ASSISTED parts: the activity assisted, when the words name it. */
  activity?: RelToken;
}

export interface MentionBinding {
  conceptId: string;
  start: number;
  end: number;
  text: string;
  /** Raw relation tokens bound to this mention (ACT/BUILD/REC/ISSUE unresolved). */
  tokens: RelToken[];
  /** The tokens with the span of the words they came from (the mention itself for intrinsic ones). */
  parts: RelPart[];
  source: "clause-weak" | "forward" | "backward" | "self" | "none";
  /** Mentions nested inside this one (e.g. "Microsoft 365" inside "Microsoft 365 administration"). */
  nested: string[];
  /** Mention text plus the words that govern it, for messages. */
  phrase: string;
  /** The nearest verb applies to a document or request in between ("wrote articles for Wi-Fi issues"). */
  interrupted: boolean;
  /** The clause has a verb, even if none reaches this mention. */
  verbInClause: boolean;
  /** First mention in the text. */
  first: boolean;
  /** The mention heads its clause (only determiners before it) and is not a modifier of a place or unit. */
  head: boolean;
}

export interface ParsedRelations {
  bindings: MentionBinding[];
  cues: CueHit[];
  /**
   * Strong cues no mention claimed. `targets`: bindings the cue governs anyway (claims: concepts later in its
   * clause, however far). `attach`: refers back to the text's concepts ("resolved them", "…: administration").
   */
  orphans: { cue: CueHit; attach: boolean; targets: number[] }[];
  /** Evidence: relation tokens the fact as a whole shows, outside weak scopes. */
  ceiling: RelToken[];
}

/** Concept kinds whose own name never asserts a relation ("Jira Service Management" is a product). */
const OWN_SPAN_SKIP_KINDS = new Set<ConceptKind>(["soft", "methodology", "environment", "title", "certification", "license", "clearance", "tool", "platform", "hardware"]);

/**
 * Bind relation cues to concept mentions.
 * mode "evidence": conservative — weak cues govern their clause, ungoverned mentions show use at most.
 * mode "claim":    strict — every relation word is asserted.
 */
export function parseRelations(text: string, mode: "claim" | "evidence"): ParsedRelations {
  const ctx = textCtx(text);
  const { norm, tokens, breaks } = ctx;
  const all = detectConcepts(text);
  const top = all.filter((m) => !all.some((o) => o !== m && spanContains(o, m))).sort((a, b) => a.start - b.start || b.end - a.end);
  const cues = findCues(ctx, mode, all);
  const cueKeys = new Set(cues.map((c) => `${c.start}:${c.end}`));
  // A mention that is nothing but a relation word ("troubleshooting") is an activity: its cue
  // still binds to its neighbours ("Outlook troubleshooting") and it never coordinates.
  const activity = new Set(top.filter((m) => cueKeys.has(`${m.start}:${m.end}`)));
  const blocking = top.filter((m) => !activity.has(m));
  const insideMention = (c: Span) => blocking.some((m) => m.start < c.end && c.start < m.end);
  const ownCues = (m: Span) => cues.filter((c) => c.start >= m.start && c.end <= m.end);
  const cueStartingAt = new Map(cues.map((c) => [c.start, c]));
  const isCueTok = (t: Token) => cueStartingAt.has(t.start);
  const isVerbal = (m: ConceptMention) => {
    const t = norm.slice(m.start, m.end);
    return ownCues(m).some((c) => c.form === "past") || IRREGULAR_PAST.test(t) || /[a-z]ed\b/.test(t);
  };
  const weakClauseCue = (c: CueHit) => isWeak(c.rel) && !c.postNominal && (c.form !== "noun" || WEAK_NOUNS.has(c.word));
  /** Heads its clause ("Phone support for store staff"), not "receptionist for the network engineering department". */
  const mentionHeads = (m: Span) => {
    const back = tokensBefore(ctx, m.start, 4).filter((t) => !phraseBreak(norm, t.end, m.start));
    const next = tokensAfter(ctx, m.end, 1)[0];
    return back.every((t) => DETERMINERS.has(t.word)) && !(next && ORG_NOUNS.has(next.word));
  };
  const clauseText = (pos: number) => {
    let lo = -1;
    let hi = text.length;
    for (const b of breaks) {
      if (b < pos) lo = b;
      else if (b < hi) {
        hi = b;
        break;
      }
    }
    return text.slice(lo + 1, hi);
  };
  const labClause = (pos: number) =>
    cues.some((c) => c.rel === "LAB_ONLY" && (c.form === "phrase" || c.form === "noun") && sameClause(breaks, c.start, pos)) && !productionScope(clauseText(pos));
  const skippedKindMention = (c: Span) => blocking.some((m) => m.start < c.end && c.start < m.end && OWN_SPAN_SKIP_KINDS.has(getConcept(m.conceptId)?.kind ?? "soft"));

  // Coordination groups: mentions joined only by commas, slashes, "&", "and", "or", or adjacency.
  const groups: ConceptMention[][] = [];
  for (const m of top) {
    const g = groups[groups.length - 1];
    const prev = g?.[g.length - 1];
    if (prev && !isVerbal(prev) && !isVerbal(m) && !activity.has(prev) && !activity.has(m)) {
      const between = norm.slice(prev.end, m.start);
      if (m.start < prev.end || /^[\s,/&]*((and|or|as well as|plus)[\s,]*)?$/.test(between)) {
        g.push(m);
        continue;
      }
    }
    groups.push([m]);
  }

  /** A strong finite verb that is a main verb of its own, outside every weak verb's scope. */
  const isFree = (f: { start: number; end: number; form: string; rel: RelToken; thirdParty?: boolean }, weak: CueHit[]) => {
    if (isWeak(f.rel) || f.thirdParty) return false;
    // Skip adverbs: "then independently imaged", "and later repaired".
    const back = tokensBefore(ctx, f.start, 4);
    let k = 0;
    while (k < back.length && (ADVERBS.has(back[k].word) || back[k].word.endsWith("ly")) && back[k].word !== "then") k++;
    const prevTok = back[k]?.word;
    const lead = back[k] ? back[k].start : f.start;
    const finite = f.form === "past" || f.form === "verb" || f.form === "phrase" || (f.form === "both" && prevTok === "by");
    if (!finite) return false;
    return weak.every((w) => {
      // "Repaired printers and escalated outages" — but in "completed AD e-learning modules" the weak
      // word is the verb's own object.
      if (w.start > f.start) return /\b(and|then|but|or)\b|[,;]/.test(norm.slice(f.end, w.start));
      const between = wordsBetween(tokens, w.end, f.start);
      if (between.some((t) => SUBJ_REL.has(t.word) || SUBORD.has(t.word))) return false;
      const prevChar = norm.slice(0, k ? back[k - 1].start : f.start).trimEnd().slice(-1);
      return prevTok === "and" || prevTok === "then" || prevTok === "also" || prevTok === "by" || prevChar === "," || prevChar === ";" || (lead !== f.start && /[,;]\s*$/.test(norm.slice(0, back[k - 1]?.start ?? f.start)));
    });
  };

  const used = new Set<CueHit>();
  const bindings: MentionBinding[] = [];

  for (const g of groups) {
    const gStart = g[0].start;
    const gEnd = Math.max(...g.map((m) => m.end));
    const inGroup = (c: Span) => g.some((m) => m.start < c.end && c.start < m.end);

    // ── Forward: nearest usable cue before the group in the same clause (≤7 words) + its chain ──
    const prepAfter = (c: CueHit) => {
      const after = tokensAfter(ctx, c.end, 2);
      return PREPOSITIONS.has(after[0]?.word ?? "") || (PREPOSITIONS.has(after[1]?.word ?? "") && !isCueTok(after[0]) && !top.some((m) => m.start === after[0].start));
    };
    const before = cues.filter((c) => c.end <= gStart && sameClause(breaks, c.start, gStart) && (!insideMention(c) || (c.form === "past" && !inGroup(c))));
    const usable = before.filter((c) => !c.postNominal && (c.form !== "noun" || prepAfter(c)));
    let fwd: CueHit[] = [];
    let interrupted = false;
    let topic = false;
    const nearest = usable[usable.length - 1];
    if (nearest) {
      const gap = wordsBetween(tokens, nearest.end, gStart);
      const blockers = mode === "evidence" ? ARTIFACTS : DOCUMENTS;
      interrupted = gap.some((t) => blockers.has(t.word)) && !isWeak(nearest.rel);
      // "Escalated issues as the Tier 2 tech": "as …" starts a new predicate about the candidate.
      const asBreak = gap.some((t, i) => t.word === "as" && gap[i - 1]?.word !== "such" && gap[i + 1]?.word !== "well");
      if (gap.length <= 7 && !interrupted && !asBreak) {
        fwd = [nearest];
        for (let i = before.indexOf(nearest) - 1; i >= 0; i--) {
          if (JOINER.test(norm.slice(before[i].end, fwd[0].start))) fwd.unshift(before[i]);
          else break;
        }
      }
    }
    // The topic of a document: "wrote guides on Active Directory administration".
    const back3 = tokensBefore(ctx, gStart, 3);
    if (back3.length >= 2 && TOPIC_PREPS.has(back3[0].word) && (mode === "evidence" ? ARTIFACTS : DOCUMENTS).has(back3[1].word)) {
      interrupted = true;
      topic = true;
      fwd = fwd.filter((c) => isWeak(c.rel));
    }
    // Record-keeping verbs reach the record they write into ("logged … in service records").
    if (!fwd.length && g.some((m) => RECORD_CONCEPTS.has(m.conceptId))) {
      const rec = [...before].reverse().find((c) => c.rel === "REC");
      if (rec) {
        fwd = [rec];
        interrupted = false;
      }
    }
    // "Resolved tickets …, including printer and VPN issues": the list names the problems the verb dealt with.
    if (!fwd.length && !topic && tokensBefore(ctx, gStart, 1)[0]?.word === "including" && tokensAfter(ctx, gEnd, 3).some((t) => ISSUE_NOUNS.has(t.word))) {
      const act = [...before].reverse().find((c) => c.rel === "ACT" && !c.postNominal);
      if (act) fwd = [act];
    }
    // Claims: a weak verb does not reach past a comma ("Worked alongside the team, subnetting…").
    if (mode === "claim" && fwd.length && isWeak(fwd[fwd.length - 1].rel) && /[,;]/.test(norm.slice(fwd[fwd.length - 1].end, gStart))) fwd = [];
    // An instrument: "automated onboarding tasks with PowerShell", "built dashboards in Excel", "reported KPIs
    // using Power BI" — the verb's object is something else; the tool is only used.
    const lead = tokensBefore(ctx, gStart, 3).filter((t) => !DETERMINERS.has(t.word));
    const prepTok = lead[0];
    const prepWord = prepTok?.word;
    const mainVerb = prepTok ? [...before].reverse().find((c) => c.end <= prepTok.start && c.form !== "noun" && !/^(using|utilizing)$/.test(c.word)) : undefined;
    // An assisting verb's tool belongs to the assisted activity; one's own report or escalation still uses it.
    const instrumentClause =
      mainVerb !== undefined &&
      (!isWeak(mainVerb.rel) || mainVerb.rel === "ESCALATED_TO") &&
      (INSTRUMENT_PREPS.has(prepWord ?? "") || prepWord === "utilizing" || ((prepWord === "in" || prepWord === "on") && ["ACT", "BUILD", "REC", "USED"].includes(mainVerb.rel))) &&
      wordsBetween(tokens, mainVerb.end, prepTok!.start).some((t) => !DETERMINERS.has(t.word) && !PREPOSITIONS.has(t.word) && !isCueTok(t) && !top.some((m) => m.start <= t.start && t.end <= m.end));

    // ── Backward: noun-capable cues right after the group (≤2 modifier words), plus coordinated ones ──
    const bwd: CueHit[] = [];
    {
      const after = tokens.filter((t) => t.start >= gEnd && sameClause(breaks, gEnd, t.start));
      let skipped = 0;
      for (let i = 0; i < after.length; i++) {
        const t = after[i];
        const cue = cueStartingAt.get(t.start);
        const nounish = cue && (cue.form === "noun" || cue.form === "both" || (bwd.length > 0 && cue.baseDerived));
        if (phraseBreak(norm, gEnd, t.start) && !bwd.length) break;
        if (cue && nounish && !insideMention(cue)) {
          if (bwd.length && (!JOINER.test(norm.slice(bwd[bwd.length - 1].end, cue.start)) || /,/.test(norm.slice(bwd[bwd.length - 1].end, cue.start)))) break;
          const next = tokensAfter(ctx, cue.end, 1)[0];
          // "Active Directory administration guides": a document about it, not doing it.
          if (next && (mode === "evidence" ? ARTIFACTS : DOCUMENTS).has(next.word)) {
            used.add(cue);
            break;
          }
          bwd.push(cue);
          while (i + 1 < after.length && after[i + 1].start < cue.end) i++;
          continue;
        }
        if (bwd.length) {
          if (/^(and|or)$/.test(t.word)) continue;
          break;
        }
        if (STOP_BETWEEN.has(t.word) || cue || top.some((m) => m.start === t.start)) break;
        if (++skipped > 2) break;
      }
    }

    // Writing about it: the relation nouns after it belong to the document, not the candidate.
    if (interrupted) {
      for (const c of bwd) used.add(c);
      bwd.length = 0;
    }
    // "<X> person": "supported the Active Directory administrator" is about a person, not administering — but
    // only after a verb that takes a person; "served as / was / our networking admin" describes the candidate.
    const det = tokensBefore(ctx, gStart, 2);
    const nearestFwd = fwd[fwd.length - 1];
    const personVerb = nearestFwd !== undefined && PERSON_VERBS.has(nearestFwd.rel) && !/(as|for)$/.test(nearestFwd.word) && det[1]?.word !== "as";
    const personObject = personVerb && /^(the|a|an|their)$/.test(det[0]?.word ?? "") && (bwd.some((c) => ROLE_NOUNS.has(c.word)) || g.some((m) => getConcept(m.conceptId)?.kind === "title"));
    const possessive = /^'s?\b/.test(norm.slice(gEnd)) || /^'/.test(text.slice(gEnd));

    // "resolved <X> issues", "answered <X> requests": generic verbs on problems.
    const issueObject = [...wordsBetween(tokens, gStart, gEnd), ...tokensAfter(ctx, gEnd, 3)].some((t) => ISSUE_NOUNS.has(t.word));

    // Evidence: weak / learning cues in the clause govern it unless a free main verb reaches the mention.
    const clauseWeak = mode === "evidence" ? cues.filter((c) => weakClauseCue(c) && sameClause(breaks, c.start, gStart) && !inGroup(c)) : [];
    const verbInClause =
      cues.some((c) => c.form !== "noun" && sameClause(breaks, c.start, gStart)) ||
      top.some((m) => !g.includes(m) && isVerbal(m) && sameClause(breaks, m.start, gStart)) ||
      tokens.some((t) => sameClause(breaks, t.start, gStart) && /^[a-z]{3,}ed$/.test(t.word) && !ADJ_ED.has(t.word) && !insideMention(t));

    // Claims: "assisted with deploying laptops using Autopilot" — the instrument belongs to the assisting.
    if (mode === "claim" && fwd.length === 1 && /^(using|utilizing)$/.test(fwd[0].word)) {
      const prior = before[before.indexOf(fwd[0]) - 1];
      if (prior && isWeak(prior.rel) && prior.governs && wordsBetween(tokens, prior.end, fwd[0].start).length <= 4 && !/[,;:(]/.test(norm.slice(prior.end, fwd[0].start))) {
        used.add(fwd[0]);
        fwd = [prior];
      }
    }
    // Claims: a weak verb directly attached to the mention governs the activity it names.
    let claimWeak = false;
    if (mode === "claim" && fwd.length) {
      const n = fwd[fwd.length - 1];
      if (isWeak(n.rel) && n.form !== "noun") {
        const gap = wordsBetween(tokens, n.end, gStart);
        claimWeak =
          (gap.length <= 2 && gap.every((t) => LINKERS.has(t.word))) ||
          Boolean(n.governs) ||
          (n.rel === "ASSISTED" && gap.some((t) => t.word === "with" || t.word === "in") && !/[,;]/.test(norm.slice(n.end, gStart)));
      }
    }

    for (const m of g) {
      const concept = getConcept(m.conceptId);
      const parts: RelPart[] = [];
      const add = (tok: RelToken, s: Span) => parts.push({ tok, start: s.start, end: s.end });
      let source: MentionBinding["source"] = "none";
      const governing: CueHit[] = [];

      // Own span: the head relation word of an activity alias ("documented repairs" → documented).
      const own = ownCues(m);
      const head = own.find((c) => c.form === "past" || c.form === "verb" || c.form === "both") ?? own[0];
      const verbal = isVerbal(m) && !(mode === "evidence" && (otherAgent(ctx, m.start, m.end, isCueTok) || negated(ctx, m.start)));
      // Evidence: an activity noun counts when something hands-on governs it or it heads a verb-less fact.
      const ownCounts =
        !topic && (mode === "claim" || verbal || (activity.has(m) && head?.form !== "noun") || (fwd.length > 0 && !fwd.some((c) => isWeak(c.rel))) || (!verbInClause && mentionHeads(m)));
      const ownParts: RelPart[] = [];
      if (concept && !OWN_SPAN_SKIP_KINDS.has(concept.kind) && ownCounts && !(head && isWeak(head.rel))) {
        // An alias names the concept's own activity: "OS deployment" is PC imaging, never more than imaging.
        if (concept.intrinsic && (head || verbal)) ownParts.push({ tok: concept.intrinsic, start: m.start, end: m.end });
        else if (head && !(mode === "evidence" && head.form === "past" && !verbal)) ownParts.push({ tok: head.rel, start: head.start, end: head.end });
      }

      const verbalSelf = verbal && !topic ? [{ start: m.start, end: m.end, form: "past", rel: "PERFORMED" as RelToken }] : [];
      // An instrument used for one's own escalation or report is still used ("reported KPIs using Power BI").
      const ownActionOnly = clauseWeak.every((c) => c.rel === "ESCALATED_TO");
      const instrument = instrumentClause && ["tool", "platform", "hardware"].includes(concept?.kind ?? "");
      const weakGov = clauseWeak.length > 0 && !(instrument && ownActionOnly) && ![...fwd, ...verbalSelf].some((f) => isFree(f, clauseWeak));
      if (topic) {
        // Writing or asking about it: nothing hands-on (claims and evidence read it the same way).
      } else if (instrument && !weakGov) {
        add("USED", m);
        source = "forward";
      } else if (mode === "evidence" && isVerbal(m) && !verbal) {
        // "Laptops were imaged by senior technicians", "Never imaged laptops": someone else's action, or none.
        add(otherAgent(ctx, m.start, m.end, isCueTok) ? "OBSERVED" : "MENTIONED_ONLY", m);
        source = "self";
      } else if (personObject || (possessive && concept?.kind === "title")) {
        add("WORKED_ALONGSIDE", m);
        for (const c of [...fwd, ...bwd]) governing.push(c);
        source = "forward";
      } else if (weakGov) {
        for (const c of clauseWeak) {
          parts.push({ tok: c.rel, start: c.start, end: c.end, activity: c.activity });
          governing.push(c);
        }
        source = "clause-weak";
      } else {
        for (const c of fwd) {
          parts.push({ tok: issueObject && c.rel === "ACT" ? "ISSUE" : c.rel, start: c.start, end: c.end, activity: c.activity });
          governing.push(c);
        }
        // "Assisted with Windows Autopilot deployments": the noun names the activity assisted.
        if (claimWeak) {
          const act = bwd.find((c) => !ROLE_NOUNS.has(c.word) && !isWeak(c.rel));
          const assisted = parts.find((p) => p.tok === "ASSISTED");
          if (act && assisted && !assisted.activity) assisted.activity = act.rel;
        }
        if (fwd.length) source = "forward";
        const keepBwd = bwd.filter((c) => !claimWeak || ROLE_NOUNS.has(c.word));
        for (const c of bwd) if (!keepBwd.includes(c)) used.add(c);
        // Receiving escalations is support: "handled Tier 2 escalations", "triaged AD escalations".
        // Claims read any other verb that way; evidence only clear receiving verbs with no "to <party>".
        const lastAfter = tokensAfter(ctx, gEnd, 5);
        const sentOn = lastAfter.some((t, i) => (t.word === "to" || t.word === "for") && i > 0);
        const receiving =
          mode === "claim"
            ? fwd.some((c) => c.rel !== "ESCALATED_TO") || before.some((c) => c.rel !== "ESCALATED_TO" && !isWeak(c.rel))
            : fwd.some((c) => RECEIVE.has(c.word)) && !sentOn;
        for (const c of keepBwd) {
          add(c.rel === "ESCALATED_TO" && receiving ? "SUPPORTED" : c.rel, c);
          governing.push(c);
        }
        if (!fwd.length && keepBwd.length) source = "backward";
        if (!claimWeak) {
          for (const p of ownParts) parts.push(p);
          for (const c of own) if (ownParts.some((p) => p.start === c.start && p.end === c.end)) governing.push(c);
          if (source === "none" && ownParts.length) source = "self";
        }
        // Light verbs: "provided printer troubleshooting" asserts troubleshooting, not a second activity;
        // in evidence "completed the Intune exam" is the exam (studied), not use.
        if (parts.some((p) => p.tok !== "ACT" && p.tok !== "ISSUE" && (mode === "evidence" || !isWeak(p.tok)))) {
          for (let i = parts.length - 1; i >= 0; i--) if (parts[i].tok === "ACT" || (mode === "evidence" && parts[i].tok === "ISSUE" && keepBwd.length)) parts.splice(i, 1);
        }
      }
      if (interrupted && !parts.length && mode === "claim") parts.push({ tok: "USED", start: m.start, end: m.end });
      // Evidence: hands-on work "in a test lab" / "in a sandbox" is lab work.
      if (mode === "evidence" && labClause(m.start)) for (const p of parts) if (!isWeak(p.tok)) p.tok = "LAB_ONLY";
      for (const c of governing) used.add(c);
      const nested = all.filter((o) => o !== m && spanContains(m, o)).map((o) => o.conceptId);
      const phraseStart = Math.min(m.start, ...governing.map((c) => c.start));
      const phraseEnd = Math.max(m.end, ...governing.map((c) => c.end));
      const uniq = parts.filter((p, i) => parts.findIndex((q) => q.tok === p.tok && q.start === p.start) === i);
      bindings.push({
        conceptId: m.conceptId,
        start: m.start,
        end: m.end,
        text: text.slice(m.start, m.end),
        tokens: [...new Set(uniq.map((p) => p.tok))],
        parts: uniq,
        source,
        nested,
        phrase: text.slice(phraseStart, phraseEnd),
        interrupted: interrupted && !uniq.length,
        verbInClause,
        first: m === top[0],
        head: mentionHeads(m),
      });
    }
  }

  // Strong cues no mention claimed.
  const orphans: ParsedRelations["orphans"] = [];
  const near = (c: CueHit) => [...tokensBefore(ctx, c.start, 2), ...tokensAfter(ctx, c.end, 3)];
  const issueTok = (c: CueHit): RelToken => (c.rel === "ACT" && near(c).some((t) => ISSUE_NOUNS.has(t.word)) ? "ISSUE" : c.rel);
  const free = cues.filter((c) => !used.has(c) && !isWeak(c.rel) && !insideMention(c) && !c.modifier);
  for (const c of free) {
    // Light verb with its own relation noun: "provided phone and walk-in support" asserts the support.
    if (c.rel === "ACT" && free.some((o) => o !== c && o.start > c.start && o.rel !== "ACT" && sameClause(breaks, c.start, o.start) && wordsBetween(tokens, c.end, o.start).length <= 4 && !top.some((m) => m.start > c.start && m.end <= o.start))) continue;
    let attach = c.form === "noun";
    const after = tokensAfter(ctx, c.end, 3);
    if (!attach) {
      const before = tokensBefore(ctx, c.start, 3);
      const passiveAfterMention =
        c.form === "past" && (before.some((t) => BE.has(t.word)) || top.some((m) => m.end <= c.start && sameClause(breaks, m.end, c.start) && wordsBetween(tokens, m.end, c.start).length <= 1));
      attach = !after.length || after.some((t) => PRONOUNS.has(t.word)) || TAIL_WORDS.has(after[0].word) || passiveAfterMention;
    }
    // Claims: a verb governs the concepts later in its clause however far away they are, unless they
    // are only its instruments ("Configured each and every one of the old store's AD accounts").
    const targets =
      mode === "claim" && c.form !== "noun"
        ? bindings.map((b, idx) => ({ b, idx })).filter(({ b }) => b.start > c.start && sameClause(breaks, c.start, b.start) && b.source !== "forward").map(({ idx }) => idx)
        : [];
    orphans.push({ cue: { ...c, rel: issueTok(c) }, attach, targets });
  }

  // Evidence: a free verb with a pronoun object ("repaired them") applies to the concepts before it in its clause.
  if (mode === "evidence") {
    const weakAll = cues.filter(weakClauseCue);
    for (const o of orphans) {
      if (!o.attach || o.cue.form === "noun") continue;
      const w = weakAll.filter((x) => sameClause(breaks, x.start, o.cue.start));
      if (w.length && !isFree(o.cue, w)) continue;
      for (const b of bindings) {
        if (b.start < o.cue.start && sameClause(breaks, b.start, o.cue.start) && b.source !== "clause-weak") {
          const tok = labClause(o.cue.start) ? "LAB_ONLY" : o.cue.rel;
          b.parts.push({ tok, start: o.cue.start, end: o.cue.end });
          b.tokens = [...new Set([...b.tokens, tok])];
        }
      }
    }
  }

  // Evidence ceiling: relations the fact shows anywhere, minus verbs inside weak scopes and product names.
  const ceiling: RelToken[] = [];
  if (mode === "evidence") {
    const weakAll = cues.filter(weakClauseCue);
    for (const b of bindings) for (const p of b.parts) ceiling.push(p.tok);
    for (const c of cues) {
      if (c.form === "noun" || used.has(c) || skippedKindMention(c)) continue;
      const w = weakAll.filter((x) => x !== c && sameClause(breaks, x.start, c.start));
      if (isWeak(c.rel) || !w.length || isFree(c, w)) ceiling.push(labClause(c.start) && !isWeak(c.rel) ? "LAB_ONLY" : issueTok(c));
    }
  }
  return { bindings, cues, orphans, ceiling: [...new Set(ceiling)] };
}

// ───────────────────────── Claims ─────────────────────────

export interface AssertedPart extends Span {
  rel: Relation;
  /** ASSISTED: the activity assisted ("helped configure" → CONFIGURED). */
  activity?: Relation;
}

export interface ClaimReading {
  items: { binding: MentionBinding; parts: AssertedPart[]; asserted: Relation[] }[];
  /** Strong relation words with an object of their own ("trained new hires"): checked against the cited facts. */
  unbound: { cue: CueHit; asserted: Relation }[];
}

/**
 * What a claim asserts about each concept it mentions (strict reading).
 * Hands-on relations stated "in a home lab" / "in a sandbox" are lab relations — only in that clause, and
 * never when the clause also places the work in production. `lab`: every cited fact is lab or study work and
 * the claim sits in a learning section, so hands-on wording describes the lab unless it names production.
 */
export function readClaim(text: string, opts: { learningContext?: boolean; lab?: boolean } = {}): ClaimReading {
  const clean = sanitizeText(text);
  const parsed = parseRelations(clean, "claim");
  const breaks = clauseBreaks(clean);
  const clauseOf = (pos: number) => {
    let lo = -1;
    let hi = clean.length;
    for (const b of breaks) {
      if (b < pos) lo = b;
      else if (b < hi) {
        hi = b;
        break;
      }
    }
    return clean.slice(lo + 1, hi);
  };
  const labCues = parsed.cues.filter((c) => c.rel === "LAB_ONLY");
  const header = /^[^:]*\blab\b[^:]*:/i.test(clean) && !productionScope(clean);
  const allLab = (opts.lab || header) && !productionScope(clean);
  const labAt = (pos: number) => allLab || (labCues.some((c) => sameClause(breaks, c.start, pos)) && !productionScope(clauseOf(pos)) && !productionScope(clean));
  const toLab = (r: Relation, pos: number): Relation => (EXPERIENCE_RELATIONS.has(r) && labAt(pos) ? "LAB_ONLY" : r);
  const items = parsed.bindings.map((binding) => {
    const parts: AssertedPart[] = binding.parts.map((p) => ({
      rel: toLab(resolveToken(p.tok, binding.conceptId), binding.start),
      start: p.start,
      end: p.end,
      activity: p.activity ? resolveToken(p.activity, binding.conceptId) : undefined,
    }));
    if (!parts.length) parts.push({ rel: toLab(defaultClaimRelation(binding.conceptId, opts), binding.start), start: binding.start, end: binding.end });
    return { binding, parts, asserted: [] as Relation[] };
  });
  const unbound: ClaimReading["unbound"] = [];
  for (const o of parsed.orphans) {
    const sameClauseItems = items.filter((i) => sameClause(breaks, i.binding.start, o.cue.start));
    const targets = o.targets.length ? o.targets.map((t) => items[t]) : o.attach ? (sameClauseItems.length ? sameClauseItems : items) : [];
    if (targets.length) {
      for (const t of targets) t.parts.push({ rel: toLab(resolveToken(o.cue.rel, t.binding.conceptId), o.cue.start), start: o.cue.start, end: o.cue.end });
    } else unbound.push({ cue: o.cue, asserted: toLab(resolveGeneric(o.cue.rel), o.cue.start) });
  }
  for (const i of items) i.asserted = [...new Set(i.parts.map((p) => p.rel))];
  return { items, unbound };
}

/** A bare mention ("Active Directory" in a skills line) asserts the concept's own activity, or use. */
function defaultClaimRelation(conceptId: string, opts: { learningContext?: boolean }): Relation {
  if (opts.learningContext) return "STUDIED";
  const c = getConcept(conceptId);
  if (c?.kind === "title") return "PERFORMED";
  return c?.intrinsic ?? "USED";
}

/** True for wording that asserts hands-on experience only (safe inside "experience with …"). */
export function isExperienceWording(phrase: string): boolean {
  const r = readClaim(phrase);
  return r.items.length > 0 && r.unbound.length === 0 && r.items.every((i) => i.asserted.every((a) => EXPERIENCE_RELATIONS.has(a))) && !parseRelations(phrase, "claim").cues.some((c) => isWeak(c.rel));
}

// ───────────────────────── Evidence relations per fact ─────────────────────────

export interface WordingIssue {
  phrase: string;
  conceptId: string;
  asserted: Relation;
  allowed: Relation[];
}

export interface FactRelations {
  /** conceptId → relations this fact shows for it. */
  byConcept: Map<string, Set<Relation>>;
  /** Relations the fact as a whole shows (narrowed and capped): backs claim verbs with objects of their own. */
  ceiling: Relation[];
  /** Allowed-wording phrases that claim more than the fact's relationship supports (ignored). */
  wordingIssues: WordingIssue[];
  /** Explicit relations that could not apply because the wording does not support them. */
  ignoredExplicit: Relation[];
  /** conceptId → activities the fact shows the candidate assisted with ("assisted with deploying" → INSTALLED). */
  assisted: Map<string, Set<Relation>>;
}

function categoryDefault(f: LedgerFact): RelToken {
  if (f.experienceType === "LEARNING") return "STUDIED";
  switch (f.category) {
    case "TOOL":
      return "USED";
    case "LEARNING":
    case "PROJECT":
      return f.experienceType === "PROFESSIONAL" || f.experienceType === "VOLUNTEER" ? "ACT" : "STUDIED";
    case "EDUCATION":
      return "STUDIED";
    default:
      return "ACT";
  }
}

/**
 * Evidence relations of one fact, per concept it mentions.
 * Callers combine this with prohibitions (which concepts the fact may never license).
 */
export function computeFactRelations(f: LedgerFact): FactRelations {
  const explicit = [...new Set(f.relations.filter(isRelation))];
  const text = sanitizeText(f.canonicalFact);
  const parsed = parseRelations(text, "evidence");
  const def = categoryDefault(f);
  const ignored = new Set<Relation>(explicit);
  const isRole = f.category === "ROLE";
  // A role fact reads "<title> at <employer>, <location> (dates)": only the title describes the work.
  const titleEnd = isRole && f.roleContext && normalizeText(text).startsWith(normalizeText(f.roleContext)) ? f.roleContext.length : isRole ? 0 : text.length;

  // Explicit relations can only narrow: a weaker one (escalated, observed, studied…) applies where the
  // text shows hands-on work or that same relation; a hands-on one only where the text already reaches it.
  const narrow = (rels: Relation[]): Relation[] => {
    if (!explicit.length) return rels;
    const out = explicit.filter(
      (e) =>
        e === "MENTIONED_ONLY" ||
        rels.some((r) => satisfies(r, e)) ||
        ((EXPOSURE_RELATIONS.has(e) || LEARNING_RELATIONS.has(e)) && rels.some((r) => EXPERIENCE_RELATIONS.has(r))),
    );
    for (const e of out) ignored.delete(e);
    return out.length ? out : rels;
  };
  const learningCap = (rels: Relation[]): Relation[] => {
    if (f.experienceType !== "LEARNING") return rels;
    return [...new Set(rels.map((r) => (LEARNING_RELATIONS.has(r) || EXPOSURE_RELATIONS.has(r) ? r : "LAB_ONLY")))];
  };
  const finalize = (rels: Iterable<Relation>): Relation[] => learningCap(narrow([...new Set(rels)]));
  const addRels = (map: Map<string, Set<Relation>>, cid: string, rels: Iterable<Relation>) => {
    let s = map.get(cid);
    if (!s) map.set(cid, (s = new Set()));
    for (const r of rels) s.add(r);
  };

  // 1. Canonical text — each mention gets the relation that governs it.
  const textRels = new Map<string, Set<Relation>>();
  const assisted = new Map<string, Set<Relation>>();
  for (const b of parsed.bindings) {
    const headKind = getConcept(b.conceptId)?.kind;
    // Nothing reaches the mention: the head activity of a verb-less duty is that activity; a list item or a
    // mention beside another verb shows use at most; a modifier of a place or unit shows nothing.
    const fallback: RelToken =
      def !== "ACT" ? def : b.interrupted || b.verbInClause ? "USED" : !b.head ? "MENTIONED_ONLY" : headKind === "duty" || headKind === "skill" ? "ACT" : "USED";
    for (const cid of [b.conceptId, ...b.nested]) {
      let rels: Relation[];
      // The held title is the job; the employer's or location's name is only a name.
      if (isRole) rels = b.end <= titleEnd ? [resolveToken("ACT", cid)] : ["MENTIONED_ONLY"];
      else rels = (b.tokens.length ? b.tokens : [fallback]).map((t) => resolveToken(t, cid));
      for (const p of b.parts) if (p.tok === "ASSISTED" && p.activity) addRels(assisted, cid, [resolveToken(p.activity, cid)]);
      // A job title in an ordinary fact names a person the candidate dealt with, not a role they held.
      if (!isRole && getConcept(cid)?.kind === "title") rels = rels.map((r) => (EXPERIENCE_RELATIONS.has(r) ? "WORKED_ALONGSIDE" : r));
      addRels(textRels, cid, rels);
    }
  }
  const textBound = new Set(textRels.keys());

  // Fact-level ceiling: what the fact's own words (outside weak scopes) show, never more.
  const ceiling = isRole ? finalize(["PERFORMED"]) : finalize((parsed.ceiling.length ? parsed.ceiling : [def]).map(resolveGeneric));
  // Concepts the text implies (Group Policy → Active Directory, Intune → MDM) are capped by the text that implies them.
  const impliedBy = new Map<string, Set<Relation>>();
  for (const [cid, rels] of textRels) for (const imp of impliedClosure([cid])) if (imp !== cid && !textBound.has(imp)) addRels(impliedBy, imp, rels);
  const ceilingFor = (cid: string): Relation[] => {
    if (textBound.has(cid)) return finalize(textRels.get(cid)!);
    const capped = new Set<Relation>(impliedBy.get(cid) ?? []);
    // A concept that implies a concept the text shows only weakly can't exceed it (Group Policy wording on an
    // escalated Active Directory fact).
    for (const imp of impliedClosure([cid])) {
      const rels = textRels.get(imp);
      if (rels && [...rels].every((r) => !EXPERIENCE_RELATIONS.has(r))) for (const r of rels) capped.add(r);
    }
    return capped.size ? finalize([...capped].filter((r) => ceiling.some((c) => satisfies(c, r)) || EXPOSURE_RELATIONS.has(r) || LEARNING_RELATIONS.has(r))) : ceiling;
  };

  // 2. Explicit concept tags not mentioned in the text get what the fact shows for them.
  const extraRels = new Map<string, Set<Relation>>();
  for (const cid of f.conceptIds) if (getConcept(cid) && !textBound.has(cid)) addRels(extraRels, cid, ceilingFor(cid));

  // 3. Allowed wording: user-approved phrasing, never stronger than the fact shows for each concept it names.
  const wordingIssues: WordingIssue[] = [];
  for (const raw of f.allowedWording) {
    const w = sanitizeText(raw);
    const reading = readClaim(w, { learningContext: f.experienceType === "LEARNING" });
    const pending: [string, Relation[]][] = [];
    let ok = true;
    for (const item of reading.items) {
      for (const cid of [item.binding.conceptId, ...item.binding.nested]) {
        const allowed = ceilingFor(cid);
        for (const a of item.asserted) {
          if (!allowed.some((e) => satisfies(e, a))) {
            ok = false;
            wordingIssues.push({ phrase: raw, conceptId: cid, asserted: a, allowed });
          }
        }
        pending.push([cid, item.asserted]);
      }
    }
    for (const u of reading.unbound) {
      if (!ceiling.some((e) => satisfies(e, u.asserted))) {
        ok = false;
        wordingIssues.push({ phrase: raw, conceptId: "", asserted: u.asserted, allowed: ceiling });
      }
    }
    if (ok) for (const [cid, rels] of pending) addRels(textBound.has(cid) ? textRels : extraRels, cid, rels);
  }

  // 4. Implied concepts inherit the relation of the concept that implies them, but never raise a concept
  //    the text itself describes ("Observed PC imaging" keeps device deployment at OBSERVED). A title held in
  //    a role fact implies its duties at their own activity level (Help Desk Technician → help desk support).
  const sources = new Map<string, Set<Relation>>([...textRels, ...extraRels]);
  for (const [cid, rels] of sources) {
    const heldTitle = isRole && getConcept(cid)?.kind === "title";
    for (const implied of impliedClosure([cid])) {
      if (implied === cid || textBound.has(implied)) continue;
      const inherited = [...rels].map((r) => (heldTitle && r === "PERFORMED" ? resolveToken("ACT", implied) : r));
      addRels(extraRels, implied, inherited);
      for (const a of assisted.get(cid) ?? []) addRels(assisted, implied, [a]);
    }
  }

  const byConcept = new Map<string, Set<Relation>>();
  for (const [cid, rels] of textRels) byConcept.set(cid, new Set(finalize(rels)));
  for (const [cid, rels] of extraRels) if (!textBound.has(cid)) byConcept.set(cid, new Set(finalize(rels)));
  return { byConcept, ceiling, wordingIssues, ignoredExplicit: [...ignored], assisted };
}

/** Can this fact back a relation word that has an object of its own ("trained new hires")? */
export function ceilingSatisfies(fr: FactRelations, claimed: Relation): boolean {
  return fr.ceiling.some((r) => satisfies(r, claimed));
}

/** Human summary like "troubleshot, repaired". */
export function describeRelations(rels: Iterable<Relation>): string {
  return [...rels]
    .sort((a, b) => RELATION_INFO[b].strength - RELATION_INFO[a].strength)
    .map((r) => RELATION_INFO[r].label)
    .join(", ");
}
