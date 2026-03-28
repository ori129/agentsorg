import { useState } from "react";

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
  const [showTooltip, setShowTooltip] = useState(false);

  const isBlocked = !canContinue;

  return (
    <div className="flex justify-between mt-8">
      <button
        onClick={onBack}
        disabled={currentStep === 0}
        className="px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ color: "var(--c-text-2)", background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
      >
        Back
      </button>

      {currentStep < totalSteps - 1 && (
        <div
          className="relative"
          onMouseEnter={() => isBlocked && setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onClick={() => isBlocked && setShowTooltip(true)}
        >
          <button
            onClick={isBlocked ? undefined : onNext}
            disabled={isBlocked}
            className="px-4 py-2 text-sm font-medium text-white rounded-md transition-colors"
            style={{
              background: isBlocked ? "#3b82f660" : "#3b82f6",
              cursor: isBlocked ? "not-allowed" : "pointer",
            }}
          >
            Continue
          </button>

          {showTooltip && isBlocked && blockerMessage && (
            <div
              className="absolute right-0 bottom-full mb-2.5 px-3 py-2 text-xs rounded-lg whitespace-nowrap z-50 shadow-lg"
              style={{
                background: "#0f172a",
                color: "#f1f5f9",
                border: "1px solid #334155",
              }}
            >
              {blockerMessage}
              {/* Caret */}
              <div
                className="absolute right-4 top-full"
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: "6px solid transparent",
                  borderRight: "6px solid transparent",
                  borderTop: "6px solid #334155",
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
