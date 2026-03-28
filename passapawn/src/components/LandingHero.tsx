import {
  Shield, Share2, Wallet, ArrowRight, GraduationCap, Stethoscope,
  Lock, Globe, Fingerprint, Key, Layers, Database, Zap,
} from "lucide-react";

export function LandingHero({
  connected,
  onNavigate,
}: {
  connected: boolean;
  onNavigate: (tab: string) => void;
}) {
  /* ── Connected: quick-nav cards ── */
  if (connected) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-400">Welcome back. Choose where to start:</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <button
            onClick={() => onNavigate("issue")}
            className="group flex flex-col gap-2 rounded-2xl border border-gray-800/60 bg-gray-900/60 p-5 text-left transition-colors hover:border-indigo-500/40 hover:bg-indigo-950/20"
          >
            <Shield className="h-6 w-6 text-indigo-400" />
            <p className="text-sm font-semibold text-white">Issue Credentials</p>
            <p className="text-xs text-gray-400">Create a domain and publish tamper-proof credentials on-chain.</p>
            <span className="mt-auto flex items-center gap-1 text-xs text-indigo-400 opacity-0 transition-opacity group-hover:opacity-100">
              Go <ArrowRight className="h-3 w-3" />
            </span>
          </button>
          <button
            onClick={() => onNavigate("holder")}
            className="group flex flex-col gap-2 rounded-2xl border border-gray-800/60 bg-gray-900/60 p-5 text-left transition-colors hover:border-indigo-500/40 hover:bg-indigo-950/20"
          >
            <Wallet className="h-6 w-6 text-indigo-400" />
            <p className="text-sm font-semibold text-white">My Credentials</p>
            <p className="text-xs text-gray-400">View credentials in your wallet and share them with anyone.</p>
            <span className="mt-auto flex items-center gap-1 text-xs text-indigo-400 opacity-0 transition-opacity group-hover:opacity-100">
              Go <ArrowRight className="h-3 w-3" />
            </span>
          </button>
          <button
            onClick={() => onNavigate("verify")}
            className="group flex flex-col gap-2 rounded-2xl border border-gray-800/60 bg-gray-900/60 p-5 text-left transition-colors hover:border-indigo-500/40 hover:bg-indigo-950/20"
          >
            <Share2 className="h-6 w-6 text-indigo-400" />
            <p className="text-sm font-semibold text-white">Verify</p>
            <p className="text-xs text-gray-400">Check any credential's authenticity — no wallet needed.</p>
            <span className="mt-auto flex items-center gap-1 text-xs text-indigo-400 opacity-0 transition-opacity group-hover:opacity-100">
              Go <ArrowRight className="h-3 w-3" />
            </span>
          </button>
        </div>
      </div>
    );
  }

  /* ── Disconnected: full landing page for judges ── */
  return (
    <section className="space-y-10">
      {/* ── A. Hero Banner ── */}
      <div className="rounded-2xl border border-gray-800/60 bg-gradient-to-br from-gray-900 via-gray-900 to-indigo-950/30 p-8">
        <span className="inline-block rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
          Built on IOTA Notarization + Identity + Account Abstraction
        </span>
        <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Tamper-Proof Credentials,<br />Verified by Anyone
        </h2>
        <p className="mt-3 max-w-2xl text-gray-400">
          Passapawn notarizes credential references on IOTA using hash-first payloads — no raw
          personal data ever touches the ledger. Verification is trustless, instant, and governed
          by domain-scoped trust policy. Share a single URL and anyone can verify — no wallet,
          no app, no blockchain knowledge required.
        </p>
        <p className="mt-5 text-sm font-medium text-indigo-300">
          Connect your IOTA Wallet to get started <ArrowRight className="mb-0.5 ml-1 inline h-4 w-4" />
        </p>
      </div>

      {/* ── B. Problem / Solution ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-red-900/30 bg-red-950/10 p-6">
          <Database className="mb-3 h-7 w-7 text-red-400" />
          <h3 className="text-base font-semibold text-white">The Problem</h3>
          <ul className="mt-3 space-y-2 text-sm text-gray-400">
            <li className="flex items-start gap-2"><span className="mt-0.5 text-red-400">✗</span> Paper documents and centralized databases are easy to forge</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-red-400">✗</span> Slow verification — phone calls, emails, weeks of waiting</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-red-400">✗</span> GDPR risk from duplicating sensitive data across organizations</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-green-900/30 bg-green-950/10 p-6">
          <Shield className="mb-3 h-7 w-7 text-green-400" />
          <h3 className="text-base font-semibold text-white">The Solution</h3>
          <ul className="mt-3 space-y-2 text-sm text-gray-400">
            <li className="flex items-start gap-2"><span className="mt-0.5 text-green-400">✓</span> Issue credential references on-chain (hash only, no raw PII)</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-green-400">✓</span> Verify from any browser with a shareable link — no wallet needed</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-green-400">✓</span> Trust governed by domain policy, not a central authority</li>
          </ul>
        </div>
      </div>

      {/* ── C. Architecture Diagram ── */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white">Architecture</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col items-center rounded-xl border border-indigo-800/40 bg-indigo-950/20 p-4 text-center">
            <Globe className="mb-2 h-6 w-6 text-indigo-400" />
            <p className="text-sm font-medium text-white">Browser / React</p>
            <p className="mt-1 text-xs text-gray-500">IOTA dApp Kit + Tailwind UI</p>
          </div>
          <div className="flex flex-col items-center rounded-xl border border-indigo-800/40 bg-indigo-950/20 p-4 text-center">
            <Layers className="mb-2 h-6 w-6 text-indigo-400" />
            <p className="text-sm font-medium text-white">IOTA Devnet</p>
            <p className="mt-1 text-xs text-gray-500">Move Smart Contracts</p>
          </div>
          <div className="flex flex-col items-center rounded-xl border border-indigo-800/40 bg-indigo-950/20 p-4 text-center">
            <Zap className="mb-2 h-6 w-6 text-indigo-400" />
            <p className="text-sm font-medium text-white">Rust / Axum Backend</p>
            <p className="mt-1 text-xs text-gray-500">Trust Policy + DID Resolver</p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
          <span>Wallet TX ↓</span>
          <span className="text-gray-700">|</span>
          <span>↑ RPC Queries</span>
          <span className="text-gray-700">|</span>
          <span>↔ Policy JSON + Governance</span>
        </div>
      </div>

      {/* ── D. IOTA Frameworks Used ── */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white">IOTA Frameworks Used</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-800/60 bg-gray-900/60 p-5">
            <Shield className="mb-2 h-6 w-6 text-indigo-400" />
            <p className="text-sm font-semibold text-white">IOTA Notarization</p>
            <p className="mt-2 text-xs text-gray-400">
              Credentials are notarized on-chain with configurable payload strategies (hash or raw).
              Verification is trustless and instant.
            </p>
          </div>
          <div className="rounded-2xl border border-gray-800/60 bg-gray-900/60 p-5">
            <Fingerprint className="mb-2 h-6 w-6 text-indigo-400" />
            <p className="text-sm font-semibold text-white">IOTA Identity (DID)</p>
            <p className="mt-2 text-xs text-gray-400">
              Domain authorities are linked to W3C-compliant DID documents on IOTA.
              Each credential domain has a resolvable decentralized identifier.
            </p>
          </div>
          <div className="rounded-2xl border border-gray-800/60 bg-gray-900/60 p-5">
            <Key className="mb-2 h-6 w-6 text-indigo-400" />
            <p className="text-sm font-semibold text-white">Account Abstraction (AA)</p>
            <p className="mt-2 text-xs text-gray-400">
              Multi-signature governance for credential domains. k-of-n Ed25519
              authenticator protects domain operations.
            </p>
          </div>
        </div>
      </div>

      {/* ── E. Target Customers ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-800/60 bg-gray-900/60 p-6">
          <GraduationCap className="mb-3 h-8 w-8 text-indigo-400" />
          <h3 className="text-base font-semibold text-white">Certification Schools</h3>
          <p className="mt-2 text-sm text-gray-400">
            Language proficiency (B2, CEFR), exam results, completion certificates.
          </p>
          <p className="mt-2 text-sm text-indigo-300/80">Issue diplomas that no institution can forge or deny.</p>
        </div>
        <div className="rounded-2xl border border-gray-800/60 bg-gray-900/60 p-6">
          <Stethoscope className="mb-3 h-8 w-8 text-indigo-400" />
          <h3 className="text-base font-semibold text-white">Animal Clinics</h3>
          <p className="mt-2 text-sm text-gray-400">
            Vaccination records, ownership certificates, treatment histories.
          </p>
          <p className="mt-2 text-sm text-indigo-300/80">Prove an animal's health history to any vet, anywhere.</p>
        </div>
      </div>

      {/* ── F. How It Works ── */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white">How It Works</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-800/40 bg-gray-900/40 p-4">
            <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-bold text-indigo-300">1</div>
            <p className="text-sm font-medium text-white">Institution issues</p>
            <p className="mt-1 text-xs text-gray-400">
              Domain signers approve a template. One transaction notarizes the record on IOTA.
            </p>
          </div>
          <div className="rounded-xl border border-gray-800/40 bg-gray-900/40 p-4">
            <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-bold text-indigo-300">2</div>
            <p className="text-sm font-medium text-white">Holder receives it</p>
            <p className="mt-1 text-xs text-gray-400">
              The credential appears in the recipient's IOTA wallet as an on-chain object.
            </p>
          </div>
          <div className="rounded-xl border border-gray-800/40 bg-gray-900/40 p-4">
            <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-bold text-indigo-300">3</div>
            <p className="text-sm font-medium text-white">Anyone verifies</p>
            <p className="mt-1 text-xs text-gray-400">
              Share one URL. No wallet, no app, no blockchain knowledge needed.
            </p>
          </div>
        </div>
      </div>

      {/* ── G. What Passapawn Does NOT Do ── */}
      <div className="rounded-xl border border-gray-800/40 bg-gray-900/30 p-5">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-gray-500" />
          <h4 className="text-sm font-semibold text-gray-300">What Passapawn Does NOT Do</h4>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          No raw personal data on-chain. No centralized authority controls issuance.
          No vendor lock-in — credentials are standard IOTA objects, portable and interoperable.
        </p>
      </div>
    </section>
  );
}
