import type { VerifyResponse } from "../notarizationApi";

type Status = VerifyResponse["status"];

const STYLES: Record<Status, { label: string; className: string }> = {
  valid: { label: "✓ Valid", className: "border border-green-700 bg-green-900 text-green-300" },
  revoked_on_chain: { label: "⛔ Revoked On-Chain", className: "border border-red-800 bg-red-950 text-red-300" },
  expired: { label: "⏰ Expired", className: "border border-gray-700 bg-gray-800 text-gray-400" },
  revoked: { label: "✗ Revoked", className: "border border-red-700 bg-red-900 text-red-300" },
  unknown_issuer: { label: "⚠ Unknown Issuer", className: "border border-yellow-700 bg-yellow-900 text-yellow-300" },
  unknown_domain: { label: "⚠ Unknown Domain", className: "border border-yellow-700 bg-yellow-900 text-yellow-300" },
  invalid_template: { label: "⚡ Invalid Template", className: "border border-orange-700 bg-orange-900 text-orange-300" },
  stale_template: { label: "⚡ Stale Template", className: "border border-orange-700 bg-orange-900 text-orange-300" },
  disputed: { label: "⚠ Disputed", className: "border border-purple-700 bg-purple-900 text-purple-300" },
  not_found: { label: "— Not Found", className: "border border-gray-700 bg-gray-800 text-gray-400" },
  policy_error: { label: "⚡ Policy Error", className: "border border-orange-700 bg-orange-900 text-orange-300" },
};

export function StatusBadge({ status }: { status: Status }) {
  const style = STYLES[status] ?? STYLES.policy_error;
  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${style.className}`}>{style.label}</span>;
}
