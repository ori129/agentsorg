import { useState } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useGlobalPipelineWatcher } from "./hooks/usePipeline";
import Header from "./components/layout/Header";
import LeaderLayout from "./components/leader/LeaderLayout";
import Portal from "./components/employee/Portal";

export type TopView = "leader" | "employee";

function AppInner() {
  const [topView, setTopView] = useState<TopView>("leader");

  useGlobalPipelineWatcher();

  return (
    <div className="min-h-screen" style={{ background: "var(--c-bg)", color: "var(--c-text)" }}>
      <Header topView={topView} onSetView={setTopView} />

      {topView === "leader" && <LeaderLayout />}

      {topView === "employee" && <Portal />}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
