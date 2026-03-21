import { useRef, useState } from "react";
import { useCustomCourses, useRecognition, useRecommendOrg } from "../../hooks/useLearning";
import { customCoursesApi, learningApi } from "../../api/learning";
import type { CourseRecommendation, CustomCourseUploadResult, OrgLearningReport, EmployeeLearningReport } from "../../api/learning";

type Tab = "org" | "people" | "custom";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function CategoryBadge({ category }: { category: string }) {
  // derive a consistent accent from the category string
  const colors: Record<string, string> = {
    "Prompt Engineering": "#6366f1",
    "GPT Building": "#3b82f6",
    "Governance & Safety": "#ef4444",
    "Business Application": "#10b981",
    "Advanced Use Cases": "#8b5cf6",
    Leadership: "#f59e0b",
    "UX & Adoption": "#06b6d4",
    "AI for Business": "#10b981",
    "ChatGPT at Work": "#3b82f6",
    "AI Techniques": "#8b5cf6",
  };
  const color = colors[category] ?? "#6366f1";
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ background: color + "22", color, border: `1px solid ${color}44` }}
    >
      {category}
    </span>
  );
}

function CourseCard({ rec, index }: { rec: CourseRecommendation; index: number }) {
  const isVideo = rec.url.includes("/videos/");
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: "var(--c-accent-deep)", border: "1px solid var(--c-border)" }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
              style={{ background: "var(--c-accent-bg)", color: "#3b82f6" }}
            >
              {index + 1}
            </span>
            <CategoryBadge category={rec.category} />
            {isVideo && (
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1"
                style={{ background: "#ef444420", color: "#ef4444", border: "1px solid #ef444430" }}
              >
                ▶ Video
              </span>
            )}
          </div>
          <div className="font-semibold text-sm" style={{ color: "var(--c-text)" }}>
            {rec.course_name}
          </div>
        </div>
        <a
          href={rec.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0 font-medium"
          style={{ background: "var(--c-accent-bg)", color: "#3b82f6", border: "1px solid #3b82f644" }}
        >
          Open Academy →
        </a>
      </div>

      {/* Reasoning block — prominent per user request */}
      <div
        className="rounded-lg px-3 py-3 text-sm leading-relaxed"
        style={{
          background: "var(--c-surface)",
          color: "var(--c-text-3)",
          borderLeft: "3px solid #6366f1",
        }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider block mb-1"
          style={{ color: "#6366f1" }}
        >
          Why this course
        </span>
        {rec.reasoning}
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      className="rounded-lg px-4 py-3 text-sm"
      style={{ background: "#ef444415", color: "#ef4444", border: "1px solid #ef444430" }}
    >
      {message}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-xs font-semibold uppercase tracking-wider"
      style={{ color: "var(--c-text-4)" }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Org tab
// ---------------------------------------------------------------------------

function OrgTab() {
  const mutation = useRecommendOrg();
  const report = mutation.data as OrgLearningReport | undefined;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm" style={{ color: "var(--c-text-3)" }}>
            Analyses the entire AI asset registry and surfaces the top skill gaps for your org,
            then maps them to specific OpenAI Academy courses.
          </p>
        </div>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium flex-shrink-0"
          style={{
            background: "var(--c-accent-bg)",
            color: mutation.isPending ? "var(--c-text-4)" : "#3b82f6",
            border: "1px solid #3b82f644",
            cursor: mutation.isPending ? "not-allowed" : "pointer",
            opacity: mutation.isPending ? 0.7 : 1,
          }}
        >
          {mutation.isPending && (
            <span className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          )}
          {mutation.isPending ? "Analysing…" : "Analyse Org ▶"}
        </button>
      </div>

      {mutation.isError && (
        <ErrorBox
          message={
            mutation.error instanceof Error && mutation.error.message.includes("API key")
              ? "Configure your OpenAI API key in Settings to enable recommendations."
              : (mutation.error as Error)?.message ?? "Analysis failed."
          }
        />
      )}

      {report && (
        <div className="flex flex-col gap-5">
          {/* Summary */}
          <div
            className="rounded-xl px-4 py-3 text-sm leading-relaxed"
            style={{
              background: "var(--c-accent-deep)",
              color: "var(--c-text-3)",
              border: "1px solid var(--c-border)",
            }}
          >
            {report.summary}
          </div>

          {/* Gaps */}
          {report.skill_gaps.length > 0 && (
            <div className="flex flex-col gap-3">
              <SectionLabel>Identified skill gaps</SectionLabel>
              <ul className="flex flex-col gap-2">
                {report.skill_gaps.map((gap, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--c-text-3)" }}>
                    <span style={{ color: "#f59e0b", flexShrink: 0, marginTop: 2 }}>▸</span>
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Courses */}
          {report.recommended_courses.length > 0 ? (
            <div className="flex flex-col gap-3">
              <SectionLabel>Recommended courses ({report.recommended_courses.length})</SectionLabel>
              {report.recommended_courses.map((c, i) => (
                <CourseCard key={c.course_name} rec={c} index={i} />
              ))}
            </div>
          ) : report.skill_gaps.length > 0 ? (
            <div
              className="rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3"
              style={{ background: "var(--c-accent-deep)", border: "1px solid var(--c-border)", color: "var(--c-text-3)" }}
            >
              <span>Skill gaps identified. Browse courses manually on OpenAI Academy.</span>
              <a
                href="https://academy.openai.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0 font-medium"
                style={{ background: "var(--c-accent-bg)", color: "#3b82f6", border: "1px solid #3b82f644" }}
              >
                Open Academy →
              </a>
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--c-text-4)" }}>
              No specific course gaps identified — the org's AI asset quality looks solid.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// People tab
// ---------------------------------------------------------------------------

function PeopleTab() {
  const { data: builders = [], isLoading } = useRecognition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, EmployeeLearningReport>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (email: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(builders.map((b) => b.email)));
  const clearAll = () => setSelected(new Set());

  const run = async () => {
    if (selected.size === 0) return;
    const emails = [...selected];

    // kick off all in parallel
    setLoading(new Set(emails));
    setResults({});
    setErrors({});
    setExpanded(new Set(emails)); // auto-expand results

    await Promise.allSettled(
      emails.map(async (email) => {
        try {
          const report = await learningApi.recommendEmployee(email);
          setResults((prev) => ({ ...prev, [email]: report }));
        } catch (e) {
          setErrors((prev) => ({
            ...prev,
            [email]: e instanceof Error ? e.message : "Analysis failed.",
          }));
        } finally {
          setLoading((prev) => {
            const next = new Set(prev);
            next.delete(email);
            return next;
          });
        }
      })
    );
  };

  const anyPending = loading.size > 0;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm" style={{ color: "var(--c-text-4)" }}>
        <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        Loading builders…
      </div>
    );
  }

  if (!builders.length) {
    return (
      <p className="text-sm py-4" style={{ color: "var(--c-text-4)" }}>
        No builders found. Run a sync to populate the registry.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Builder selector */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--c-border)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ background: "var(--c-surface)", borderColor: "var(--c-border)" }}
        >
          <span className="text-sm font-medium" style={{ color: "var(--c-text)" }}>
            {selected.size === 0
              ? "Select builders"
              : `${selected.size} of ${builders.length} selected`}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={selectAll}
              className="text-xs"
              style={{ color: "#3b82f6" }}
            >
              Select all
            </button>
            <span style={{ color: "var(--c-border)" }}>|</span>
            <button
              onClick={clearAll}
              className="text-xs"
              style={{ color: "var(--c-text-4)" }}
            >
              Clear
            </button>
            <button
              onClick={run}
              disabled={selected.size === 0 || anyPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{
                background: selected.size === 0 || anyPending ? "var(--c-border)" : "var(--c-accent-bg)",
                color: selected.size === 0 || anyPending ? "var(--c-text-5)" : "#3b82f6",
                border: `1px solid ${selected.size === 0 || anyPending ? "var(--c-border)" : "#3b82f644"}`,
                cursor: selected.size === 0 || anyPending ? "not-allowed" : "pointer",
              }}
            >
              {anyPending && (
                <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              )}
              {anyPending
                ? `Analysing ${loading.size}…`
                : selected.size === 0
                ? "Get Recommendations ▶"
                : `Get Recommendations for ${selected.size} ▶`}
            </button>
          </div>
        </div>

        {/* Builder list */}
        <div style={{ background: "var(--c-surface)", maxHeight: 380, overflowY: "auto" }}>
          {builders.map((b, i) => {
            const checked = selected.has(b.email);
            return (
              <label
                key={b.email}
                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors"
                style={{
                  background: checked ? "var(--c-accent-deep)" : "transparent",
                  borderTop: i > 0 ? "1px solid var(--c-border)" : "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(b.email)}
                  className="rounded"
                  style={{ accentColor: "#3b82f6" }}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium" style={{ color: "var(--c-text)" }}>
                    {b.name || b.email.split("@")[0]}
                  </span>
                  <span className="text-xs ml-2" style={{ color: "var(--c-text-4)" }}>
                    {b.email}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs flex-shrink-0" style={{ color: "var(--c-text-4)" }}>
                  <span>{b.gpt_count} assets</span>
                  <span
                    className="font-semibold"
                    style={{
                      color:
                        b.composite_score >= 60
                          ? "#10b981"
                          : b.composite_score >= 40
                          ? "#3b82f6"
                          : "#f59e0b",
                    }}
                  >
                    {b.composite_score}
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      </div>


      {/* Per-person results */}
      {[...selected].map((email) => {
        const builder = builders.find((b) => b.email === email);
        const report = results[email];
        const err = errors[email];
        const isLoading = loading.has(email);
        const isOpen = expanded.has(email);

        if (!report && !err && !isLoading) return null;

        return (
          <div
            key={email}
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--c-border)" }}
          >
            {/* Person header */}
            <button
              onClick={() =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  next.has(email) ? next.delete(email) : next.add(email);
                  return next;
                })
              }
              className="w-full flex items-center justify-between px-4 py-3"
              style={{ background: "var(--c-surface)", textAlign: "left" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: "var(--c-accent-bg)", color: "#3b82f6" }}
                >
                  {(builder?.name || email).slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <span className="text-sm font-medium" style={{ color: "var(--c-text)" }}>
                    {builder?.name || email.split("@")[0]}
                  </span>
                  <span className="text-xs ml-2" style={{ color: "var(--c-text-4)" }}>
                    {email}
                  </span>
                </div>
                {isLoading && (
                  <span className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin ml-1" />
                )}
                {report && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full ml-1"
                    style={{ background: "#10b98120", color: "#10b981" }}
                  >
                    {report.recommended_courses.length} course{report.recommended_courses.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <span style={{ color: "var(--c-text-4)", fontSize: 12 }}>
                {isOpen ? "▲" : "▼"}
              </span>
            </button>

            {/* Content */}
            {isOpen && (
              <div
                className="px-4 py-4 flex flex-col gap-4 border-t"
                style={{ borderColor: "var(--c-border)", background: "var(--c-accent-deep)" }}
              >
                {isLoading && (
                  <div className="flex items-center gap-2 text-sm" style={{ color: "var(--c-text-4)" }}>
                    <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    Analysing portfolio…
                  </div>
                )}

                {err && <ErrorBox message={err} />}

                {report && (
                  <>
                    {report.gap_summary && (
                      <div
                        className="rounded-lg px-3 py-3 text-sm leading-relaxed"
                        style={{
                          background: "var(--c-surface)",
                          color: "var(--c-text-3)",
                          border: "1px solid var(--c-border)",
                        }}
                      >
                        {report.gap_summary}
                      </div>
                    )}

                    {report.recommended_courses.length > 0 ? (
                      <div className="flex flex-col gap-3">
                        {report.recommended_courses.map((c, i) => (
                          <CourseCard key={c.course_name} rec={c} index={i} />
                        ))}
                      </div>
                    ) : report.gap_summary && !report.gap_summary.includes("No GPTs found") ? (
                      <div
                        className="rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3"
                        style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-3)" }}
                      >
                        <span>Gaps identified. Browse relevant video courses on OpenAI Academy.</span>
                        <a
                          href="https://academy.openai.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0 font-medium"
                          style={{ background: "var(--c-accent-bg)", color: "#3b82f6", border: "1px solid #3b82f644" }}
                        >
                          Open Academy →
                        </a>
                      </div>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--c-text-4)" }}>
                        No specific course gaps identified.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom Courses tab
// ---------------------------------------------------------------------------

function UploadResultPills({ result }: { result: CustomCourseUploadResult }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {result.added > 0 && (
        <span
          className="text-xs font-medium px-2.5 py-1 rounded-full"
          style={{ background: "#10b98120", color: "#10b981", border: "1px solid #10b98130" }}
        >
          {result.added} added
        </span>
      )}
      {result.updated > 0 && (
        <span
          className="text-xs font-medium px-2.5 py-1 rounded-full"
          style={{ background: "#f59e0b20", color: "#f59e0b", border: "1px solid #f59e0b30" }}
        >
          {result.updated} updated
        </span>
      )}
      {result.errors.length > 0 && (
        <span
          className="text-xs font-medium px-2.5 py-1 rounded-full"
          style={{ background: "#ef444420", color: "#ef4444", border: "1px solid #ef444430" }}
        >
          {result.errors.length} error{result.errors.length !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

function CustomCoursesTab() {
  const { courses, loading, refresh } = useCustomCourses();
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<CustomCourseUploadResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const result = await customCoursesApi.upload(file);
      setUploadResult(result);
      refresh();
      setTimeout(() => setUploadResult(null), 5000);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (id: number) => {
    await customCoursesApi.delete(id);
    refresh();
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--c-text)" }}>
            Custom Course Catalog
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--c-text-4)" }}>
            Upload a CSV with <code className="px-1 rounded" style={{ background: "var(--c-accent-deep)" }}>url</code> and{" "}
            <code className="px-1 rounded" style={{ background: "var(--c-accent-deep)" }}>description</code> columns.
            Custom courses are merged into the recommendation pool alongside OpenAI Academy videos.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {uploadResult && <UploadResultPills result={uploadResult} />}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: "var(--c-accent-bg)",
              color: uploading ? "var(--c-text-4)" : "#3b82f6",
              border: "1px solid #3b82f644",
              cursor: uploading ? "not-allowed" : "pointer",
              opacity: uploading ? 0.7 : 1,
            }}
          >
            {uploading ? (
              <span className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              "↑"
            )}
            {uploading ? "Uploading…" : "Upload CSV"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFile}
          />
        </div>
      </div>

      {/* CSV format hint */}
      <details className="text-xs" style={{ color: "var(--c-text-4)" }}>
        <summary className="cursor-pointer select-none" style={{ color: "var(--c-text-3)" }}>
          CSV format
        </summary>
        <pre
          className="mt-2 px-3 py-2 rounded-lg text-xs leading-relaxed"
          style={{ background: "var(--c-accent-deep)", border: "1px solid var(--c-border)" }}
        >{`url,description\nhttps://example.com/course,Course title or description`}</pre>
      </details>

      {/* Divider + count */}
      {!loading && (
        <div
          className="text-xs font-medium text-center py-1"
          style={{ color: "var(--c-text-4)", borderTop: "1px solid var(--c-border)" }}
        >
          {courses.length === 0
            ? "No custom courses yet. Upload a CSV to add your own."
            : `${courses.length} course${courses.length !== 1 ? "s" : ""} in your catalog`}
        </div>
      )}

      {/* Course list */}
      {loading ? (
        <div className="flex items-center gap-2 py-2 text-sm" style={{ color: "var(--c-text-4)" }}>
          <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {courses.map((c) => (
            <div
              key={c.id}
              className="rounded-xl px-4 py-3 flex items-start justify-between gap-3"
              style={{ background: "var(--c-accent-deep)", border: "1px solid var(--c-border)" }}
            >
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: "#6366f120", color: "#6366f1", border: "1px solid #6366f130" }}
                  >
                    Custom
                  </span>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs truncate"
                    style={{ color: "#3b82f6" }}
                  >
                    {c.url}
                  </a>
                </div>
                <p className="text-sm" style={{ color: "var(--c-text-3)" }}>
                  {c.description}
                </p>
              </div>
              <button
                onClick={() => handleDelete(c.id)}
                className="flex-shrink-0 text-sm px-2 py-0.5 rounded"
                style={{ color: "var(--c-text-4)" }}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const TAB_LABELS: Record<Tab, string> = {
  org: "Org Analysis",
  people: "People",
  custom: "Custom Courses",
};

export default function Learning() {
  const [tab, setTab] = useState<Tab>("org");

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--c-text)" }}>
          Learning Recommendations
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--c-text-4)" }}>
          LLM-powered analysis of AI asset quality signals mapped to OpenAI Academy courses.
          Only recommends when a genuine skill gap is evidenced by the data.
        </p>
      </div>

      {/* Tab bar */}
      <div
        className="flex rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--c-border)", background: "var(--c-surface)" }}
      >
        {(["org", "people", "custom"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2.5 text-sm font-medium transition-colors"
            style={
              tab === t
                ? {
                    background: "var(--c-accent-bg)",
                    color: "#3b82f6",
                    borderBottom: "2px solid #3b82f6",
                  }
                : { color: "var(--c-text-4)" }
            }
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div
        className="rounded-xl p-5"
        style={{ border: "1px solid var(--c-border)", background: "var(--c-surface)" }}
      >
        {tab === "org" ? <OrgTab /> : tab === "people" ? <PeopleTab /> : <CustomCoursesTab />}
      </div>
    </div>
  );
}
