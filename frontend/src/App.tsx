import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { useGlobalPipelineWatcher, usePipelineStatus } from "./hooks/usePipeline";
import { useDemoState, useUpdateDemoState } from "./hooks/useDemo";
import { api } from "./api/client";
import Header from "./components/layout/Header";
import DemoBanner from "./components/layout/DemoBanner";
import LeaderLayout from "./components/leader/LeaderLayout";
import Portal from "./components/employee/Portal";
import RegisterScreen from "./components/auth/RegisterScreen";
import LoginScreen from "./components/auth/LoginScreen";
import OnboardingScreen from "./components/auth/OnboardingScreen";
import ForceChangePassword from "./components/auth/ForceChangePassword";

export type TopView = "leader" | "employee";

function AppInner() {
  const { state, systemRole, logout, justRegistered, clearJustRegistered, isHostedDemo } = useAuth();
  const [topView, setTopView] = useState<TopView>("leader");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [goToSetup, setGoToSetup] = useState(false);
  const [comingFromDemo, setComingFromDemo] = useState(false);

  const { data: demoState } = useDemoState();
  const updateDemo = useUpdateDemoState();
  const queryClient = useQueryClient();
  // Only poll pipeline status when we're in hosted demo (to show seeding progress)
  const { data: pipelineStatus } = usePipelineStatus(isHostedDemo);

  useGlobalPipelineWatcher(isLoggedIn);

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

  // Hosted demo: skip registration/login entirely
  if (!isHostedDemo) {
    if (state === "register") return <RegisterScreen />;
    if (state === "login") return <LoginScreen />;
    if (typeof state === "object" && state.password_temp) return <ForceChangePassword />;
  }

  // Hosted demo: show seeding progress screen while mock pipeline runs on first boot
  if (isHostedDemo && pipelineStatus?.running) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--c-bg)" }}>
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-5" />
          <p className="text-base font-semibold mb-1" style={{ color: "var(--c-text)" }}>Preparing your demo workspace...</p>
          <p className="text-sm" style={{ color: "var(--c-text-3)" }}>
            Generating 500 AI assets across 10 departments. This takes about 20 seconds.
          </p>
          {pipelineStatus.progress > 0 && (
            <div className="mt-5 w-64 mx-auto">
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--c-border)" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pipelineStatus.progress}%`, background: "#3b82f6" }}
                />
              </div>
              <p className="text-xs mt-2" style={{ color: "var(--c-text-4)" }}>{Math.round(pipelineStatus.progress)}%</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Onboarding choice screen — shown right after first registration (not in hosted demo)
  if (!isHostedDemo && showOnboarding) {
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

  const handleSwitchToProduction = async () => {
    await api.resetRegistry();
    updateDemo.mutate({ enabled: false, size: demoState?.size ?? "medium" });
    queryClient.clear();
    setComingFromDemo(false);
    setGoToSetup(false);
    setShowOnboarding(true);
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--c-bg)", color: "var(--c-text)" }}>
      <Header
        topView={topView}
        onSetView={setTopView}
        canSeeLeader={canSeeLeader}
        onLogout={logout}
        userEmail={typeof state === "object" ? state.email : ""}
      />

      {/* Demo mode banner — persistent reminder with easy exit */}
      {isDemoActive && canSeeLeader && (
        <DemoBanner onSwitchToProduction={handleSwitchToProduction} />
      )}

      {topView === "leader" && canSeeLeader && (
        <LeaderLayout
          initialPage={goToSetup ? "enrichment" : comingFromDemo ? "overview" : undefined}
          onSetupNavigated={() => { setGoToSetup(false); setComingFromDemo(false); }}
          onSwitchToProduction={handleSwitchToProduction}
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
