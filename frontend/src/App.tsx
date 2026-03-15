import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { useGlobalPipelineWatcher } from "./hooks/usePipeline";
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
  const { state, systemRole, logout, justRegistered, clearJustRegistered } = useAuth();
  const [topView, setTopView] = useState<TopView>("leader");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [goToSetup, setGoToSetup] = useState(false);
  const [comingFromDemo, setComingFromDemo] = useState(false);

  const { data: demoState } = useDemoState();
  const updateDemo = useUpdateDemoState();
  const queryClient = useQueryClient();

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

  // Force password change when account is using a temporary password
  if (typeof state === "object" && state.password_temp) {
    return <ForceChangePassword />;
  }

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
