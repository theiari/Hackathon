import { useState } from "react";

export function FieldHelp({ text, example }: { text: string; example?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-obsidian-600 text-[10px] text-obsidian-300"
        aria-label="Field help"
      >
        ?
      </button>
      {open && (
        <span className="absolute left-5 top-0 z-50 w-64 rounded-lg border border-obsidian-700 bg-obsidian-950 p-2 text-xs text-obsidian-200 shadow-lg">
          {text}
          {example && <span className="mt-1 block font-mono text-obsidian-400">Example: {example}</span>}
        </span>
      )}
    </span>
  );
}
