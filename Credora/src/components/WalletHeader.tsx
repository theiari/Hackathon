import { ConnectButton } from "@iota/dapp-kit";
import { Shield } from "lucide-react";

export function WalletHeader({
  network,
}: {
  network: string;
}) {
  return (
    <header className="border-b border-obsidian-800/40 bg-obsidian-950">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <Shield className="h-7 w-7 text-gold-500" />
          <div>
            <h1 className="text-lg font-bold leading-tight tracking-tight text-obsidian-100">Credora</h1>
            <p className="text-[11px] leading-tight text-obsidian-500">Tamper-proof credentials on IOTA</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="rounded-full border border-gold-700/40 bg-gold-800/15 px-3 py-1 text-[11px] font-semibold tracking-wide text-gold-400 uppercase">
            {network}
          </span>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
