// Interview preparation grounded only in verified history. Scripts the
// candidate might say out loud are Claims and pass through the Truth Gate;
// coaching text is guidance and never presented as the candidate's experience.

import type { CandidateSnapshot, JobRecord, LedgerFact } from "@/lib/domain/types";
import { experienceConcepts, isProfessional } from "@/lib/evidence/ledger";
import { analyzeJob } from "@/lib/jobs/analyze";
import { factRelevance, matchJob, type RequirementMatch } from "@/lib/matching/engine";
import { conceptLabel, getConcept } from "@/lib/ontology/concepts";
import { validateClaims, type GateContext } from "@/lib/truth-gate/gate";
import type { GateReport } from "@/lib/truth-gate/types";
import { ClaimBuilder, article, conceptPhrase, lcFirst, rankedFacts, roleFactFor, stripPeriod, verifiedFacts } from "@/lib/documents/common";
import type { Claim } from "@/lib/truth-gate/types";

export interface PrepQuestion {
  question: string;
  why: string;
  framework: string;
  evidence: { code: string; text: string }[];
  scriptClaimId?: string;
}

export interface TechnicalQuestion {
  conceptId: string;
  label: string;
  status: RequirementMatch["status"];
  question: string;
  guidance: string;
  scriptClaimIds: string[];
}

export interface StarStory {
  factCode: string;
  title: string;
  situation: string;
  task: string;
  actionClaimId: string;
  result: string;
}

export interface DoNotClaim {
  phrase: string;
  reason: string;
  factCodes: string[];
}

export interface InterviewPrep {
  jobId: string;
  jobTitle: string;
  company: string;
  likelyQuestions: PrepQuestion[];
  technicalQuestions: TechnicalQuestion[];
  starStories: StarStory[];
  hardGapQuestions: TechnicalQuestion[];
  doNotClaim: DoNotClaim[];
  questionsToAsk: string[];
  claims: Claim[];
  gate: GateReport;
  generatedAt: string;
}

function factsLicensing(facts: LedgerFact[], ids: string[]): LedgerFact[] {
  // STAR stories and scripts draw only on hands-on work, never on facts that merely escalated or observed it.
  return facts.filter((f) => isProfessional(f) && !f.derived && ids.some((id) => experienceConcepts(f).has(id)));
}

export function generateInterviewPrep(s: CandidateSnapshot, job: JobRecord, opts: { now?: Date } = {}): InterviewPrep {
  const now = opts.now ?? new Date();
  const analysis = analyzeJob(job);
  const match = matchJob(s, job, { analysis, now });
  const ctx: GateContext = { facts: s.facts, job: { title: job.title, company: job.company, requirementConceptIds: analysis.requirements.map((r) => r.conceptId) } };
  const b = new ClaimBuilder();
  const facts = verifiedFacts(s);
  const relevant = rankedFacts(facts.filter((f) => isProfessional(f) && !f.derived && f.positionId), analysis).filter((f) => factRelevance(f, analysis) > 0);

  const experienceScript = (f: LedgerFact): string => {
    const role = f.positionId ? roleFactFor(s, f.positionId) : undefined;
    const pos = s.positions.find((p) => p.id === f.positionId);
    const text = pos ? `In my role as ${article(pos.title)} ${pos.title} at ${pos.employer}, I ${lcFirst(stripPeriod(f.canonicalFact))}.` : `I ${lcFirst(stripPeriod(f.canonicalFact))}.`;
    return b.add({ section: "interview", kind: "EXPERIENCE", text, supportingFactCodes: role ? [role.code, f.code] : [f.code] });
  };

  // ── Likely behavioural questions ──
  const pickFor = (ids: string[]) => factsLicensing(facts, ids).slice(0, 2).map((f) => ({ code: f.code, text: f.canonicalFact }));
  const likelyQuestions: PrepQuestion[] = [
    {
      question: "Tell me about yourself.",
      why: "Almost always the opener.",
      framework: "Present (current role in one line) → past (one relevant thread) → future (why this role). 60–90 seconds. Use only the facts below.",
      evidence: relevant.slice(0, 3).map((f) => ({ code: f.code, text: f.canonicalFact })),
    },
    {
      question: `Why are you interested in this ${job.title} role at ${job.company}?`,
      why: "Tests whether you understand the job.",
      framework: "Name two requirements from the posting you already do (verified), and one you want to grow into (be honest that it is a growth area).",
      evidence: match.requirements.filter((r) => r.status === "VERIFIED").slice(0, 3).flatMap((r) => r.factCodes.slice(0, 1).map((code) => ({ code, text: s.facts.find((f) => f.code === code)?.canonicalFact ?? "" }))),
    },
    {
      question: "Tell me about a time you solved a difficult technical problem.",
      why: "Core behavioural question for technical roles.",
      framework: "STAR: pick a real instance behind one of the facts below. Describe the steps you actually took. Do not add tools or outcomes you can't back up.",
      evidence: pickFor(["technical-troubleshooting", "hardware-troubleshooting", "network-connectivity", "help-desk-support"]),
    },
    {
      question: "Tell me about a time you dealt with a frustrated customer or coworker.",
      why: "Support roles are judged on communication.",
      framework: "STAR: acknowledge → clarify → act → follow up. Keep the channel accurate (in person vs. phone vs. email).",
      evidence: pickFor(["customer-communication", "customer-service", "phone-support"]),
    },
    {
      question: "How do you prioritise when several people need help at once?",
      why: "Tests judgement under load.",
      framework: "Impact × urgency, communicate expected wait times, escalate when blocked. Tie to a real example if you have one.",
      evidence: pickFor(["ticketing", "work-orders", "field-service", "help-desk-support"]),
    },
    {
      question: "What are you learning right now?",
      why: "Shows growth mindset — and is the right place to mention lab work honestly.",
      framework: "Describe study or lab work as study or lab work. Say what you built and what you learned, not that you did it on the job.",
      evidence: facts.filter((f) => f.experienceType === "LEARNING" || f.experienceType === "PROJECT").map((f) => ({ code: f.code, text: f.canonicalFact })),
    },
  ];
  if (relevant[0]) likelyQuestions[0].scriptClaimId = experienceScript(relevant[0]);
  for (const q of likelyQuestions) q.evidence = q.evidence.filter((e, i, arr) => e.text && arr.findIndex((x) => x.code === e.code) === i);

  // ── Technical questions per requirement ──
  const technicalQuestions: TechnicalQuestion[] = [];
  const hardGapQuestions: TechnicalQuestion[] = [];
  const seen = new Set<string>();
  for (const r of match.requirements) {
    if (seen.has(r.conceptId)) continue;
    seen.add(r.conceptId);
    const c = getConcept(r.conceptId);
    const q = c?.questions?.[0] ?? `What is your experience with ${conceptLabel(r.conceptId)}?`;
    if (r.status === "VERIFIED" || r.status === "PARTIAL") {
      if (technicalQuestions.length >= 6) continue;
      const f = s.facts.find((x) => r.factCodes.includes(x.code) && !x.derived && isProfessional(x));
      technicalQuestions.push({
        conceptId: r.conceptId,
        label: r.label,
        status: r.status,
        question: q,
        guidance:
          r.status === "PARTIAL"
            ? `Answer from the cited fact and be exact about its scope: it shows hands-on use of ${r.label}, not everything the posting names. Say what you did and what you'd learn next.`
            : "Answer from the cited fact. Walk through your actual steps; it is fine to say what you would check next.",
        scriptClaimIds: f ? [experienceScript(f)] : [],
      });
      continue;
    }
    if (hardGapQuestions.length >= 10) continue;
    const scripts: string[] = [];
    const gapText = `I haven't worked with ${conceptPhrase(r.conceptId)} professionally yet.`;
    const gapClaim = {
      section: "interview" as const,
      kind: "HONEST_GAP" as const,
      text: gapText,
      supportingFactCodes: [],
      segments: [
        { role: "connective" as const, text: "I haven't worked with" },
        { role: "target" as const, text: conceptPhrase(r.conceptId) },
        { role: "connective" as const, text: "professionally yet." },
      ],
    };
    scripts.push(b.add(gapClaim));
    if (r.status === "TRANSFERABLE" && r.transfer) {
      const candidate = `My ${conceptPhrase(r.transfer.fromConceptId)} experience`;
      const target = `the ${conceptPhrase(r.conceptId)} work in this role.`;
      scripts.push(
        b.add({
          section: "interview",
          kind: "BRIDGE",
          text: `${candidate} is relevant to ${target}`,
          supportingFactCodes: r.transfer.factCodes.slice(0, 2),
          segments: [
            { role: "candidate", text: candidate },
            { role: "connective", text: "is relevant to" },
            { role: "target", text: target },
          ],
        }),
      );
    }
    if (r.status === "LEARNING_ONLY") {
      const lf = s.facts.find((x) => r.factCodes.includes(x.code));
      if (lf) scripts.push(b.add({ section: "projects", kind: "LEARNING", text: stripPeriod(lf.canonicalFact), supportingFactCodes: [lf.code] }));
    }
    hardGapQuestions.push({
      conceptId: r.conceptId,
      label: r.label,
      status: r.status,
      question: c?.questions?.[0] ?? `Have you worked with ${conceptLabel(r.conceptId)}?`,
      guidance:
        r.status === "TRANSFERABLE"
          ? `Be direct that you haven't done ${r.label} professionally, then connect it to your ${r.transfer?.fromLabel} experience and describe how you would approach it step by step. ${r.transfer?.note ?? ""}`
          : r.status === "LEARNING_ONLY"
            ? `Say you have practised ${r.label} in study or a lab, not on the job. Describe what you built and what you learned.`
            : r.status === "EXPOSURE_ONLY"
              ? `Be precise about your role: your evidence (${r.factCodes.join(", ")}) shows you escalated, observed, assisted with or worked alongside ${r.label}, not that you did it yourself. Say exactly that, then explain what you learned from it.`
              : r.status === "NOT_VERIFIED"
              ? `Your ledger has an unverified fact about ${r.label} (${r.factCodes.join(", ")}). Verify it first; until then answer as a gap.`
              : `Be honest: “I haven't used ${r.label} yet. My approach to learning a new tool is…” then describe how you would learn it (documentation, a lab, asking teammates).`,
      scriptClaimIds: scripts,
    });
  }

  // ── STAR stories from verified history only ──
  const starStories: StarStory[] = relevant.slice(0, 4).map((f) => {
    const pos = s.positions.find((p) => p.id === f.positionId);
    return {
      factCode: f.code,
      title: stripPeriod(f.canonicalFact).slice(0, 80),
      situation: `${pos ? `At ${pos.employer} as ${article(pos.title)} ${pos.title}: ` : ""}describe one specific, real occasion — where, when, what was wrong.`,
      task: "What were you responsible for in that moment?",
      actionClaimId: experienceScript(f),
      result: /\d/.test(f.canonicalFact)
        ? "Use only the numbers already in this fact; add others only if you can verify them."
        : "Describe the real outcome in plain words. Do not invent metrics — say “the store was back up before opening” only if that is what happened.",
    };
  });

  // ── Do-not-claim warnings ──
  const doNotClaim: DoNotClaim[] = [];
  for (const r of match.requirements) {
    if (r.status === "TRANSFERABLE" && r.transfer) doNotClaim.push({ phrase: `${r.label} experience`, reason: `Your evidence supports ${r.transfer.fromLabel}, which is relevant but not the same.`, factCodes: r.transfer.factCodes.slice(0, 2) });
    else if (r.status === "LEARNING_ONLY") doNotClaim.push({ phrase: `professional ${r.label} experience`, reason: "Supported only by study or lab work.", factCodes: r.factCodes });
    else if (r.status === "PARTIAL") doNotClaim.push({ phrase: `${r.label} (full scope)`, reason: "Your evidence shows hands-on use, not the level the posting names.", factCodes: r.factCodes });
    else if (r.status === "EXPOSURE_ONLY") doNotClaim.push({ phrase: `${r.label} experience`, reason: "Your evidence only shows exposure (escalated, observed, assisted or worked alongside), not hands-on work.", factCodes: r.factCodes });
    else if (r.status === "NOT_VERIFIED") doNotClaim.push({ phrase: r.label, reason: "The supporting fact is not verified yet.", factCodes: r.factCodes });
    else if (r.status === "HARD_GAP" || r.status === "GAP") doNotClaim.push({ phrase: r.label, reason: "No evidence in your ledger.", factCodes: [] });
  }
  for (const f of relevant) for (const p of f.prohibitedExpansions) doNotClaim.push({ phrase: p, reason: `Recorded as a prohibited expansion of ${f.code}.`, factCodes: [f.code] });
  const uniqueDoNotClaim = doNotClaim.filter((d, i) => doNotClaim.findIndex((x) => x.phrase.toLowerCase() === d.phrase.toLowerCase()) === i);

  // ── Questions to ask the employer ──
  const ask = new Set<string>([
    "What does success look like in the first 90 days?",
    "What does a typical day or week look like for this role?",
  ]);
  for (const r of match.requirements) for (const q of getConcept(r.conceptId)?.askEmployer ?? []) ask.add(q);
  const gapTools = match.requirements.filter((r) => r.status !== "VERIFIED" && getConcept(r.conceptId)?.kind === "tool").map((r) => r.label);
  if (gapTools.length) ask.add(`How do new team members get up to speed on ${gapTools.slice(0, 2).join(" and ")}?`);
  ask.add("How does the team measure performance, and how is feedback given?");

  const gate = validateClaims(b.claims, ctx);
  return {
    jobId: job.id,
    jobTitle: job.title,
    company: job.company,
    likelyQuestions,
    technicalQuestions,
    starStories,
    hardGapQuestions,
    doNotClaim: uniqueDoNotClaim.slice(0, 20),
    questionsToAsk: [...ask].slice(0, 8),
    claims: b.claims,
    gate,
    generatedAt: now.toISOString(),
  };
}
