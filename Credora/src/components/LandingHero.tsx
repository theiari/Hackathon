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
      <div className="space-y-6">
        <p className="text-sm text-obsidian-400">Run the core workflow: set up the institution, issue a certificate, then verify it from a browser link.</p>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <button
            onClick={() => onNavigate("issue")}
            className="animate-fade-in-up stagger-1 group flex flex-col gap-3 rounded-2xl border border-obsidian-700/40 bg-obsidian-900/70 p-6 text-left transition-all duration-300 hover:border-gold-700/40 hover:bg-obsidian-850"
          >
            <Building2 className="h-6 w-6 text-gold-500" />
            <p className="text-sm font-semibold text-obsidian-100">Set Up Institution</p>
            <p className="text-xs leading-relaxed text-obsidian-400">Create the institution profile and publish the certificate template your school will issue.</p>
            <span className="mt-auto flex items-center gap-1.5 text-xs font-medium text-gold-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              Go <ArrowRight className="h-3 w-3" />
            </span>
          </button>
          <button
            onClick={() => onNavigate("issue")}
            className="animate-fade-in-up stagger-2 group flex flex-col gap-3 rounded-2xl border border-obsidian-700/40 bg-obsidian-900/70 p-6 text-left transition-all duration-300 hover:border-gold-700/40 hover:bg-obsidian-850"
          >
            <GraduationCap className="h-6 w-6 text-gold-500" />
            <p className="text-sm font-semibold text-obsidian-100">Issue Certificates</p>
            <p className="text-xs leading-relaxed text-obsidian-400">Create immutable degree or certificate records with private data hashed before anchoring.</p>
            <span className="mt-auto flex items-center gap-1.5 text-xs font-medium text-gold-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              Go <ArrowRight className="h-3 w-3" />
            </span>
          </button>
          <button
            onClick={() => onNavigate("holder")}
            className="animate-fade-in-up stagger-3 group flex flex-col gap-3 rounded-2xl border border-obsidian-700/40 bg-obsidian-900/70 p-6 text-left transition-all duration-300 hover:border-gold-700/40 hover:bg-obsidian-850"
          >
            <Wallet className="h-6 w-6 text-gold-500" />
            <p className="text-sm font-semibold text-obsidian-100">My Certificates</p>
            <p className="text-xs leading-relaxed text-obsidian-400">Open the holder view, copy a verification link, or create a holder-signed proof if needed.</p>
            <span className="mt-auto flex items-center gap-1.5 text-xs font-medium text-gold-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              Go <ArrowRight className="h-3 w-3" />
            </span>
          </button>
          <button
            onClick={() => onNavigate("verify")}
            className="animate-fade-in-up stagger-4 group flex flex-col gap-3 rounded-2xl border border-obsidian-700/40 bg-obsidian-900/70 p-6 text-left transition-all duration-300 hover:border-gold-700/40 hover:bg-obsidian-850"
          >
            <ShieldCheck className="h-6 w-6 text-gold-500" />
            <p className="text-sm font-semibold text-obsidian-100">Verify Certificate</p>
            <p className="text-xs leading-relaxed text-obsidian-400">Paste a shared certificate ID and verify it instantly in a normal browser with no wallet.</p>
            <span className="mt-auto flex items-center gap-1.5 text-xs font-medium text-gold-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
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
    <div key="ps" className="grid gap-5 sm:grid-cols-2">
      <div className="rounded-2xl border border-rose-800/30 bg-rose-900/10 p-7">
        <Database className="mb-4 h-7 w-7 text-rose-400" />
        <h3 className="text-base font-semibold text-obsidian-100">What institutions still deal with</h3>
        <ul className="mt-4 space-y-3 text-sm text-obsidian-400">
          <li className="flex items-start gap-2.5"><span className="mt-0.5 text-rose-400">✗</span> Employers still validate degrees by email, phone calls, or PDFs</li>
          <li className="flex items-start gap-2.5"><span className="mt-0.5 text-rose-400">✗</span> Certificate files can be edited, copied, or shared without proof of origin</li>
          <li className="flex items-start gap-2.5"><span className="mt-0.5 text-rose-400">✗</span> Student data gets duplicated across verification workflows and inboxes</li>
        </ul>
      </div>
      <div className="rounded-2xl border border-sage-800/30 bg-sage-900/10 p-7">
        <ShieldCheck className="mb-4 h-7 w-7 text-sage-400" />
        <h3 className="text-base font-semibold text-obsidian-100">What Credora changes</h3>
        <ul className="mt-4 space-y-3 text-sm text-obsidian-400">
          <li className="flex items-start gap-2.5"><span className="mt-0.5 text-sage-400">✓</span> Issue tamper-proof certificate records with only hashes anchored on-chain</li>
          <li className="flex items-start gap-2.5"><span className="mt-0.5 text-sage-400">✓</span> Let employers verify from a shared link in any browser with no wallet</li>
          <li className="flex items-start gap-2.5"><span className="mt-0.5 text-sage-400">✓</span> Keep issuer control through institution domains, templates, and trust policy</li>
        </ul>
      </div>
    </div>,

    /* 1 — How It Works */
    <div key="how" className="space-y-4">
      <h3 className="text-lg font-semibold text-obsidian-100">Three-step certificate flow</h3>
      <div className="grid gap-5 sm:grid-cols-3">
        <div className="rounded-xl border border-obsidian-700/40 bg-obsidian-900/50 p-5">
          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-gold-800/25 text-xs font-bold text-gold-400">1</div>
          <p className="text-sm font-medium text-obsidian-100">Institution sets up once</p>
          <p className="mt-2 text-xs leading-relaxed text-obsidian-400">
            Create the institution profile, publish a certificate template, and define the student fields that belong in each record.
          </p>
        </div>
        <div className="rounded-xl border border-obsidian-700/40 bg-obsidian-900/50 p-5">
          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-gold-800/25 text-xs font-bold text-gold-400">2</div>
          <p className="text-sm font-medium text-obsidian-100">Issue certificate records</p>
          <p className="mt-2 text-xs leading-relaxed text-obsidian-400">
            The issuer signs one transaction, and the certificate appears in the holder portfolio as an on-chain record.
          </p>
        </div>
        <div className="rounded-xl border border-obsidian-700/40 bg-obsidian-900/50 p-5">
          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-gold-800/25 text-xs font-bold text-gold-400">3</div>
          <p className="text-sm font-medium text-obsidian-100">Verifier checks from a link</p>
          <p className="mt-2 text-xs leading-relaxed text-obsidian-400">
            A recruiter or admissions office pastes the ID or opens a verification link. No wallet, no install, no blockchain knowledge.
          </p>
        </div>
      </div>
    </div>,

    /* 2 — Why it wins */
    <div key="wins" className="grid gap-5 sm:grid-cols-2">
      <div className="rounded-2xl border border-obsidian-700/40 bg-obsidian-900/60 p-7">
        <GraduationCap className="mb-4 h-8 w-8 text-gold-500" />
        <h3 className="text-base font-semibold text-obsidian-100">Strong fit for universities and training providers</h3>
        <p className="mt-3 text-sm leading-relaxed text-obsidian-400">
          The current product is best at degrees, language certificates, professional training outcomes, and other records that should be immutable and easy to verify.
        </p>
        <p className="mt-4 text-xs text-gold-500/80">Best demo path: create institution, publish template, issue one record, verify from a private browser.</p>
      </div>
      <div className="rounded-2xl border border-obsidian-700/40 bg-obsidian-900/60 p-7">
        <Lock className="mb-4 h-8 w-8 text-gold-500" />
        <h3 className="text-base font-semibold text-obsidian-100">Privacy-first by default</h3>
        <p className="mt-3 text-sm leading-relaxed text-obsidian-400">
          Public metadata stays readable for verification, while sensitive student data is hashed before it ever touches the chain. That keeps the demo aligned with real privacy expectations.
        </p>
        <p className="mt-4 text-xs text-gold-500/80">Use locked records as the default academic model. Advanced governance and transferability stay secondary.</p>
      </div>
    </div>,

    /* 3 — Built on IOTA */
    <div key="arch" className="space-y-4">
      <h3 className="text-lg font-semibold text-obsidian-100">Built on IOTA with a product-first scope</h3>
      <div className="grid gap-5 sm:grid-cols-3">
        <div className="flex flex-col items-center rounded-xl border border-gold-700/25 bg-gold-800/8 p-5 text-center">
          <ShieldCheck className="mb-3 h-6 w-6 text-gold-500" />
          <p className="text-sm font-medium text-obsidian-100">IOTA Notarization</p>
          <p className="mt-2 text-xs text-obsidian-500">Anchors certificate integrity on-chain</p>
        </div>
        <div className="flex flex-col items-center rounded-xl border border-gold-700/25 bg-gold-800/8 p-5 text-center">
          <Layers className="mb-3 h-6 w-6 text-gold-500" />
          <p className="text-sm font-medium text-obsidian-100">Move Domain Templates</p>
          <p className="mt-2 text-xs text-obsidian-500">Model institution profiles and certificate schemas</p>
        </div>
        <div className="flex flex-col items-center rounded-xl border border-gold-700/25 bg-gold-800/8 p-5 text-center">
          <Link2 className="mb-3 h-6 w-6 text-gold-500" />
          <p className="text-sm font-medium text-obsidian-100">Verification API</p>
          <p className="mt-2 text-xs text-obsidian-500">Lets employers verify from a normal browser link</p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-3 text-xs text-obsidian-500">
        <span>Institution wallet signs ↓</span>
        <span className="text-obsidian-700">·</span>
        <span>Verifier opens shared link ↑</span>
        <span className="text-obsidian-700">·</span>
        <span>Advanced governance remains roadmap</span>
      </div>
    </div>,
  ];

  /* ── Disconnected: full landing page for judges ── */
  return (
    <section className="space-y-10">
      {/* ── A. Hero Banner (always visible) ── */}
      <div className="animate-fade-in-up rounded-2xl border border-obsidian-700/40 bg-gradient-to-br from-obsidian-900 via-obsidian-900 to-gold-800/8 p-10">
        <span className="inline-block rounded-full border border-gold-700/30 bg-gold-800/15 px-3.5 py-1 text-xs font-semibold tracking-wide text-gold-400 uppercase">
          Credentials on IOTA devnet
        </span>
        <h2 className="mt-5 text-3xl font-bold tracking-tight text-obsidian-50 sm:text-4xl">
          Issue tamper-proof certificates.<br />Let anyone verify them from a browser.
        </h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-obsidian-400">
          Credora helps universities, professional bodies, and certification providers publish credential records on IOTA
          without putting raw personal data on-chain. Holders keep a wallet-linked portfolio, and
          verifiers confirm authenticity from a shared link — no wallet, no login, no special software.
        </p>
        <p className="mt-6 text-sm font-medium text-gold-400">
          Start with the institution setup flow, then issue one certificate and verify it in a private browser window <ArrowRight className="mb-0.5 ml-1 inline h-4 w-4" />
        </p>
      </div>

      {/* ── Paginated Slider ── */}
      <div className="relative">
        {/* Slide content */}
        <div className="min-h-[240px]">{slides[slide]}</div>

        {/* Navigation: arrows + dots */}
        <div className="mt-6 flex items-center justify-center gap-5">
          <button
            onClick={prev}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-obsidian-700/50 bg-obsidian-900 text-obsidian-400 transition-all duration-200 hover:border-gold-600/40 hover:text-gold-400"
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2.5">
            {SLIDE_LABELS.map((label, i) => (
              <button
                key={label}
                onClick={() => setSlide(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === slide
                    ? "w-7 bg-gold-500"
                    : "w-2 bg-obsidian-700 hover:bg-obsidian-500"
                }`}
                aria-label={label}
                title={label}
              />
            ))}
          </div>

          <button
            onClick={next}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-obsidian-700/50 bg-obsidian-900 text-obsidian-400 transition-all duration-200 hover:border-gold-600/40 hover:text-gold-400"
            aria-label="Next slide"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Current slide label */}
        <p className="mt-3 text-center text-xs text-obsidian-500">
          {slide + 1}/{total} — {SLIDE_LABELS[slide]}
        </p>
      </div>

      {/* ── Strategic signal pills ── */}
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {[
          "GDPR-safe: hash-only on-chain",
          "No-wallet verification links",
          "Universities · Pet passports · Professional certs",
          "Account Abstraction for governance",
        ].map((pill) => (
          <span
            key={pill}
            className="rounded-full border border-gold-700/25 bg-gold-800/10 px-4 py-1.5 text-xs font-medium text-gold-400"
          >
            {pill}
          </span>
        ))}
      </div>
    </section>
  );
}
