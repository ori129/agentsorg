import { useState } from "react";
import Header from "./components/layout/Header";
import Stepper from "./components/layout/Stepper";
import NavButtons from "./components/layout/NavButtons";
import Step1ApiConfig from "./components/steps/Step1ApiConfig";
import Step2FilterRules from "./components/steps/Step2FilterRules";
import Step3Categories from "./components/steps/Step3Categories";
import Step4FetchClassify from "./components/steps/Step4FetchClassify";

const STEPS = [
  "API Configuration",
  "Filtering Rules",
  "Categories",
  "Fetch & Classify",
];

export default function App() {
  const [currentStep, setCurrentStep] = useState(0);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <Stepper steps={STEPS} currentStep={currentStep} />
        <div className="mt-8">
          {currentStep === 0 && <Step1ApiConfig />}
          {currentStep === 1 && <Step2FilterRules />}
          {currentStep === 2 && <Step3Categories />}
          {currentStep === 3 && <Step4FetchClassify />}
        </div>
        <NavButtons
          currentStep={currentStep}
          totalSteps={STEPS.length}
          onBack={() => setCurrentStep((s) => s - 1)}
          onNext={() => setCurrentStep((s) => s + 1)}
        />
      </main>
    </div>
  );
}
