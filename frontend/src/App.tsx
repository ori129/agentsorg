import { useState, useEffect } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { useGlobalPipelineWatcher } from "./hooks/usePipeline";
import { useDemoState, useUpdateDemoState } from "./hooks/useDemo";
import Header from "./components/layout/Header";
import DemoBanner from "./components/layout/DemoBanner";
import LeaderLayout from "./components/leader/LeaderLayout";
import Portal from "./components/employee/Portal";
import RegisterScreen from "./components/auth/RegisterScreen";
import LoginScreen from "./components/auth/LoginScreen";
import OnboardingScreen from "./components/auth/OnboardingScreen";

export type TopView = "leader" | "employee";

function AppInner() {
  const { state, systemRole, logout, justRegistered, clearJustRegistered } = useAuth();
  const [topView, setTopView] = useState<TopView>("leader");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [goToSetup, setGoToSetup] = useState(false);
  const [comingFromDemo, setComingFromDemo] = useState(false);

  const { data: demoState } = useDemoState();
  const updateDemo = useUpdateDemoState();

  useGlobalPipelineWatcher();

  // Show onboarding only immediately after registration
  useEffect(() => {
    if (justRegistered) {
      setShowOnboarding(true);
    }
  }, [justRegistered]);

  // Redirect employees to portal-only view
  useEffect(() => {
    if (systemRole === "employee") {
      setTopView("employee");
    }
  }, [systemRole]);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--c-bg)", color: "var(--c-text-4)" }}>
        <span className="text-sm">Loading...</span>
      </div>
    );
  }

  if (state === "register") return <RegisterScreen />;
  if (state === "login") return <LoginScreen />;

  // Onboarding choice screen — shown right after first registration
  if (showOnboarding) {
    return (
      <OnboardingScreen
        onDemo={() => {
          setShowOnboarding(false);
          setComingFromDemo(true);
          clearJustRegistered();
        }}
        onProduction={() => {
          setShowOnboarding(false);
          clearJustRegistered();
          setGoToSetup(true);
        }}
      />
    );
  }

  const canSeeLeader = systemRole === "system-admin" || systemRole === "ai-leader";
  const isDemoActive = demoState?.enabled ?? false;

  const handleSwitchToProduction = () => {
    updateDemo.mutate({ enabled: false, size: demoState?.size ?? "medium" });
    setGoToSetup(true);
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--c-bg)", color: "var(--c-text)" }}>
      <Header
        topView={topView}
        onSetView={setTopView}
        canSeeLeader={canSeeLeader}
        onLogout={logout}
        userEmail={state.email}
      />

      {/* Demo mode banner — persistent reminder with easy exit */}
      {isDemoActive && canSeeLeader && (
        <DemoBanner onSwitchToProduction={handleSwitchToProduction} />
      )}

      {topView === "leader" && canSeeLeader && (
        <LeaderLayout
          initialPage={goToSetup ? "enrichment" : comingFromDemo ? "overview" : undefined}
          onSetupNavigated={() => { setGoToSetup(false); setComingFromDemo(false); }}
        />
      )}

      {(topView === "employee" || !canSeeLeader) && <Portal />}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ThemeProvider>
  );
}
