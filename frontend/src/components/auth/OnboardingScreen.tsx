import { useState, useEffect, useRef } from "react";
import { api } from "../../api/client";

interface Props {
  onDemo: () => void;       // called when demo is fully loaded
  onProduction: () => void; // called when user chooses production setup
}

type Phase = "choice" | "loading" | "done";

export default function OnboardingScreen({ onDemo, onProduction }: Props) {
  const [phase, setPhase] = useState<Phase>("choice");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("Starting...");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleTryDemo = async () => {
    setPhase("loading");
    setProgress(0);
    setStage("Initialising demo...");
    try {
      await api.updateDemoState({ enabled: true, size: "medium" });
      await api.runPipeline();
      pollRef.current = setInterval(async () => {
        try {
          const status = await api.getPipelineStatus();
          setProgress(Math.round(status.progress));
          setStage(status.stage ?? "Running...");
          if (!status.running) {
            clearInterval(pollRef.current!);
            setPhase("done");
            setTimeout(onDemo, 800);
          }
        } catch { /* ignore transient errors */ }
      }, 1500);
    } catch {
      setPhase("choice");
    }
  };

  if (phase === "loading" || phase === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--c-bg)" }}>
        <div className="w-full max-w-md text-center">
          <div className="flex items-center justify-center gap-2.5 mb-10">
            <svg width="32" height="32" viewBox="0 0 28 28" fill="none" style={{ color: "var(--c-text)" }}>
              <rect x="1.5" y="1.5" width="25" height="25" rx="4" stroke="currentColor" strokeWidth="2"/>
              <circle cx="10" cy="10" r="4" fill="currentColor"/>
            </svg>
            <span className="text-xl font-bold tracking-tight" style={{ color: "var(--c-text)" }}>AgentsOrg.ai</span>
          </div>

          {phase === "done" ? (
            <div className="mb-8">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}>
                <svg className="w-7 h-7" fill="none" stroke="#10b981" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
              </div>
              <p className="text-lg font-semibold" style={{ color: "var(--c-text)" }}>Loading your dashboard...</p>
            </div>
          ) : (
            <div className="mb-8">
              <p className="text-lg font-semibold mb-1" style={{ color: "var(--c-text)" }}>Building your demo workspace</p>
              <p className="text-sm" style={{ color: "var(--c-text-3)" }}>Generating 500 realistic GPTs across 10 departments</p>
            </div>
          )}

          <div className="rounded-2xl p-6" style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
            <div className="flex justify-between text-xs mb-2" style={{ color: "var(--c-text-3)" }}>
              <span>{stage}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--c-border)" }}>
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${phase === "done" ? 100 : progress}%`,
                  background: phase === "done" ? "#10b981" : "#3b82f6",
                }}
              />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              {["Fetch", "Classify", "Enrich"].map((s, i) => (
                <div key={s} className="p-2 rounded-lg" style={{ background: "var(--c-bg)", opacity: progress > i * 33 ? 1 : 0.3 }}>
                  <div className="text-xs font-medium" style={{ color: "var(--c-text)" }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Choice screen
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--c-bg)" }}>
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <svg width="32" height="32" viewBox="0 0 28 28" fill="none" style={{ color: "var(--c-text)" }}>
            <rect x="1.5" y="1.5" width="25" height="25" rx="4" stroke="currentColor" strokeWidth="2"/>
            <circle cx="10" cy="10" r="4" fill="currentColor"/>
          </svg>
          <span className="text-xl font-bold tracking-tight" style={{ color: "var(--c-text)" }}>AgentsOrg.ai</span>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--c-text)" }}>How would you like to start?</h1>
          <p className="text-sm" style={{ color: "var(--c-text-3)" }}>
            You can switch between demo and production at any time.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Demo */}
          <button
            onClick={handleTryDemo}
            className="p-6 rounded-2xl text-left group hover:scale-[1.02] transition-all"
            style={{ background: "var(--c-surface)", border: "1px solid #3b82f640", outline: "none" }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: "rgba(59,130,246,0.1)" }}>
              <svg className="w-5 h-5" fill="none" stroke="#3b82f6" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div className="text-base font-semibold mb-1" style={{ color: "var(--c-text)" }}>Try Demo</div>
            <div className="text-xs leading-relaxed" style={{ color: "var(--c-text-3)" }}>
              Explore with 500 realistic GPTs across 10 departments. No API key needed. Switch to production when ready.
            </div>
            <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium" style={{ color: "#3b82f6" }}>
              Launch demo
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
            </div>
          </button>

          {/* Production */}
          <button
            onClick={onProduction}
            className="p-6 rounded-2xl text-left group hover:scale-[1.02] transition-all"
            style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", outline: "none" }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: "rgba(16,185,129,0.1)" }}>
              <svg className="w-5 h-5" fill="none" stroke="#10b981" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            </div>
            <div className="text-base font-semibold mb-1" style={{ color: "var(--c-text)" }}>Connect to Production</div>
            <div className="text-xs leading-relaxed" style={{ color: "var(--c-text-3)" }}>
              Connect your OpenAI Compliance API key and scan your real workspace GPTs.
            </div>
            <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium" style={{ color: "#10b981" }}>
              Start setup
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
            </div>
          </button>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "var(--c-text-4)" }}>
          Self-hosted &middot; Your data stays on your infrastructure
        </p>
      </div>
    </div>
  );
}
