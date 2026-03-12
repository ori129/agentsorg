interface StepperProps {
  steps: string[];
  currentStep: number;
}

export default function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <nav className="flex items-center justify-between">
      {steps.map((label, i) => {
        const isActive = i === currentStep;
        const isDone = i < currentStep;
        return (
          <div key={label} className="flex items-center flex-1">
            <div className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : isDone
                      ? "bg-green-500 text-white"
                      : ""
                }`}
                style={!isActive && !isDone ? { background: "var(--c-border)", color: "var(--c-text-3)" } : {}}
              >
                {isDone ? "\u2713" : i + 1}
              </div>
              <span
                className="text-sm"
                style={{
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--c-text)" : "var(--c-text-3)",
                }}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="flex-1 h-px mx-4"
                style={{ background: isDone ? "#22c55e" : "var(--c-border)" }}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
