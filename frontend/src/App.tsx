import { useState } from "react";
import Header from "./components/layout/Header";
import Stepper from "./components/layout/Stepper";
import NavButtons from "./components/layout/NavButtons";
import Step1ApiConfig from "./components/steps/Step1ApiConfig";
import Step2FilterRules from "./components/steps/Step2FilterRules";
import Step3Categories from "./components/steps/Step3Categories";
import Step4FetchClassify from "./components/steps/Step4FetchClassify";
import ResultsDashboard from "./components/ResultsDashboard";

const STEPS = [
  "API Configuration",
  "Filtering Rules",
  "Categories",
  "Fetch & Classify",
];

type View = "wizard" | "results";

export default function App() {
  const [currentStep, setCurrentStep] = useState(0);
  const [view, setView] = useState<View>("wizard");

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {view === "wizard" ? (
          <>
            <Stepper steps={STEPS} currentStep={currentStep} />
            <div className="mt-8">
              {currentStep === 0 && <Step1ApiConfig />}
              {currentStep === 1 && <Step2FilterRules />}
              {currentStep === 2 && <Step3Categories />}
              {currentStep === 3 && (
                <Step4FetchClassify
                  onViewResults={() => setView("results")}
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
              setView("wizard");
              setCurrentStep(3);
            }}
          />
        )}
      </main>
    </div>
  );
}
