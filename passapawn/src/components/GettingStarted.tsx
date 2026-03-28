import { getCurrentStep } from "../flowState";

const STEPS = [
  { id: 1, icon: "🏛", label: "Create Domain", tab: "issue" },
  { id: 2, icon: "📋", label: "Publish Template", tab: "issue" },
  { id: 3, icon: "🎓", label: "Issue Credential", tab: "issue" },
  { id: 4, icon: "👛", label: "View as Holder", tab: "holder" },
  { id: 5, icon: "🔗", label: "Verify (share link)", tab: "verify" },
] as const;

const HINTS: Record<number, string> = {
  1: "Start by creating a credential domain for your institution.",
  2: "Define the credential template (fields, types) your domain will issue.",
  3: "Issue a credential by notarizing data against your template.",
  4: "Connect as the recipient wallet to see credentials you own.",
  5: "Paste a notarization ID to verify it, then share the link.",
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
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="grid gap-2 md:grid-cols-5">
          {STEPS.map((step) => {
            const done = completed.has(step.id);
            const active = !done && step.id === current;
            return (
              <button
                key={step.id}
                onClick={() => (done || active) && onNavigate(step.tab)}
                className={`rounded-lg border px-3 py-2 text-left ${done ? "border-green-700 bg-green-950/30 text-gray-300" : active ? "border-indigo-500 bg-indigo-950/30 text-white shadow-md shadow-indigo-950" : "border-gray-700 bg-gray-950/50 text-gray-500"}`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${done ? "border-green-500 text-green-300" : active ? "border-indigo-400 text-indigo-200" : "border-gray-600 text-gray-500"}`}>
                    {done ? "✓" : step.id}
                  </span>
                  <span>{step.icon}</span>
                </div>
                <p className="mt-1 text-xs font-semibold">{step.label}</p>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-gray-300">{HINTS[current]}</p>
      </div>
    </div>
  );
}
