export default function Header() {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">GPT Registry</h1>
          <p className="text-sm text-gray-500">
            Discover and catalog Custom GPTs across your organization
          </p>
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
          v1.0
        </span>
      </div>
    </header>
  );
}
