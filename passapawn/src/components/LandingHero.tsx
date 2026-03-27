export function LandingHero({ connected, packageId }: { connected: boolean; packageId: string }) {
  if (connected) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="rounded-xl border border-gray-700 bg-gray-900/80 px-4 py-3 text-sm text-gray-200">
          Passapawn • IOTA devnet • Package: {packageId}
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4">
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-md">
        <span className="inline-flex rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">Built on the IOTA Notarization Framework</span>
        <h2 className="mt-4 text-3xl font-bold text-white">Passapawn — Tamper-Proof Credentials, Powered by IOTA</h2>
        <p className="mt-2 max-w-3xl text-gray-300">Issue verifiable credentials for schools and clinics in seconds. Trust is governed by domain-scoped policy, not by a central authority.</p>
        <p className="mt-4 text-indigo-300">Connect your IOTA Wallet to get started →</p>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-gray-700 bg-gray-950/50 p-5">
            <h3 className="text-lg font-semibold text-white">🎓 Certification Schools</h3>
            <p className="mt-2 text-sm text-gray-300">Language proficiency (B2, CEFR), exam results, completion certificates.</p>
            <p className="mt-2 text-sm text-indigo-300">Issue diplomas that no institution can forge or deny.</p>
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-950/50 p-5">
            <h3 className="text-lg font-semibold text-white">🐾 Animal Clinics</h3>
            <p className="mt-2 text-sm text-gray-300">Vaccination records, ownership certificates, treatment histories.</p>
            <p className="mt-2 text-sm text-indigo-300">Prove an animal's health history to any vet, anywhere.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-gray-700 p-4"><p className="font-semibold">🏫 Institution issues credential</p><p className="mt-1 text-sm text-gray-300">Domain signers approve a template. One transaction notarizes the record on IOTA.</p></div>
          <div className="rounded-lg border border-gray-700 p-4"><p className="font-semibold">👛 Holder receives it in their wallet</p><p className="mt-1 text-sm text-gray-300">The credential appears instantly in the recipient's IOTA wallet as an on-chain object.</p></div>
          <div className="rounded-lg border border-gray-700 p-4"><p className="font-semibold">🔗 Anyone verifies via a link</p><p className="mt-1 text-sm text-gray-300">Share one URL. The verifier sees a trust verdict — no wallet, no app, no blockchain knowledge needed.</p></div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-indigo-500/40 bg-indigo-950/20 p-4">
            <p className="text-sm font-semibold text-indigo-200">If you are an Institution</p>
            <p className="mt-1 text-xs text-gray-300">Go to Issue tab: create domain, define template, then issue a credential.</p>
          </div>
          <div className="rounded-lg border border-indigo-500/40 bg-indigo-950/20 p-4">
            <p className="text-sm font-semibold text-indigo-200">If you are a Credential Holder</p>
            <p className="mt-1 text-xs text-gray-300">Open My Credentials tab to see credentials tied to your wallet and share them.</p>
          </div>
          <div className="rounded-lg border border-indigo-500/40 bg-indigo-950/20 p-4">
            <p className="text-sm font-semibold text-indigo-200">If you are a Verifier</p>
            <p className="mt-1 text-xs text-gray-300">Use the Verify tab or open a ?verify= link to check trust status without a wallet.</p>
          </div>
        </div>

        <details className="mt-6 rounded-lg border border-gray-700 p-4">
          <summary className="cursor-pointer font-semibold text-white">Under the hood</summary>
          <p className="mt-2 text-sm text-gray-300">Passapawn uses the official IOTA Notarization Framework for cryptographic proofs. Off-chain trust policy (allowlisted domains, issuers, templates) governs verification verdicts without controlling who can issue — preserving permissionlessness.</p>
        </details>
      </div>
    </section>
  );
}
