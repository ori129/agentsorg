interface Props {
  onSwitchToProduction: () => void;
}

export default function DemoBanner({ onSwitchToProduction }: Props) {
  return (
    <div
      className="flex items-center justify-between px-6 py-2 text-xs font-medium"
      style={{ background: "#1c1200", borderBottom: "1px solid #78350f", color: "#f59e0b" }}
    >
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />
        Demo Mode — exploring with sample data. Not connected to your real workspace.
      </div>
      <button
        onClick={onSwitchToProduction}
        className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold transition-colors hover:bg-amber-500/20"
        style={{ color: "#f59e0b", border: "1px solid #78350f" }}
      >
        Switch to Production
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
        </svg>
      </button>
    </div>
  );
}
