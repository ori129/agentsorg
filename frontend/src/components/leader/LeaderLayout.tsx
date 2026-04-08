import { useEffect, useRef, useState } from "react";
import Sidebar, { type LeaderPage } from "./Sidebar";
import HomePage from "./HomePage";
import PortfolioPage from "./PortfolioPage";
import Overview from "./Overview";
import PipelineSetupPage from "./PipelineSetupPage";
import SyncPage from "./SyncPage";
import ConversationSyncPage from "./ConversationSyncPage";
import RiskPanel from "./RiskPanel";
import QualityScores from "./QualityScores";
import StandardizationOpportunities from "./StandardizationOpportunities";
import Recognition from "./Recognition";
import Learning from "./Learning";
import Workshops from "./Workshops";
import Users from "./Users";
import AdoptionPage from "./AdoptionPage";
import WorkflowsPage from "./WorkflowsPage";
import BuildersPage from "./sub/BuildersPage";
import ProcessesPage from "./sub/ProcessesPage";
import DepartmentsPage from "./sub/DepartmentsPage";
import MaturityPage from "./sub/MaturityPage";
import OutputTypesPage from "./sub/OutputTypesPage";
import { usePipelineGPTs, usePipelineSummary } from "../../hooks/usePipeline";
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
  const { data: summary } = usePipelineSummary();
  const getPageFromHash = (): LeaderPage => {
    const hash = window.location.hash.slice(1);
    return (hash as LeaderPage) || "home";
  };

  const [page, setPage] = useState<LeaderPage>(getPageFromHash);
  const didRedirect = useRef(false);

  // Sync page → browser history
  const navigateTo = (p: LeaderPage) => {
    if (p !== page) {
      window.history.pushState({ page: p }, "", `#${p}`);
    }
    setPage(p);
  };

  // Handle browser back/forward
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const p = (e.state?.page as LeaderPage) || getPageFromHash();
      setPage(p);
    };
    window.addEventListener("popstate", onPop);
    // Seed initial history entry so back works from first page
    window.history.replaceState({ page }, "", `#${page}`);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Honor explicit initialPage from parent — also invalidate cache so fresh data loads
  useEffect(() => {
    if (initialPage) {
      navigateTo(initialPage);
      onSetupNavigated?.();
      queryClient.invalidateQueries({ queryKey: ["pipeline-gpts"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-summary"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-recommendations"] });
    }
  }, [initialPage]);

  useEffect(() => {
    if (isSuccess && !didRedirect.current && !initialPage) {
      didRedirect.current = true;
      if (gpts.length === 0 && isAdmin) {
        navigateTo("enrichment");
      }
    }
  }, [isSuccess, gpts.length, isAdmin]);

  const riskCount = gpts.filter(
    (g) => g.risk_score != null && g.risk_score >= 50
  ).length;

  const enrichedCount = gpts.filter((g) => g.semantic_enriched_at).length;
  const enrichmentPct = gpts.length > 0 ? (enrichedCount / gpts.length) * 100 : 0;
  const scoredCount = summary?.scores_assessed ?? 0;

  const handleSetPage = (p: LeaderPage) => {
    navigateTo(p);
  };

  return (
    <div
      className="flex"
      style={{ height: "calc(100vh - 53px)", overflow: "hidden" }}
    >
      <Sidebar
        page={page}
        onSetPage={handleSetPage}
        riskCount={riskCount}
        clusterCount={0}
        enrichmentPct={gpts.length > 0 ? enrichmentPct : undefined}
        isAdmin={isAdmin}
        scoredCount={scoredCount}
      />
      <main
        className="flex-1"
        style={{
          minWidth: 0,
          overflowY: (page === "standardization" || page === "portfolio") ? "hidden" : "auto",
          display: (page === "standardization" || page === "portfolio") ? "flex" : "block",
          flexDirection: "column",
        }}
      >
        {/* New navigation */}
        {page === "home" && <HomePage gpts={gpts} onSetPage={handleSetPage} />}
        {page === "portfolio" && <PortfolioPage gpts={gpts} />}
        {(page === "enablement" || page === "enablement:recognition") && <Recognition gpts={gpts} />}
        {page === "enablement:learning" && <Learning />}
        {page === "enablement:workshops" && <Workshops />}
        {page === "adoption" && <AdoptionPage onSetPage={handleSetPage} />}
        {page === "workflows" && <WorkflowsPage />}
        {page === "opportunities" && <StandardizationOpportunities gpts={gpts} />}

        {/* Legacy / Overview sub-pages */}
        {page === "overview" && <Overview gpts={gpts} onSetPage={handleSetPage} onSwitchToProduction={onSwitchToProduction} />}
        {page === "overview:builders" && <BuildersPage gpts={gpts} onBack={() => handleSetPage("overview")} />}
        {page === "overview:processes" && <ProcessesPage gpts={gpts} onBack={() => handleSetPage("overview")} />}
        {page === "overview:departments" && <DepartmentsPage gpts={gpts} onBack={() => handleSetPage("overview")} />}
        {page === "overview:maturity" && <MaturityPage gpts={gpts} onBack={() => handleSetPage("overview")} />}
        {page === "overview:output-types" && <OutputTypesPage gpts={gpts} onBack={() => handleSetPage("overview")} />}

        {/* Settings */}
        {page === "sync" && <SyncPage isAdmin={isAdmin} />}
        {page === "conversation-sync" && <ConversationSyncPage isAdmin={isAdmin} />}
        {page === "enrichment" && <PipelineSetupPage onComplete={() => setPage("sync")} />}
        {page === "risk" && <RiskPanel gpts={gpts} />}
        {page === "quality" && <QualityScores gpts={gpts} />}
        {page === "standardization" && <StandardizationOpportunities gpts={gpts} />}
        {page === "recognition" && <Recognition gpts={gpts} />}
        {page === "learning" && <Learning />}
        {page === "workshops" && <Workshops />}
        {page === "users" && <Users />}
      </main>
    </div>
  );
}
