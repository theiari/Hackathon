import { useCallback, useEffect, useRef, useState } from "react";
import { getFlowValue } from "../flowState";
import { Check } from "lucide-react";

const API_BASE = import.meta.env.VITE_NOTARIZATION_API_URL ?? "http://127.0.0.1:8080";

function nonce() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeList(values: string[]) {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-gray-700">
      <button className="flex w-full items-center justify-between px-3 py-2 text-sm text-gray-100" onClick={() => setOpen((v) => !v)}>
        <span>{title}</span>
        <span>{open ? "−" : "+"}</span>
      </button>
      {open && <div className="border-t border-gray-800 p-3">{children}</div>}
    </div>
  );
}

export function PolicyAdminPanel() {
  const [apiKey, setApiKey] = useState(localStorage.getItem("credora:admin_api_key") ?? "");
  const [nonceValue, setNonceValue] = useState("");
  const [policy, setPolicy] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [domainInput, setDomainInput] = useState("");
  const [issuerInput, setIssuerInput] = useState("");
  const [blockedInput, setBlockedInput] = useState("");
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    localStorage.setItem("credora:admin_api_key", apiKey);
  }, [apiKey]);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/policy`, {
        headers: {
          "x-api-key": apiKey,
          "x-admin-nonce": nonce(),
        },
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
      setPolicy(JSON.parse(text));
      setMessage("Policy loaded");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }, [apiKey]);

  // Auto-load on mount
  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      void load();
    }
  }, [load]);

  const save = async () => {
    if (!policy) return;
    try {
      const response = await fetch(`${API_BASE}/admin/policy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-role": "policy-admin",
          "x-api-key": apiKey,
          "x-admin-nonce": nonceValue || nonce(),
          "x-idempotency-key": nonce(),
        },
        body: JSON.stringify(policy),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
      setNonceValue("");
      setMessage("Policy saved");
      setSaveSuccess(true);
      setShowSaveConfirm(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const addList = (key: "trusted_domains" | "trusted_issuers" | "blocked_issuers", value: string, setter: (v: string) => void) => {
    if (!policy || !value.trim()) return;
    setPolicy({ ...policy, [key]: normalizeList([...(policy[key] ?? []), value]) });
    setter("");
  };

  const removeList = (key: "trusted_domains" | "trusted_issuers" | "blocked_issuers", value: string) => {
    if (!policy) return;
    setPolicy({ ...policy, [key]: (policy[key] ?? []).filter((v: string) => v !== value) });
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-md">
      <h3 className="text-lg font-semibold text-white">Policy Admin</h3>
      <p className="mt-1 text-xs text-gray-400">Manage trusted domains, issuers, and blocked issuers.</p>

      {/* Auth fields (always visible) */}
      <div className="mt-4 space-y-2">
        <p className="text-xs font-medium text-gray-400">Admin Credentials</p>
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] text-gray-500">API Key</label>
            <input type="password" className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-gray-500">Admin Nonce (optional)</label>
            <input className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100" value={nonceValue} onChange={(e) => setNonceValue(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500" onClick={() => void load()}>Reload policy</button>
        <button className="rounded-lg border border-gray-600 px-3 py-2 text-xs text-gray-200 transition-colors hover:text-white" onClick={() => setDomainInput(getFlowValue("lastDomainId"))}>↙ Use last domain</button>
      </div>

      {policy && (
        <div className="mt-4 space-y-3">
          <Accordion title="Trusted Domains">
            <div className="mb-2 flex flex-wrap gap-2">
              {(policy.trusted_domains ?? []).map((value: string) => (
                <button key={value} className="rounded-full border border-gray-600 px-2 py-1 text-xs text-gray-200" onClick={() => removeList("trusted_domains", value)} title={value}>
                  {value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value} ✕
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100" placeholder="Add domain ID" value={domainInput} onChange={(e) => setDomainInput(e.target.value)} />
              <button className="rounded-lg border border-gray-600 px-3 py-2 text-xs text-indigo-300 transition-colors hover:text-indigo-200" onClick={() => addList("trusted_domains", domainInput, setDomainInput)}>Add</button>
            </div>
            <p className="mt-1 text-xs text-gray-400">Enter a domain ID (0x...) from a created CredentialDomain.</p>
          </Accordion>

          <Accordion title="Trusted Issuers">
            <div className="mb-2 flex flex-wrap gap-2">
              {(policy.trusted_issuers ?? []).map((value: string) => (
                <button key={value} className="rounded-full border border-gray-600 px-2 py-1 text-xs text-gray-200" onClick={() => removeList("trusted_issuers", value)} title={value}>
                  {value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value} ✕
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100" placeholder="Add issuer address" value={issuerInput} onChange={(e) => setIssuerInput(e.target.value)} />
              <button className="rounded-lg border border-gray-600 px-3 py-2 text-xs text-indigo-300 transition-colors hover:text-indigo-200" onClick={() => addList("trusted_issuers", issuerInput, setIssuerInput)}>Add</button>
            </div>
            <p className="mt-1 text-xs text-gray-400">Enter an IOTA wallet address of a trusted issuing institution.</p>
          </Accordion>

          <Accordion title="Blocked Issuers">
            <div className="mb-2 flex flex-wrap gap-2">
              {(policy.blocked_issuers ?? []).map((value: string) => (
                <button key={value} className="rounded-full border border-red-700 bg-red-950/30 px-2 py-1 text-xs text-red-200" onClick={() => removeList("blocked_issuers", value)} title={value}>
                  {value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value} ✕
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100" placeholder="Add blocked issuer" value={blockedInput} onChange={(e) => setBlockedInput(e.target.value)} />
              <button className="rounded-lg border border-red-700 px-3 py-2 text-xs text-red-300 transition-colors hover:text-red-200" onClick={() => addList("blocked_issuers", blockedInput, setBlockedInput)}>Add</button>
            </div>
            <p className="mt-1 text-xs text-gray-400">Credentials from blocked issuers always fail verification.</p>
          </Accordion>

          {/* Save with confirmation */}
          {!showSaveConfirm ? (
            <button
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
              onClick={() => setShowSaveConfirm(true)}
            >
              Save policy
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-amber-700/40 bg-amber-900/10 px-3 py-2">
              <p className="text-xs text-amber-300">Save changes to trust policy?</p>
              <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white" onClick={() => void save()}>Confirm</button>
              <button className="text-xs text-gray-400 hover:text-gray-200" onClick={() => setShowSaveConfirm(false)}>Cancel</button>
            </div>
          )}

          {saveSuccess && (
            <div className="flex items-center gap-1.5 text-xs text-green-400">
              <Check className="h-3.5 w-3.5" />
              Policy saved successfully
            </div>
          )}
        </div>
      )}

      {message && !saveSuccess && (
        <p className="mt-3 text-xs text-gray-400">{message}</p>
      )}
    </div>
  );
}
