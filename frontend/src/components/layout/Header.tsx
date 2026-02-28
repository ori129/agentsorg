import { useDemoState, useUpdateDemoState } from "../../hooks/useDemo";

const SIZE_OPTIONS = [
  { value: "small", label: "Small (50)" },
  { value: "medium", label: "Medium (500)" },
  { value: "large", label: "Large (2K)" },
  { value: "enterprise", label: "Enterprise (5K)" },
];

export default function Header() {
  const { data: demoState } = useDemoState();
  const updateDemo = useUpdateDemoState();

  const handleToggle = () => {
    if (!demoState) return;
    updateDemo.mutate({
      enabled: !demoState.enabled,
      size: demoState.size,
    });
  };

  const handleSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!demoState) return;
    updateDemo.mutate({
      enabled: demoState.enabled,
      size: e.target.value,
    });
  };

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">GPT Registry</h1>
          <p className="text-sm text-gray-500">
            Discover and catalog Custom GPTs across your organization
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggle}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                demoState?.enabled
                  ? "bg-amber-100 border-amber-300 text-amber-800"
                  : "bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {demoState?.enabled ? "DEMO ON" : "Demo"}
            </button>
            {demoState?.enabled && (
              <select
                value={demoState.size}
                onChange={handleSizeChange}
                className="text-xs border border-amber-300 rounded px-2 py-1 bg-amber-50 text-amber-800"
              >
                {SIZE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
            v1.0
          </span>
        </div>
      </div>
    </header>
  );
}
