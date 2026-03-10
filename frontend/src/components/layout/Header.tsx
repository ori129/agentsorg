import type { TopView } from "../../App";
import { usePipelineSummary, usePipelineStatus } from "../../hooks/usePipeline";
import { useDemoState, useUpdateDemoState } from "../../hooks/useDemo";
import { useTheme } from "../../contexts/ThemeContext";
import { useAuth } from "../../contexts/AuthContext";

const SIZE_OPTIONS = [
  { value: "small", label: "Small (50)" },
  { value: "medium", label: "Medium (500)" },
  { value: "large", label: "Large (2K)" },
  { value: "enterprise", label: "Enterprise (5K)" },
];

interface HeaderProps {
  topView: TopView;
  onSetView: (v: TopView) => void;
  canSeeLeader: boolean;
  onLogout: () => void;
  userEmail: string;
}

export default function Header({ topView, onSetView, canSeeLeader, onLogout, userEmail }: HeaderProps) {
  const { data: summary } = usePipelineSummary();
  const { data: pipelineStatus } = usePipelineStatus(false);
  const { data: demoState } = useDemoState();
  const updateDemo = useUpdateDemoState();
  const { theme, toggleTheme } = useTheme();
  const { systemRole } = useAuth();
  const isAdmin = systemRole === "system-admin";
  const isRunning = pipelineStatus?.running ?? false;

  const handleDemoToggle = () => {
    if (!demoState) return;
    updateDemo.mutate({ enabled: !demoState.enabled, size: demoState.size });
  };

  const handleSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!demoState) return;
    updateDemo.mutate({ enabled: demoState.enabled, size: e.target.value });
  };

  const lastSync = summary?.last_sync;
  const gptCount = summary?.filtered_gpts ?? 0;
  let syncLabel = "Not synced";
  if (lastSync?.finished_at) {
    const diff = Date.now() - new Date(lastSync.finished_at).getTime();
    const h = Math.floor(diff / 3600000);
    syncLabel = h < 1 ? "Synced <1h ago" : `Synced ${h}h ago`;
  }

  const tabs: { id: TopView; label: string }[] = [];
  if (canSeeLeader) tabs.push({ id: "leader", label: "Leader View" });
  tabs.push({ id: "employee", label: "Employee Portal" });

  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between px-6 py-3"
      style={{ background: "var(--c-surface)", borderBottom: "1px solid var(--c-border)" }}
    >
      {/* Left: Logo */}
      <div className="flex items-center gap-2.5">
        <svg width="26" height="26" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: "var(--c-text)" }}>
          <rect x="1.5" y="1.5" width="25" height="25" rx="4" stroke="currentColor" strokeWidth="2"/>
          <circle cx="10" cy="10" r="4" fill="currentColor"/>
        </svg>
        <div>
          <div className="text-sm font-bold tracking-tight" style={{ color: "var(--c-text)" }}>
            AgentsOrg.ai
          </div>
          <div className="text-xs" style={{ color: "var(--c-text-4)" }}>
            AI Transformation Intelligence
          </div>
        </div>
      </div>

      {/* Center: Nav tabs */}
      <div
        className="flex items-center rounded-lg p-0.5 gap-0.5"
        style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onSetView(tab.id)}
            className="px-4 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={
              topView === tab.id
                ? { background: "var(--c-accent-bg)", color: "#3b82f6" }
                : { color: "var(--c-text-3)" }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Right: demo toggle + sync status + user + theme */}
      <div className="flex items-center gap-3">
        {/* Demo toggle — admin only */}
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleDemoToggle}
              className="text-xs font-medium px-3 py-1 rounded-full border transition-colors"
              style={
                demoState?.enabled
                  ? { background: "#1c1200", borderColor: "#78350f", color: "#f59e0b" }
                  : { background: "var(--c-border)", borderColor: "var(--c-border)", color: "var(--c-text-4)" }
              }
            >
              {demoState?.enabled ? "DEMO ON" : "Demo"}
            </button>
            {demoState?.enabled && (
              <select
                value={demoState.size}
                onChange={handleSizeChange}
                className="text-xs px-2 py-1 rounded border outline-none"
                style={{ background: "#1c1200", borderColor: "#78350f", color: "#f59e0b" }}
              >
                {SIZE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {isRunning ? (
          <div className="flex items-center gap-2 text-xs" style={{ color: "#f59e0b" }}>
            <span
              className="inline-block w-2 h-2 rounded-full animate-pulse"
              style={{ background: "#f59e0b" }}
            />
            Pipeline running...
          </div>
        ) : gptCount > 0 ? (
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--c-text-3)" }}>
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: "#10b981", boxShadow: "0 0 6px #10b981" }}
            />
            {syncLabel} · {gptCount} GPTs
          </div>
        ) : null}

        {/* User email + logout */}
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--c-text-4)" }}>
            {userEmail}
          </span>
          <button
            onClick={onLogout}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{ color: "var(--c-text-4)", background: "var(--c-border)" }}
            title="Sign out"
          >
            Sign out
          </button>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="text-sm w-7 h-7 rounded-md flex items-center justify-center transition-colors"
          style={{ background: "var(--c-border)", color: "var(--c-text-3)" }}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </div>
    </header>
  );
}
