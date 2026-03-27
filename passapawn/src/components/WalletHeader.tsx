import { ConnectButton } from "@iota/dapp-kit";

export function WalletHeader({
  network,
  packageId,
  connected,
}: {
  network: string;
  packageId: string;
  connected: boolean;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Passapawn</h1>
        <p className="text-xs text-gray-400">Tamper-proof credentials, powered by IOTA</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="rounded-full border border-indigo-400/50 bg-indigo-900/40 px-3 py-1 text-xs text-indigo-200">
          {network}
        </span>
        <span className="max-w-[320px] truncate rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300">
          Package: {packageId}
        </span>
        <ConnectButton />
      </div>
      {connected && (
        <p className="w-full text-xs text-green-300">Wallet connected • You can issue and manage credentials</p>
      )}
    </div>
  );
}
