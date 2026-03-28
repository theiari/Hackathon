import { useCurrentAccount } from "@iota/dapp-kit";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CredentialExplorer } from "./components/CredentialExplorer";
import { DomainPanel } from "./components/DomainPanel";
import { GettingStarted } from "./components/GettingStarted";
import { HolderView } from "./components/HolderView";
import { IssuerPanel } from "./components/IssuerPanel";
import { IssuerDashboard } from "./components/IssuerDashboard";
import { LandingHero } from "./components/LandingHero";
import { OnboardingAdminPanel } from "./components/OnboardingAdminPanel";
import { PresentationViewer } from "./components/PresentationViewer";
import { PolicyAdminPanel } from "./components/PolicyAdminPanel";
import { VerifierHistory, type VerifyTimelineEntry } from "./components/VerifierHistory";
import { VerifierPanel } from "./components/VerifierPanel";
import { WalletHeader } from "./components/WalletHeader";
import { getCompletedSteps, markStepCompleted, type FlowStep } from "./flowState";
import { DEFAULT_NETWORK, useNetworkVariable } from "./networkConfig";

const TABS = [
  { key: "home", label: "Home" },
  { key: "issue", label: "Issue" },
  { key: "explore", label: "Explore 🔍" },
  { key: "holder", label: "My Credentials" },
  { key: "verify", label: "Verify" },
  { key: "admin", label: "Admin" },
] as const;

function App() {
  const account = useCurrentAccount();
  const packageId = useNetworkVariable("packageId");
  const [activeTab, setActiveTab] = useState("home");
  const [prefillVerifyId, setPrefillVerifyId] = useState("");
  const [autoTrigger, setAutoTrigger] = useState(0);
  const [presentToken, setPresentToken] = useState("");
  const [history, setHistory] = useState<VerifyTimelineEntry[]>([]);
  const [showPolicyAdmin, setShowPolicyAdmin] = useState(false);
  const [completedSteps, setCompletedSteps] = useState(() => getCompletedSteps());

  const navigateToTab = (tab: "issue" | "holder" | "verify") => setActiveTab(tab);
  const completeStep = useCallback((step: FlowStep) => {
    setCompletedSteps(markStepCompleted(step));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const presentFromUrl = params.get("present")?.trim() ?? "";
    if (presentFromUrl) {
      setActiveTab("verify");
      setPresentToken(presentFromUrl);
      return;
    }

    const verifyFromUrl = params.get("verify")?.trim() ?? "";
    if (!verifyFromUrl) return;
    setActiveTab("verify");
    setPrefillVerifyId(verifyFromUrl);
    setAutoTrigger((value) => value + 1);
  }, []);

  const showPublicVerifyOnHome = useMemo(
    () => !account && Boolean(new URLSearchParams(window.location.search).get("verify")?.trim()),
    [account],
  );

  return (
    <div className="min-h-screen pb-10">
      <WalletHeader network={DEFAULT_NETWORK} packageId={packageId} connected={Boolean(account)} />
      {account && <GettingStarted completedSteps={completedSteps} onNavigate={navigateToTab} />}
      <div className="sticky top-0 z-10 mx-auto mt-4 w-full max-w-6xl border-b border-gray-800 bg-gray-950/90 px-4 py-2 backdrop-blur">
        <div className="flex w-full flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-lg border-b-2 px-4 py-2 text-sm font-semibold ${activeTab === tab.key ? "border-indigo-500 text-indigo-300" : "border-transparent bg-gray-800 text-gray-200 hover:bg-gray-700"}`}
          >
            {tab.label}
          </button>
        ))}
        </div>
      </div>

      <div className="mx-auto mt-6 grid w-full max-w-6xl gap-6 px-4">
        {(activeTab === "home" || showPublicVerifyOnHome) && <LandingHero connected={Boolean(account)} packageId={packageId} />}

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
            <IssuerPanel onIssued={() => completeStep(3)} />
            <IssuerDashboard
              onNavigateToVerify={(id) => {
                setPrefillVerifyId(id);
                setAutoTrigger((value) => value + 1);
                setActiveTab("verify");
              }}
            />
          </>
        )}

        {activeTab === "issue" && !account && (
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-6 text-center text-gray-300">
            Connect your IOTA wallet to continue.
          </div>
        )}

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

        {activeTab === "holder" && !account && (
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-6 text-center text-gray-300">
            Connect your IOTA wallet to continue.
          </div>
        )}

        {activeTab === "explore" && (
          <CredentialExplorer
            onNavigateToVerify={(id) => {
              setPrefillVerifyId(id);
              setAutoTrigger((value) => value + 1);
              setActiveTab("verify");
            }}
          />
        )}

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

        {activeTab === "admin" && account && (
          <>
            <div className="flex items-center gap-3">
              <button className="rounded-lg border border-gray-600 px-3 py-2 text-xs" onClick={() => setShowPolicyAdmin(false)}>
                Onboarding Admin
              </button>
              <button className="rounded-lg border border-gray-600 px-3 py-2 text-xs" onClick={() => setShowPolicyAdmin(true)}>
                Policy Admin
              </button>
            </div>
            {showPolicyAdmin ? <PolicyAdminPanel /> : <OnboardingAdminPanel />}
          </>
        )}

        {activeTab === "admin" && !account && (
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-6 text-center text-gray-300">
            Connect your IOTA wallet to continue.
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
