import { useState } from "react";
import { ClipboardCheck, FileSearch, Zap, ChevronRight } from "lucide-react";

const API_BASE = import.meta.env.VITE_NOTARIZATION_API_URL ?? "http://127.0.0.1:8080";

function nonce() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const STEPS = [
  { label: "Request", icon: ClipboardCheck, description: "Submit onboarding request" },
  { label: "Review", icon: FileSearch, description: "Approve or reject" },
  { label: "Activate", icon: Zap, description: "Activate issuer" },
] as const;

export function OnboardingAdminPanel() {
  const [apiKey, setApiKey] = useState(localStorage.getItem("credora:admin_api_key") ?? "");
  const [adminNonce, setAdminNonce] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [issuerProfile, setIssuerProfile] = useState("");
  const [domainMapping, setDomainMapping] = useState("");
  const [signerVerification, setSignerVerification] = useState("");
  const [openedBy, setOpenedBy] = useState("onboarding-admin");
  const [onboardingId, setOnboardingId] = useState("");
  const [message, setMessage] = useState("");
  const [step, setStep] = useState(0);

  const call = async (path: string, body?: unknown) => {
    localStorage.setItem("credora:admin_api_key", apiKey);
    const response = await fetch(`${API_BASE}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "x-role": "onboarding-admin",
        "x-api-key": apiKey,
        "x-admin-nonce": adminNonce || nonce(),
        "x-idempotency-key": nonce(),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
    return text;
  };

  return (
    <div className="rounded-xl border border-obsidian-700 bg-obsidian-900 p-6 shadow-md">
      <h3 className="text-lg font-semibold text-obsidian-100">Onboarding Admin</h3>

      {/* Step indicator */}
      <div className="mt-4 flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s.label} className="flex items-center gap-1">
            <button
              onClick={() => setStep(i)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                i === step
                  ? "bg-gold-800/20 text-gold-400 border border-gold-600/40"
                  : "text-obsidian-500 hover:text-obsidian-300"
              }`}
            >
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </button>
            {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-obsidian-700" />}
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-obsidian-500">{STEPS[step].description}</p>

      {/* Auth fields (always visible) */}
      <div className="mt-4 space-y-2">
        <p className="text-xs font-medium text-obsidian-400">Admin Credentials</p>
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] text-obsidian-500">API Key</label>
            <input className="w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3 py-2 text-sm text-obsidian-100" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-obsidian-500">Admin Nonce (optional)</label>
            <input className="w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3 py-2 text-sm text-obsidian-100" value={adminNonce} onChange={(e) => setAdminNonce(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Step 0: Request */}
      {step === 0 && (
        <div className="mt-4 space-y-2">
          <div>
            <label className="mb-1 block text-[11px] text-obsidian-500">Organization Name</label>
            <input className="w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3 py-2 text-sm text-obsidian-100" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-obsidian-500">Issuer Profile</label>
            <input className="w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3 py-2 text-sm text-obsidian-100" value={issuerProfile} onChange={(e) => setIssuerProfile(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-obsidian-500">Domain Mapping</label>
            <input className="w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3 py-2 text-sm text-obsidian-100" value={domainMapping} onChange={(e) => setDomainMapping(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-obsidian-500">Signer Verification</label>
            <input className="w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3 py-2 text-sm text-obsidian-100" value={signerVerification} onChange={(e) => setSignerVerification(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-obsidian-500">Opened By</label>
            <input className="w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3 py-2 text-sm text-obsidian-100" value={openedBy} onChange={(e) => setOpenedBy(e.target.value)} />
          </div>
          <button
            className="mt-2 rounded-lg bg-gold-500 px-4 py-2 text-xs font-semibold text-obsidian-100 transition-colors hover:bg-gold-400"
            onClick={async () => {
              try {
                const out = await call("/api/v2/onboarding/request", {
                  organization_name: organizationName,
                  issuer_profile: issuerProfile,
                  domain_mapping: domainMapping,
                  signer_verification: signerVerification,
                  opened_by: openedBy,
                });
                setMessage(out);
                setStep(1);
              } catch (e) {
                setMessage(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Submit Request
          </button>
        </div>
      )}

      {/* Step 1: Review */}
      {step === 1 && (
        <div className="mt-4 space-y-2">
          <div>
            <label className="mb-1 block text-[11px] text-obsidian-500">Onboarding ID</label>
            <input className="w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3 py-2 text-sm text-obsidian-100" value={onboardingId} onChange={(e) => setOnboardingId(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-lg bg-sage-700/80 px-4 py-2 text-xs font-semibold text-obsidian-100 transition-colors hover:bg-sage-600"
              onClick={async () => {
                try {
                  setMessage(await call("/api/v2/onboarding/review", { onboarding_id: onboardingId, reviewed_by: openedBy, approve: true, review_note: "approved" }));
                  setStep(2);
                } catch (e) {
                  setMessage(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              Approve
            </button>
            <button
              className="rounded-lg border border-rose-700/60 px-4 py-2 text-xs text-rose-300 transition-colors hover:bg-rose-900/20"
              onClick={async () => {
                try {
                  setMessage(await call("/api/v2/onboarding/review", { onboarding_id: onboardingId, reviewed_by: openedBy, approve: false, review_note: "rejected" }));
                } catch (e) {
                  setMessage(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Activate */}
      {step === 2 && (
        <div className="mt-4 space-y-2">
          <div>
            <label className="mb-1 block text-[11px] text-obsidian-500">Onboarding ID</label>
            <input className="w-full rounded-lg border border-obsidian-700 bg-obsidian-950 px-3 py-2 text-sm text-obsidian-100" value={onboardingId} onChange={(e) => setOnboardingId(e.target.value)} />
          </div>
          <button
            className="rounded-lg bg-gold-500 px-4 py-2 text-xs font-semibold text-obsidian-100 transition-colors hover:bg-gold-400"
            onClick={async () => {
              try {
                setMessage(await call("/api/v2/onboarding/activate", { onboarding_id: onboardingId, activated_by: openedBy }));
              } catch (e) {
                setMessage(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Activate
          </button>
        </div>
      )}

      {/* Summary button (always visible) */}
      <div className="mt-4">
        <button
          className="rounded-lg border border-obsidian-700 px-3 py-2 text-xs text-obsidian-300 transition-colors hover:text-obsidian-100 hover:border-obsidian-500"
          onClick={async () => {
            try { setMessage(await call("/api/v2/onboarding/summary")); }
            catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
          }}
        >
          View Summary
        </button>
      </div>

      {/* Output card */}
      {message && (
        <div className="mt-4 rounded-lg border border-obsidian-700/50 bg-obsidian-950/80 p-3">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-obsidian-500">Response</p>
          <pre className="max-h-48 overflow-auto text-xs text-obsidian-300 whitespace-pre-wrap">{message}</pre>
        </div>
      )}
    </div>
  );
}
