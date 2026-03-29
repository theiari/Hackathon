import { useState, useCallback } from "react";
import {
  ShieldCheck, Wallet, ArrowRight, GraduationCap, Building2,
  Lock, Layers, Database, Link2,
  ChevronLeft, ChevronRight,
} from "lucide-react";

const SLIDE_LABELS = [
  "University Problem",
  "How It Works",
  "Why It Wins",
  "Built On IOTA",
];

export function LandingHero({
  connected,
  onNavigate,
}: {
  connected: boolean;
  onNavigate: (tab: string) => void;
}) {
  const [slide, setSlide] = useState(0);
  const total = SLIDE_LABELS.length;
  const prev = useCallback(() => setSlide((s) => (s - 1 + total) % total), [total]);
  const next = useCallback(() => setSlide((s) => (s + 1) % total), [total]);

  /* ── Connected: quick-nav cards ── */
  if (connected) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-400">Run the core workflow: set up the institution, issue a certificate, then verify it from a browser link.</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <button
            onClick={() => onNavigate("issue")}
            className="group flex flex-col gap-2 rounded-2xl border border-gray-800/60 bg-gray-900/60 p-5 text-left transition-colors hover:border-indigo-500/40 hover:bg-indigo-950/20"
          >
            <Building2 className="h-6 w-6 text-indigo-400" />
            <p className="text-sm font-semibold text-white">Set Up Institution</p>
            <p className="text-xs text-gray-400">Create the institution profile and publish the certificate template your school will issue.</p>
            <span className="mt-auto flex items-center gap-1 text-xs text-indigo-400 opacity-0 transition-opacity group-hover:opacity-100">
              Go <ArrowRight className="h-3 w-3" />
            </span>
          </button>
          <button
            onClick={() => onNavigate("issue")}
            className="group flex flex-col gap-2 rounded-2xl border border-gray-800/60 bg-gray-900/60 p-5 text-left transition-colors hover:border-indigo-500/40 hover:bg-indigo-950/20"
          >
            <GraduationCap className="h-6 w-6 text-indigo-400" />
            <p className="text-sm font-semibold text-white">Issue Certificates</p>
            <p className="text-xs text-gray-400">Create immutable degree or certificate records with private data hashed before anchoring.</p>
            <span className="mt-auto flex items-center gap-1 text-xs text-indigo-400 opacity-0 transition-opacity group-hover:opacity-100">
              Go <ArrowRight className="h-3 w-3" />
            </span>
          </button>
          <button
            onClick={() => onNavigate("holder")}
            className="group flex flex-col gap-2 rounded-2xl border border-gray-800/60 bg-gray-900/60 p-5 text-left transition-colors hover:border-indigo-500/40 hover:bg-indigo-950/20"
          >
            <Wallet className="h-6 w-6 text-indigo-400" />
            <p className="text-sm font-semibold text-white">My Certificates</p>
            <p className="text-xs text-gray-400">Open the holder view, copy a verification link, or create a holder-signed proof if needed.</p>
            <span className="mt-auto flex items-center gap-1 text-xs text-indigo-400 opacity-0 transition-opacity group-hover:opacity-100">
              Go <ArrowRight className="h-3 w-3" />
            </span>
          </button>
          <button
            onClick={() => onNavigate("verify")}
            className="group flex flex-col gap-2 rounded-2xl border border-gray-800/60 bg-gray-900/60 p-5 text-left transition-colors hover:border-indigo-500/40 hover:bg-indigo-950/20"
          >
            <ShieldCheck className="h-6 w-6 text-indigo-400" />
            <p className="text-sm font-semibold text-white">Verify Certificate</p>
            <p className="text-xs text-gray-400">Paste a shared certificate ID and verify it instantly in a normal browser with no wallet.</p>
            <span className="mt-auto flex items-center gap-1 text-xs text-indigo-400 opacity-0 transition-opacity group-hover:opacity-100">
              Go <ArrowRight className="h-3 w-3" />
            </span>
          </button>
        </div>
      </div>
    );
  }

  /* ── Slide content renderers ── */
  const slides: JSX.Element[] = [
    /* 0 — University Problem */
    <div key="ps" className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-red-900/30 bg-red-950/10 p-6">
        <Database className="mb-3 h-7 w-7 text-red-400" />
        <h3 className="text-base font-semibold text-white">What universities still deal with</h3>
        <ul className="mt-3 space-y-2 text-sm text-gray-400">
          <li className="flex items-start gap-2"><span className="mt-0.5 text-red-400">✗</span> Employers still validate degrees by email, phone calls, or PDFs</li>
          <li className="flex items-start gap-2"><span className="mt-0.5 text-red-400">✗</span> Certificate files can be edited, copied, or shared without proof of origin</li>
          <li className="flex items-start gap-2"><span className="mt-0.5 text-red-400">✗</span> Student data gets duplicated across verification workflows and inboxes</li>
        </ul>
      </div>
      <div className="rounded-2xl border border-green-900/30 bg-green-950/10 p-6">
        <ShieldCheck className="mb-3 h-7 w-7 text-green-400" />
        <h3 className="text-base font-semibold text-white">What Credora changes</h3>
        <ul className="mt-3 space-y-2 text-sm text-gray-400">
          <li className="flex items-start gap-2"><span className="mt-0.5 text-green-400">✓</span> Issue tamper-proof certificate records with only hashes anchored on-chain</li>
          <li className="flex items-start gap-2"><span className="mt-0.5 text-green-400">✓</span> Let employers verify from a shared link in any browser with no wallet</li>
          <li className="flex items-start gap-2"><span className="mt-0.5 text-green-400">✓</span> Keep issuer control through institution domains, templates, and trust policy</li>
        </ul>
      </div>
    </div>,

    /* 1 — How It Works */
    <div key="how" className="space-y-3">
      <h3 className="text-lg font-semibold text-white">Three-step certificate flow</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-800/40 bg-gray-900/40 p-4">
          <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-bold text-indigo-300">1</div>
          <p className="text-sm font-medium text-white">Institution sets up once</p>
          <p className="mt-1 text-xs text-gray-400">
            Create the institution profile, publish a certificate template, and define the student fields that belong in each record.
          </p>
        </div>
        <div className="rounded-xl border border-gray-800/40 bg-gray-900/40 p-4">
          <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-bold text-indigo-300">2</div>
          <p className="text-sm font-medium text-white">Issue certificate records</p>
          <p className="mt-1 text-xs text-gray-400">
            The issuer signs one transaction, and the certificate appears in the holder portfolio as an on-chain record.
          </p>
        </div>
        <div className="rounded-xl border border-gray-800/40 bg-gray-900/40 p-4">
          <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-bold text-indigo-300">3</div>
          <p className="text-sm font-medium text-white">Verifier checks from a link</p>
          <p className="mt-1 text-xs text-gray-400">
            A recruiter or admissions office pastes the ID or opens a verification link. No wallet, no install, no blockchain knowledge.
          </p>
        </div>
      </div>
    </div>,

    /* 2 — Why it wins */
    <div key="wins" className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-gray-800/60 bg-gray-900/60 p-6">
        <GraduationCap className="mb-3 h-8 w-8 text-indigo-400" />
        <h3 className="text-base font-semibold text-white">Strong fit for universities and training providers</h3>
        <p className="mt-2 text-sm text-gray-400">
          The current product is best at degrees, language certificates, professional training outcomes, and other records that should be immutable and easy to verify.
        </p>
        <p className="mt-3 text-xs text-indigo-300/80">Best demo path: create institution, publish certificate template, issue one record, verify from a private browser window.</p>
      </div>
      <div className="rounded-2xl border border-gray-800/60 bg-gray-900/60 p-6">
        <Lock className="mb-3 h-8 w-8 text-indigo-400" />
        <h3 className="text-base font-semibold text-white">Privacy-first by default</h3>
        <p className="mt-2 text-sm text-gray-400">
          Public metadata stays readable for verification, while sensitive student data is hashed before it ever touches the chain. That keeps the demo aligned with real privacy expectations.
        </p>
        <p className="mt-3 text-xs text-indigo-300/80">Use locked records as the default academic model. Advanced governance and transferability stay secondary.</p>
      </div>
    </div>,

    /* 3 — Built on IOTA */
    <div key="arch" className="space-y-3">
      <h3 className="text-lg font-semibold text-white">Built on IOTA with a product-first scope</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col items-center rounded-xl border border-indigo-800/40 bg-indigo-950/20 p-4 text-center">
          <ShieldCheck className="mb-2 h-6 w-6 text-indigo-400" />
          <p className="text-sm font-medium text-white">IOTA Notarization</p>
          <p className="mt-1 text-xs text-gray-500">Anchors certificate integrity on-chain</p>
        </div>
        <div className="flex flex-col items-center rounded-xl border border-indigo-800/40 bg-indigo-950/20 p-4 text-center">
          <Layers className="mb-2 h-6 w-6 text-indigo-400" />
          <p className="text-sm font-medium text-white">Move Domain Templates</p>
          <p className="mt-1 text-xs text-gray-500">Model institution profiles and certificate schemas</p>
        </div>
        <div className="flex flex-col items-center rounded-xl border border-indigo-800/40 bg-indigo-950/20 p-4 text-center">
          <Link2 className="mb-2 h-6 w-6 text-indigo-400" />
          <p className="text-sm font-medium text-white">Verification API</p>
          <p className="mt-1 text-xs text-gray-500">Lets employers verify from a normal browser link</p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
        <span>Institution wallet signs ↓</span>
        <span className="text-gray-700">|</span>
        <span>Verifier opens shared link ↑</span>
        <span className="text-gray-700">|</span>
        <span>Advanced governance remains roadmap</span>
      </div>
    </div>,
  ];

  /* ── Disconnected: full landing page for judges ── */
  return (
    <section className="space-y-8">
      {/* ── A. Hero Banner (always visible) ── */}
      <div className="rounded-2xl border border-gray-800/60 bg-gradient-to-br from-gray-900 via-gray-900 to-indigo-950/30 p-8">
        <span className="inline-block rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
          University credentials on IOTA devnet
        </span>
        <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Issue tamper-proof university certificates.<br />Let employers verify them from any browser.
        </h2>
        <p className="mt-3 max-w-2xl text-gray-400">
          Credora helps universities and training providers publish certificate records on IOTA
          without putting raw student data on-chain. Holders keep a wallet-linked portfolio, and
          employers verify from a shared link with no wallet, no login, and no special software.
        </p>
        <p className="mt-5 text-sm font-medium text-indigo-300">
          Start with the institution setup flow, then issue one certificate and verify it in a private browser window <ArrowRight className="mb-0.5 ml-1 inline h-4 w-4" />
        </p>
      </div>

      {/* ── Paginated Slider ── */}
      <div className="relative">
        {/* Slide content */}
        <div className="min-h-[220px]">{slides[slide]}</div>

        {/* Navigation: arrows + dots */}
        <div className="mt-5 flex items-center justify-center gap-4">
          <button
            onClick={prev}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-700 bg-gray-900 text-gray-400 transition hover:border-indigo-500 hover:text-indigo-300"
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2">
            {SLIDE_LABELS.map((label, i) => (
              <button
                key={label}
                onClick={() => setSlide(i)}
                className={`h-2.5 rounded-full transition-all ${
                  i === slide
                    ? "w-6 bg-indigo-500"
                    : "w-2.5 bg-gray-700 hover:bg-gray-500"
                }`}
                aria-label={label}
                title={label}
              />
            ))}
          </div>

          <button
            onClick={next}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-700 bg-gray-900 text-gray-400 transition hover:border-indigo-500 hover:text-indigo-300"
            aria-label="Next slide"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Current slide label */}
        <p className="mt-2 text-center text-xs text-gray-500">
          {slide + 1}/{total} — {SLIDE_LABELS[slide]}
        </p>
      </div>

      {/* ── Strategic signal pills ── */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {[
          "GDPR-safe: hash-only on-chain",
          "No-wallet verification links",
          "Best fit: degrees and certificates",
          "Advanced governance stays roadmap",
        ].map((pill) => (
          <span
            key={pill}
            className="rounded-full border border-indigo-800/40 bg-indigo-950/20 px-3 py-1 text-xs text-indigo-300"
          >
            {pill}
          </span>
        ))}
      </div>
    </section>
  );
}
