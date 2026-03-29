import { ConnectButton } from "@iota/dapp-kit";
import { Shield } from "lucide-react";

export function WalletHeader({
  network,
}: {
  network: string;
}) {
  return (
    <header className="border-b border-gray-800/50 bg-gray-950">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Shield className="h-7 w-7 text-indigo-400" />
          <div>
            <h1 className="text-lg font-bold leading-tight text-white">Credora</h1>
            <p className="text-[11px] leading-tight text-gray-500">Tamper-proof credentials on IOTA</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-medium text-indigo-300">
            {network}
          </span>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
