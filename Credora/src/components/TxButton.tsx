import type { ReactNode } from "react";

export type TxState = "idle" | "waiting_wallet" | "pending_chain" | "success" | "failure";

const STATE_CLASS: Record<TxState, string> = {
  idle: "bg-gold-500 hover:bg-gold-400 text-obsidian-950",
  waiting_wallet: "bg-gold-600/60 cursor-wait animate-subtle-pulse text-obsidian-100",
  pending_chain: "bg-gold-600/60 cursor-wait animate-subtle-pulse text-obsidian-100",
  success: "bg-sage-500/80 text-obsidian-100",
  failure: "bg-rose-500/80 text-obsidian-100",
};

const STATE_LABEL: Record<TxState, string | null> = {
  idle: null,
  waiting_wallet: "Waiting for wallet…",
  pending_chain: "Confirming on IOTA…",
  success: "Done ✓",
  failure: "Failed — retry",
};

export function TxButton({
  state,
  onClick,
  children,
  disabled,
  className,
}: {
  state: TxState;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || state === "waiting_wallet" || state === "pending_chain"}
      className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${STATE_CLASS[state]} disabled:opacity-50 ${className ?? ""}`}
    >
      {STATE_LABEL[state] ?? children}
    </button>
  );
}
