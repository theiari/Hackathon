import { getCurrentStep } from "../flowState";

const STEPS = [
  { id: 1, icon: "🏛", label: "Set Up Institution", tab: "issue" },
  { id: 2, icon: "📋", label: "Publish Template", tab: "issue" },
  { id: 3, icon: "🎓", label: "Issue Certificate", tab: "issue" },
  { id: 4, icon: "👛", label: "Open Holder View", tab: "holder" },
  { id: 5, icon: "🔗", label: "Verify By Link", tab: "verify" },
] as const;

const HINTS: Record<number, string> = {
  1: "Start by registering the institution profile that will issue degrees or certificates.",
  2: "Define the certificate template and the student fields your institution will publish.",
  3: "Issue a certificate record by anchoring the template data on IOTA.",
  4: "Open the holder view to copy a verification link or create a signed proof.",
  5: "Paste a certificate record ID to verify it from a normal browser.",
};

export function GettingStarted({
  completedSteps,
  onNavigate,
}: {
  completedSteps: Set<number>;
  onNavigate: (tab: "issue" | "holder" | "verify") => void;
}) {
  const completed = completedSteps;
  const current = getCurrentStep(completed);

  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      <div className="rounded-xl border border-obsidian-700 bg-obsidian-900 p-4">
        <div className="grid gap-2 md:grid-cols-5">
          {STEPS.map((step) => {
            const done = completed.has(step.id);
            const active = !done && step.id === current;
            return (
              <button
                key={step.id}
                onClick={() => (done || active) && onNavigate(step.tab)}
                className={`rounded-lg border px-3 py-2 text-left ${done ? "border-sage-700 bg-sage-950/30 text-obsidian-300" : active ? "border-gold-600 bg-gold-800/30 text-obsidian-100 shadow-md shadow-obsidian-950" : "border-obsidian-700 bg-obsidian-950/50 text-obsidian-500"}`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${done ? "border-sage-500 text-sage-300" : active ? "border-gold-400 text-gold-300" : "border-obsidian-600 text-obsidian-500"}`}>
                    {done ? "✓" : step.id}
                  </span>
                  <span>{step.icon}</span>
                </div>
                <p className="mt-1 text-xs font-semibold">{step.label}</p>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-obsidian-300">{HINTS[current]}</p>
      </div>
    </div>
  );
}
