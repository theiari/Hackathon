import { useCurrentAccount } from "@iota/dapp-kit";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Home, FilePlus, Wallet, ShieldCheck } from "lucide-react";
import { DomainPanel } from "./components/DomainPanel";
import { HolderView } from "./components/HolderView";
import { IssuerPanel } from "./components/IssuerPanel";
import { IssuerDashboard } from "./components/IssuerDashboard";
import { LandingHero } from "./components/LandingHero";
import { PresentationViewer } from "./components/PresentationViewer";
import { VerifierHistory, type VerifyTimelineEntry } from "./components/VerifierHistory";
import { VerifierPanel } from "./components/VerifierPanel";
import { WalletHeader } from "./components/WalletHeader";
import { getCompletedSteps, markStepCompleted, type FlowStep } from "./flowState";
import { DEFAULT_NETWORK, useNetworkVariable } from "./networkConfig";

const TABS = [
  { key: "home", label: "Home", icon: Home },
  { key: "issue", label: "Issue Certificates", icon: FilePlus },
  { key: "holder", label: "My Certificates", icon: Wallet },
  { key: "verify", label: "Verify Certificate", icon: ShieldCheck },
] as const;

function ConnectPrompt() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-700/50 bg-gray-900/60 px-8 py-12 text-center">
      <Wallet className="h-10 w-10 text-gray-500" />
      <p className="text-lg font-medium text-gray-300">Connect your wallet to continue</p>
      <p className="text-sm text-gray-500">Use the connect button in the top-right corner.</p>
    </div>
  );
}

function App() {
  const account = useCurrentAccount();
  const packageId = useNetworkVariable("packageId");
  const [activeTab, setActiveTab] = useState("home");
  const [prefillVerifyId, setPrefillVerifyId] = useState("");
  const [autoTrigger, setAutoTrigger] = useState(0);
  const [presentToken, setPresentToken] = useState("");
  const [history, setHistory] = useState<VerifyTimelineEntry[]>([]);
  const [, setCompletedSteps] = useState(() => getCompletedSteps(account?.address));

  useEffect(() => {
    setCompletedSteps(getCompletedSteps(account?.address));
  }, [account?.address]);

  const completeStep = useCallback((step: FlowStep) => {
    setCompletedSteps(markStepCompleted(step, account?.address));
  }, [account?.address]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const presentFromUrl = params.get("present")?.trim() ?? "";
    if (presentFromUrl) {
      setActiveTab("verify");
      setPresentToken(presentFromUrl);
      return;
    }

    const verifyFromUrl = params.get("verify")?.trim() ?? "";
    if (verifyFromUrl) {
      setActiveTab("verify");
      setPrefillVerifyId(verifyFromUrl);
      setAutoTrigger((value) => value + 1);
      return;
    }

    const aaProposalParam = params.get("aa_proposal")?.trim() ?? "";
    if (aaProposalParam) {
      const [domainIdFromUrl, proposalIdStr] = aaProposalParam.split(":");
      if (domainIdFromUrl) localStorage.setItem("credora:pending_aa_domain_id", domainIdFromUrl);
      if (proposalIdStr) localStorage.setItem("credora:pending_aa_proposal_id", proposalIdStr);
      setActiveTab("issue");
      return;
    }
  }, []);

  const showPublicVerifyOnHome = useMemo(
    () => !account && Boolean(new URLSearchParams(window.location.search).get("verify")?.trim()),
    [account],
  );

  return (
    <div className="min-h-screen bg-gray-950 pb-12">
      <WalletHeader network={DEFAULT_NETWORK} />

      {/* Tab navigation */}
      <nav className="sticky top-0 z-20 border-b border-gray-800/60 bg-gray-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-indigo-600/20 text-indigo-300" : "text-gray-400 hover:bg-gray-800/60 hover:text-gray-200"}`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main content */}
      <main className="mx-auto mt-6 grid max-w-6xl gap-6 px-4">
        {(activeTab === "home" || showPublicVerifyOnHome) && <LandingHero connected={Boolean(account)} onNavigate={setActiveTab} />}

        {showPublicVerifyOnHome && (
          <VerifierPanel
            minimal
            prefillVerifyId={prefillVerifyId}
            onPrefillConsumed={() => setPrefillVerifyId("")}
            autoTrigger={autoTrigger}
            onVerified={(entry) => {
              completeStep(5);
              setHistory((prev) => [entry, ...prev]);
            }}
          />
        )}

        {activeTab === "issue" && account && (
          <>
            <DomainPanel packageId={packageId} onStepCompleted={completeStep} />
            <IssuerPanel
              onIssued={() => completeStep(3)}
              onNavigateToVerify={(id) => {
                setPrefillVerifyId(id);
                setAutoTrigger((value) => value + 1);
                setActiveTab("verify");
              }}
            />
            <IssuerDashboard
              onNavigateToVerify={(id) => {
                setPrefillVerifyId(id);
                setAutoTrigger((value) => value + 1);
                setActiveTab("verify");
              }}
            />
          </>
        )}

        {activeTab === "issue" && !account && <ConnectPrompt />}

        {activeTab === "holder" && account && (
          <HolderView
            address={account?.address}
            onLoaded={(count) => {
              if (count > 0) completeStep(4);
            }}
            onNavigateToVerify={(id) => {
              setActiveTab("verify");
              setPrefillVerifyId(id);
              setAutoTrigger((value) => value + 1);
            }}
          />
        )}

        {activeTab === "holder" && !account && <ConnectPrompt />}

        {activeTab === "verify" && (
          <>
            {presentToken ? (
              <PresentationViewer token={presentToken} onDismiss={() => setPresentToken("")} />
            ) : (
              <VerifierPanel
                prefillVerifyId={prefillVerifyId}
                onPrefillConsumed={() => setPrefillVerifyId("")}
                autoTrigger={autoTrigger}
                onVerified={(entry) => {
                  completeStep(5);
                  setHistory((prev) => [entry, ...prev]);
                }}
              />
            )}
            <VerifierHistory entries={history} />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
