import { useState, useEffect } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { useGlobalPipelineWatcher } from "./hooks/usePipeline";
import Header from "./components/layout/Header";
import LeaderLayout from "./components/leader/LeaderLayout";
import Portal from "./components/employee/Portal";
import RegisterScreen from "./components/auth/RegisterScreen";
import LoginScreen from "./components/auth/LoginScreen";

export type TopView = "leader" | "employee";

function AppInner() {
  const { state, systemRole, logout } = useAuth();
  const [topView, setTopView] = useState<TopView>("leader");

  useGlobalPipelineWatcher();

  // Redirect employees to portal-only view
  useEffect(() => {
    if (systemRole === "employee") {
      setTopView("employee");
    }
  }, [systemRole]);

  if (state === "loading") {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--c-bg)", color: "var(--c-text-4)" }}
      >
        <span className="text-sm">Loading...</span>
      </div>
    );
  }

  if (state === "register") return <RegisterScreen />;
  if (state === "login") return <LoginScreen />;

  // Determine which views the user can access
  const canSeeLeader = systemRole === "system-admin" || systemRole === "ai-leader";

  return (
    <div className="min-h-screen" style={{ background: "var(--c-bg)", color: "var(--c-text)" }}>
      <Header
        topView={topView}
        onSetView={setTopView}
        canSeeLeader={canSeeLeader}
        onLogout={logout}
        userEmail={state.email}
      />

      {topView === "leader" && canSeeLeader && <LeaderLayout />}

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
