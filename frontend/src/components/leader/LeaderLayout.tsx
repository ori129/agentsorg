import { useEffect, useRef, useState } from "react";
import Sidebar, { type LeaderPage } from "./Sidebar";
import Overview from "./Overview";
import PipelineSetupPage from "./PipelineSetupPage";
import SyncPage from "./SyncPage";
import RiskPanel from "./RiskPanel";
import QualityScores from "./QualityScores";
import Duplicates from "./Duplicates";
import Recognition from "./Recognition";
import Learning from "./Learning";
import Workshops from "./Workshops";
import Users from "./Users";
import BuildersPage from "./sub/BuildersPage";
import ProcessesPage from "./sub/ProcessesPage";
import DepartmentsPage from "./sub/DepartmentsPage";
import MaturityPage from "./sub/MaturityPage";
import OutputTypesPage from "./sub/OutputTypesPage";
import { usePipelineGPTs } from "../../hooks/usePipeline";
import { useAuth } from "../../contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";

interface LeaderLayoutProps {
  initialPage?: LeaderPage;
  onSetupNavigated?: () => void;
  onSwitchToProduction?: () => void;
}

export default function LeaderLayout({ initialPage, onSetupNavigated, onSwitchToProduction }: LeaderLayoutProps) {
  const { systemRole } = useAuth();
  const isAdmin = systemRole === "system-admin";
  const queryClient = useQueryClient();
  const { data: gpts = [], isSuccess } = usePipelineGPTs();
  const [page, setPage] = useState<LeaderPage>("overview");
  const didRedirect = useRef(false);

  // Honor explicit initialPage from parent — also invalidate cache so fresh data loads
  useEffect(() => {
    if (initialPage) {
      setPage(initialPage);
      onSetupNavigated?.();
      // Force refetch all pipeline data (important after demo pipeline completes)
      queryClient.invalidateQueries({ queryKey: ["pipeline-gpts"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-summary"] });
    }
  }, [initialPage]);

  useEffect(() => {
    if (isSuccess && !didRedirect.current && !initialPage) {
      didRedirect.current = true;
      if (gpts.length === 0 && isAdmin) {
        setPage("enrichment");
      }
    }
  }, [isSuccess, gpts.length, isAdmin]);

  const riskCount = gpts.filter(
    (g) => g.risk_level === "high" || g.risk_level === "critical"
  ).length;

  const enrichedCount = gpts.filter((g) => g.semantic_enriched_at).length;
  const enrichmentPct = gpts.length > 0 ? (enrichedCount / gpts.length) * 100 : 0;

  return (
    <div
      className="flex"
      style={{ height: "calc(100vh - 53px)", overflow: "hidden" }}
    >
      <Sidebar
        page={page}
        onSetPage={setPage}
        riskCount={riskCount}
        duplicateCount={0}
        enrichmentPct={gpts.length > 0 ? enrichmentPct : undefined}
        isAdmin={isAdmin}
      />
      <main className="flex-1 overflow-y-auto" style={{ minWidth: 0 }}>
        {page === "overview" && <Overview gpts={gpts} onSetPage={setPage} onSwitchToProduction={onSwitchToProduction} />}
        {page === "overview:builders" && <BuildersPage gpts={gpts} onBack={() => setPage("overview")} />}
        {page === "overview:processes" && <ProcessesPage gpts={gpts} onBack={() => setPage("overview")} />}
        {page === "overview:departments" && <DepartmentsPage gpts={gpts} onBack={() => setPage("overview")} />}
        {page === "overview:maturity" && <MaturityPage gpts={gpts} onBack={() => setPage("overview")} />}
        {page === "overview:output-types" && <OutputTypesPage gpts={gpts} onBack={() => setPage("overview")} />}
        {page === "sync" && <SyncPage isAdmin={isAdmin} />}
        {page === "enrichment" && <PipelineSetupPage onComplete={() => setPage("sync")} />}
        {page === "risk" && <RiskPanel gpts={gpts} />}
        {page === "quality" && <QualityScores gpts={gpts} />}
        {page === "duplicates" && <Duplicates gpts={gpts} />}
        {page === "recognition" && <Recognition gpts={gpts} />}
        {page === "learning" && <Learning />}
        {page === "workshops" && <Workshops />}
        {page === "users" && <Users />}
      </main>
    </div>
  );
}
