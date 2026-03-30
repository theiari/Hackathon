import type { VerifyResponse } from "../notarizationApi";

type Status = VerifyResponse["status"];

const STYLES: Record<Status, { label: string; className: string }> = {
  valid: { label: "✓ Valid", className: "border border-sage-500/50 bg-sage-900 text-sage-300" },
  revoked_on_chain: { label: "⛔ Revoked On-Chain", className: "border border-rose-500/50 bg-rose-900 text-rose-300" },
  expired: { label: "⏰ Expired", className: "border border-obsidian-600/50 bg-obsidian-800 text-obsidian-400" },
  revoked: { label: "✗ Revoked", className: "border border-rose-500/50 bg-rose-900 text-rose-300" },
  unknown_issuer: { label: "⚠ Unknown Issuer", className: "border border-gold-600/50 bg-gold-800/20 text-gold-300" },
  unknown_domain: { label: "⚠ Unknown Domain", className: "border border-gold-600/50 bg-gold-800/20 text-gold-300" },
  invalid_template: { label: "⚡ Invalid Template", className: "border border-gold-600/50 bg-gold-800/20 text-gold-300" },
  stale_template: { label: "⚡ Stale Template", className: "border border-gold-600/50 bg-gold-800/20 text-gold-300" },
  disputed: { label: "⚠ Disputed", className: "border border-gold-600/50 bg-gold-800/20 text-gold-300" },
  not_found: { label: "— Not Found", className: "border border-obsidian-600/50 bg-obsidian-800 text-obsidian-400" },
  policy_error: { label: "⚡ Policy Error", className: "border border-gold-600/50 bg-gold-800/20 text-gold-300" },
};

export function StatusBadge({ status }: { status: Status }) {
  const style = STYLES[status] ?? STYLES.policy_error;
  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${style.className}`}>{style.label}</span>;
}
