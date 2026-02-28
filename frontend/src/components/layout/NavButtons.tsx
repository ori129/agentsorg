interface NavButtonsProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
}

export default function NavButtons({
  currentStep,
  totalSteps,
  onBack,
  onNext,
}: NavButtonsProps) {
  return (
    <div className="flex justify-between mt-8">
      <button
        onClick={onBack}
        disabled={currentStep === 0}
        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Back
      </button>
      {currentStep < totalSteps - 1 && (
        <button
          onClick={onNext}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          Continue
        </button>
      )}
    </div>
  );
}
