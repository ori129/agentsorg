import { useState } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useGlobalPipelineWatcher } from "./hooks/usePipeline";
import Header from "./components/layout/Header";
import Stepper from "./components/layout/Stepper";
import NavButtons from "./components/layout/NavButtons";
import Step1ApiConfig from "./components/steps/Step1ApiConfig";
import Step2FilterRules from "./components/steps/Step2FilterRules";
import Step3Categories from "./components/steps/Step3Categories";
import Step4FetchClassify from "./components/steps/Step4FetchClassify";
import ResultsDashboard from "./components/ResultsDashboard";
import LeaderLayout from "./components/leader/LeaderLayout";
import Portal from "./components/employee/Portal";

const STEPS = [
  "API Configuration",
  "Filtering Rules",
  "Categories",
  "Fetch & Classify",
];

export type TopView = "leader" | "wizard" | "employee";

function AppInner() {
  const [currentStep, setCurrentStep] = useState(0);
  const [topView, setTopView] = useState<TopView>("leader");
  const [wizardInnerView, setWizardInnerView] = useState<"wizard" | "results">("wizard");

  useGlobalPipelineWatcher();

  return (
    <div className="min-h-screen" style={{ background: "var(--c-bg)", color: "var(--c-text)" }}>
      <Header topView={topView} onSetView={setTopView} />

      {topView === "leader" && <LeaderLayout onOpenWizard={() => setTopView("wizard")} />}

      {topView === "employee" && <Portal />}

      {topView === "wizard" && (
        <main className="max-w-4xl mx-auto px-4 py-8">
          {wizardInnerView === "wizard" ? (
            <>
              <Stepper steps={STEPS} currentStep={currentStep} />
              <div className="mt-8">
                {currentStep === 0 && <Step1ApiConfig />}
                {currentStep === 1 && <Step2FilterRules />}
                {currentStep === 2 && <Step3Categories />}
                {currentStep === 3 && (
                  <Step4FetchClassify
                    onViewResults={() => setWizardInnerView("results")}
                  />
                )}
              </div>
              <NavButtons
                currentStep={currentStep}
                totalSteps={STEPS.length}
                onBack={() => setCurrentStep((s) => s - 1)}
                onNext={() => setCurrentStep((s) => s + 1)}
              />
            </>
          ) : (
            <ResultsDashboard
              onBackToSetup={() => {
                setWizardInnerView("wizard");
                setCurrentStep(3);
              }}
            />
          )}
        </main>
      )}
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
