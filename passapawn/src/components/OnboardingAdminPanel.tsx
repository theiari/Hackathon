import { useState } from "react";

const API_BASE = import.meta.env.VITE_NOTARIZATION_API_URL ?? "http://127.0.0.1:8080";

function nonce() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function OnboardingAdminPanel() {
  const [apiKey, setApiKey] = useState(localStorage.getItem("passapawn:admin_api_key") ?? "");
  const [adminNonce, setAdminNonce] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [issuerProfile, setIssuerProfile] = useState("");
  const [domainMapping, setDomainMapping] = useState("");
  const [signerVerification, setSignerVerification] = useState("");
  const [openedBy, setOpenedBy] = useState("onboarding-admin");
  const [onboardingId, setOnboardingId] = useState("");
  const [message, setMessage] = useState("Ready");

  const call = async (path: string, body?: unknown) => {
    localStorage.setItem("passapawn:admin_api_key", apiKey);
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
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-md">
      <h3 className="text-lg font-semibold text-white">Onboarding Admin</h3>
      <details className="mt-3 rounded-lg border border-gray-700 p-3">
        <summary className="cursor-pointer text-sm text-gray-100">Admin credentials</summary>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <input className="border border-gray-300 rounded-lg px-3 py-2 bg-gray-950" type="password" placeholder="Admin API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <input className="border border-gray-300 rounded-lg px-3 py-2 bg-gray-950" placeholder="Admin Nonce" value={adminNonce} onChange={(e) => setAdminNonce(e.target.value)} />
        </div>
        <p className="mt-1 text-xs text-gray-400">These are required for all admin write operations.</p>
      </details>
      <div className="mt-3 grid gap-2">
        <input className="border border-gray-300 rounded-lg px-3 py-2 bg-gray-950" placeholder="Organization" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} />
        <input className="border border-gray-300 rounded-lg px-3 py-2 bg-gray-950" placeholder="Issuer profile" value={issuerProfile} onChange={(e) => setIssuerProfile(e.target.value)} />
        <input className="border border-gray-300 rounded-lg px-3 py-2 bg-gray-950" placeholder="Domain mapping" value={domainMapping} onChange={(e) => setDomainMapping(e.target.value)} />
        <input className="border border-gray-300 rounded-lg px-3 py-2 bg-gray-950" placeholder="Signer verification" value={signerVerification} onChange={(e) => setSignerVerification(e.target.value)} />
        <input className="border border-gray-300 rounded-lg px-3 py-2 bg-gray-950" placeholder="Opened by" value={openedBy} onChange={(e) => setOpenedBy(e.target.value)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"
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
            } catch (e) {
              setMessage(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          Request
        </button>
        <input className="border border-gray-300 rounded-lg px-3 py-2 bg-gray-950" placeholder="Onboarding ID" value={onboardingId} onChange={(e) => setOnboardingId(e.target.value)} />
        <button className="rounded-lg border border-gray-600 px-3 py-2 text-xs" onClick={async () => {
          try {
            setMessage(await call("/api/v2/onboarding/review", { onboarding_id: onboardingId, reviewed_by: openedBy, approve: true, review_note: "approved" }));
          } catch (e) {
            setMessage(e instanceof Error ? e.message : String(e));
          }
        }}>Approve</button>
        <button className="rounded-lg border border-gray-600 px-3 py-2 text-xs" onClick={async () => {
          try {
            setMessage(await call("/api/v2/onboarding/activate", { onboarding_id: onboardingId, activated_by: openedBy }));
          } catch (e) {
            setMessage(e instanceof Error ? e.message : String(e));
          }
        }}>Activate</button>
        <button className="rounded-lg border border-gray-600 px-3 py-2 text-xs" onClick={async () => {
          try {
            setMessage(await call("/api/v2/onboarding/summary"));
          } catch (e) {
            setMessage(e instanceof Error ? e.message : String(e));
          }
        }}>Summary</button>
      </div>
      <pre className="mt-3 max-h-48 overflow-auto rounded bg-gray-950 p-3 text-xs text-gray-300">{message}</pre>
    </div>
  );
}
