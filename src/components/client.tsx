"use client";

import { useActionState, type ReactNode } from "react";

/** A <select> that submits its form on change. */
export function AutoSubmitSelect({ name, defaultValue, options, className = "" }: { name: string; defaultValue?: string; options: { value: string; label: string }[]; className?: string }) {
  return (
    <select name={name} defaultValue={defaultValue} className={className} autoComplete="off" suppressHydrationWarning onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Submit button that asks for confirmation first. */
export function ConfirmButton({ children, message, className = "btn btn-danger btn-sm" }: { children: ReactNode; message: string; className?: string }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

export interface ClaimCheckState {
  status?: "PASSED" | "BLOCKED";
  violations?: { rule: string; phrase: string; message: string; hint?: string }[];
  licensed?: { concept: string; facts: string[] }[];
  error?: string;
}

/** Truth Gate sandbox: test a sentence against selected facts. */
export function ClaimChecker({ action, facts }: { action: (prev: ClaimCheckState, fd: FormData) => Promise<ClaimCheckState>; facts: { code: string; text: string; verified: boolean }[] }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <div className="field">
        <label htmlFor="cc-text">Statement to test</label>
        <textarea id="cc-text" name="text" rows={2} placeholder="e.g. Provided enterprise desktop support for 30 stores" required />
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_200px]">
        <div className="field">
          <label htmlFor="cc-facts">Cite evidence (hold Ctrl/Cmd to pick several)</label>
          <select id="cc-facts" name="facts" multiple size={Math.min(6, Math.max(3, facts.length))}>
            {facts.map((f) => (
              <option key={f.code} value={f.code}>
                {f.code} {f.verified ? "" : "(unverified) "}— {f.text.slice(0, 90)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cc-section">Where it would appear</label>
          <select id="cc-section" name="section" defaultValue="experience">
            <option value="experience">Experience bullet</option>
            <option value="summary">Summary</option>
            <option value="competencies">Competency</option>
            <option value="projects">Projects &amp; training</option>
            <option value="letter">Cover letter</option>
          </select>
          <button className="btn btn-primary mt-2" disabled={pending}>
            {pending ? "Checking…" : "Run Truth Gate"}
          </button>
        </div>
      </div>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state.status === "PASSED" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <strong>✓ Passed.</strong> Every phrase is supported by the cited verified evidence.
          {!!state.licensed?.length && <div className="mt-1 text-xs">Supported concepts: {state.licensed.map((l) => `${l.concept} (${l.facts.join(", ")})`).join(" · ")}</div>}
        </div>
      )}
      {state.status === "BLOCKED" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <strong>⛔ Blocked by Truth Gate</strong>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {state.violations?.map((v, i) => (
              <li key={i}>
                <span className="kbd">{v.rule}</span> {v.message}
                {v.hint && <div className="mt-0.5 text-xs text-teal-800">{v.hint}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
