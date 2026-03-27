import type { ReactNode } from "react";

export type TxState = "idle" | "waiting_wallet" | "pending_chain" | "success" | "failure";

const STATE_CLASS: Record<TxState, string> = {
  idle: "bg-indigo-600 hover:bg-indigo-500",
  waiting_wallet: "bg-yellow-600 cursor-wait animate-pulse",
  pending_chain: "bg-blue-600 cursor-wait animate-pulse",
  success: "bg-green-700",
  failure: "bg-red-700",
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
      className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${STATE_CLASS[state]} disabled:opacity-60 ${className ?? ""}`}
    >
      {STATE_LABEL[state] ?? children}
    </button>
  );
}
