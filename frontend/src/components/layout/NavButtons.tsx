interface NavButtonsProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  canContinue?: boolean;
  blockerMessage?: string;
}

export default function NavButtons({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  canContinue = true,
  blockerMessage,
}: NavButtonsProps) {
  const isBlocked = !canContinue;

  return (
    <div className="mt-8">
      {/* Blocker message — always visible when blocked, not hidden behind hover */}
      {isBlocked && blockerMessage && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3 text-sm"
          style={{ background: "#f59e0b0f", border: "1px solid #f59e0b30", color: "#f59e0b" }}
        >
          <span style={{ fontSize: 14 }}>→</span>
          {blockerMessage}
        </div>
      )}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          disabled={currentStep === 0}
          className="px-4 py-2 text-sm font-medium rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ color: "var(--c-text-2)", background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
        >
          ← Back
        </button>

        {currentStep < totalSteps - 1 && (
          <button
            onClick={isBlocked ? undefined : onNext}
            disabled={isBlocked}
            className="px-5 py-2 text-sm font-medium text-white rounded-md transition-opacity"
            style={{
              background: "#3b82f6",
              opacity: isBlocked ? 0.4 : 1,
              cursor: isBlocked ? "not-allowed" : "pointer",
            }}
          >
            Continue →
          </button>
        )}
      </div>
    </div>
  );
}
