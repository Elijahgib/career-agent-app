"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { importResumeFileAction } from "@/app/actions";

const ACCEPT = ".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

function SubmitButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary btn-sm" disabled={pending || !ready}>
      {pending ? "Parsing your resume…" : "Import & review"}
    </button>
  );
}

/** Modern resume upload: the whole card is clickable, supports drag-and-drop, and shows the
 *  chosen filename + parsing state. Parsing happens locally on the server (never sent to AI). */
export function ResumeDropzone({ returnTo, withPaste = false }: { returnTo: "onboarding" | "evidence"; withPaste?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [paste, setPaste] = useState("");
  const [over, setOver] = useState(false);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      inputRef.current.files = dt.files;
      setName(file.name);
    }
  }

  return (
    <form action={importResumeFileAction} className="grid gap-2">
      <input type="hidden" name="returnTo" value={returnTo} />
      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-7 text-center transition-colors ${over ? "border-brand bg-brand/5" : "border-line bg-slate-50/60 hover:border-brand/60 hover:bg-slate-100"}`}
      >
        <span aria-hidden className="text-2xl">⬆</span>
        <span className="text-sm font-semibold">Drop your resume here</span>
        <span className="text-xs text-muted">or click anywhere to browse</span>
        <span className="mt-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium tracking-wide text-slate-600">PDF · DOCX · TXT · MD</span>
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => setName(e.target.files?.[0]?.name ?? "")}
        />
      </label>
      {name && <div className="text-xs text-slate-700">Selected: <strong>{name}</strong></div>}
      {withPaste && (
        <details className="text-xs">
          <summary className="cursor-pointer text-brand">…or paste resume text instead</summary>
          <textarea name="text" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} className="mt-1 w-full" placeholder={"Paste the text of your resume here"} />
        </details>
      )}
      <div className="flex items-center gap-2">
        <SubmitButton ready={!!name || paste.trim().length > 0} />
      </div>
      <p className="text-[11px] text-muted">Parsed locally on this machine — never sent to any AI. Everything imported is UNVERIFIED for your review; missing dates or employers are never invented.</p>
    </form>
  );
}
