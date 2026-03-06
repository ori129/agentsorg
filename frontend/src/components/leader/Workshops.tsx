import { useState } from "react";
import { useWorkshops, useWorkshopImpact, useWorkshopMutations } from "../../hooks/useLearning";
import { usePipelineGPTs } from "../../hooks/usePipeline";
import type { Workshop, WorkshopPayload } from "../../api/learning";

type PanelTab = "participants" | "gpt-tags" | "impact";

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtDate(d: Date | string) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function WorkshopForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Partial<WorkshopPayload>;
  onSave: (data: WorkshopPayload) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [eventDate, setEventDate] = useState(initial?.event_date ?? "");
  const [duration, setDuration] = useState(String(initial?.duration_hours ?? ""));
  const [facilitator, setFacilitator] = useState(initial?.facilitator ?? "");

  const valid = title.trim() && eventDate;

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-4"
      style={{ border: "1px solid var(--c-border)", background: "var(--c-surface)" }}
    >
      <div className="text-sm font-semibold" style={{ color: "var(--c-text-1)" }}>
        {initial?.title ? "Edit Workshop" : "New Workshop"}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs mb-1 block" style={{ color: "var(--c-text-5)" }}>
            Title *
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Prompt Engineering Bootcamp"
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)", color: "var(--c-text-1)" }}
          />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: "var(--c-text-5)" }}>
            Date *
          </label>
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)", color: "var(--c-text-1)" }}
          />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: "var(--c-text-5)" }}>
            Duration (hours)
          </label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="e.g. 3"
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)", color: "var(--c-text-1)" }}
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs mb-1 block" style={{ color: "var(--c-text-5)" }}>
            Facilitator
          </label>
          <input
            value={facilitator}
            onChange={(e) => setFacilitator(e.target.value)}
            placeholder="Name or team"
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)", color: "var(--c-text-1)" }}
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs mb-1 block" style={{ color: "var(--c-text-5)" }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Optional details"
            className="w-full rounded-lg px-3 py-2 text-sm resize-none"
            style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)", color: "var(--c-text-1)" }}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm"
          style={{ color: "var(--c-text-5)", border: "1px solid var(--c-border)" }}
        >
          Cancel
        </button>
        <button
          onClick={() =>
            valid &&
            onSave({
              title: title.trim(),
              description: description.trim() || undefined,
              event_date: eventDate,
              duration_hours: duration ? parseFloat(duration) : undefined,
              facilitator: facilitator.trim() || undefined,
            })
          }
          disabled={!valid || saving}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{
            background: valid && !saving ? "#1e3a5f" : "#1a2235",
            color: valid && !saving ? "#3b82f6" : "var(--c-text-5)",
            cursor: valid && !saving ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function DeltaChip({ value, suffix = "" }: { value: number | null | undefined; suffix?: string }) {
  if (value == null) return <span style={{ color: "var(--c-text-5)" }}>—</span>;
  const pos = value >= 0;
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{
        background: pos ? "#10b98120" : "#ef444420",
        color: pos ? "#10b981" : "#ef4444",
      }}
    >
      {pos ? "+" : ""}{value.toFixed(1)}{suffix}
    </span>
  );
}

function ImpactPanel({ workshopId }: { workshopId: number }) {
  const { data: impact, isLoading, error } = useWorkshopImpact(workshopId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm" style={{ color: "var(--c-text-5)" }}>
        <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        Computing impact…
      </div>
    );
  }
  if (error) {
    return <div className="py-4 text-sm" style={{ color: "#ef4444" }}>Failed to load impact data.</div>;
  }
  if (!impact) return null;

  const hasData = impact.auto_stats.some(
    (s) => s.avg_quality_before != null || s.avg_quality_after != null
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Summary chips */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--c-text-3)" }}>
          <span>Avg quality delta:</span>
          <DeltaChip value={impact.summary_delta_quality} suffix="/10" />
        </div>
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--c-text-3)" }}>
          <span>Avg sophistication delta:</span>
          <DeltaChip value={impact.summary_delta_sophistication} suffix="/10" />
        </div>
      </div>

      {!hasData && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ background: "var(--c-accent-deep)", color: "var(--c-text-5)" }}
        >
          Not enough data — participants need GPTs both before and after the workshop date for auto-correlation to work.
        </div>
      )}

      {hasData && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase" style={{ color: "var(--c-text-5)" }}>
              <th className="pb-2 text-left font-medium">Participant</th>
              <th className="pb-2 text-right font-medium">GPTs before</th>
              <th className="pb-2 text-right font-medium">GPTs after</th>
              <th className="pb-2 text-right font-medium">Quality before→after</th>
              <th className="pb-2 text-right font-medium">Soph before→after</th>
            </tr>
          </thead>
          <tbody>
            {impact.auto_stats.map((s) => (
              <tr key={s.participant_email} className="border-t" style={{ borderColor: "var(--c-border)" }}>
                <td className="py-2.5" style={{ color: "var(--c-text-3)" }}>
                  {s.participant_email}
                </td>
                <td className="py-2.5 text-right" style={{ color: "var(--c-text-5)" }}>
                  {s.gpts_before}
                </td>
                <td className="py-2.5 text-right" style={{ color: "var(--c-text-5)" }}>
                  {s.gpts_after}
                </td>
                <td className="py-2.5 text-right">
                  {s.avg_quality_before != null && s.avg_quality_after != null ? (
                    <span style={{ color: "var(--c-text-3)" }}>
                      {s.avg_quality_before} → {s.avg_quality_after}{" "}
                      <DeltaChip value={s.avg_quality_after - s.avg_quality_before} />
                    </span>
                  ) : (
                    <span style={{ color: "var(--c-text-5)" }}>—</span>
                  )}
                </td>
                <td className="py-2.5 text-right">
                  {s.avg_sophistication_before != null && s.avg_sophistication_after != null ? (
                    <span style={{ color: "var(--c-text-3)" }}>
                      {s.avg_sophistication_before} → {s.avg_sophistication_after}{" "}
                      <DeltaChip value={s.avg_sophistication_after - s.avg_sophistication_before} />
                    </span>
                  ) : (
                    <span style={{ color: "var(--c-text-5)" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function WorkshopDetailPanel({
  workshop,
  onClose,
}: {
  workshop: Workshop;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<PanelTab>("participants");
  const [newEmail, setNewEmail] = useState("");
  const [newGptId, setNewGptId] = useState("");
  const { data: gpts = [] } = usePipelineGPTs();
  const mutations = useWorkshopMutations();

  const wid = workshop.id;

  const addParticipant = async () => {
    const email = newEmail.trim();
    if (!email) return;
    await mutations.addParticipant.mutateAsync({ wid, email });
    setNewEmail("");
  };

  const tagGpt = async () => {
    if (!newGptId) return;
    await mutations.tagGpt.mutateAsync({ wid, gptId: newGptId });
    setNewGptId("");
  };

  const tabs: { id: PanelTab; label: string }[] = [
    { id: "participants", label: "Participants" },
    { id: "gpt-tags", label: "GPT Tags" },
    { id: "impact", label: "Impact" },
  ];

  return (
    <div
      className="rounded-xl mt-2 overflow-hidden"
      style={{ border: "1px solid #3b82f640", background: "var(--c-surface)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: "var(--c-border)" }}
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm" style={{ color: "var(--c-text-1)" }}>
            {workshop.title}
          </span>
          <span className="text-xs" style={{ color: "var(--c-text-5)" }}>
            {fmtDate(workshop.event_date)}
          </span>
        </div>
        <button onClick={onClose} className="text-lg leading-none" style={{ color: "var(--c-text-5)" }}>
          ×
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: "var(--c-border)" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-5 py-2.5 text-sm transition-colors"
            style={
              tab === t.id
                ? { color: "#3b82f6", borderBottom: "2px solid #3b82f6" }
                : { color: "var(--c-text-5)" }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === "participants" && (
          <div className="flex flex-col gap-3">
            {/* Participants fetched from the workshops list (participant_count only) */}
            <p className="text-xs" style={{ color: "var(--c-text-5)" }}>
              Add participant emails to track their GPT activity before and after this workshop.
            </p>
            <div className="flex gap-2">
              <input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="employee@company.com"
                onKeyDown={(e) => e.key === "Enter" && addParticipant()}
                className="flex-1 rounded-lg px-3 py-2 text-sm"
                style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)", color: "var(--c-text-1)" }}
              />
              <button
                onClick={addParticipant}
                disabled={!newEmail.trim() || mutations.addParticipant.isPending}
                className="px-3 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--c-accent-bg)", color: "#3b82f6" }}
              >
                + Add
              </button>
            </div>
            <p className="text-xs" style={{ color: "var(--c-text-5)" }}>
              {workshop.participant_count} participant{workshop.participant_count !== 1 ? "s" : ""} registered.
              Refresh the page to see individual emails (managed server-side).
            </p>
          </div>
        )}

        {tab === "gpt-tags" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs" style={{ color: "var(--c-text-5)" }}>
              Tag GPTs that were built during or inspired by this workshop.
            </p>
            <div className="flex gap-2">
              <select
                value={newGptId}
                onChange={(e) => setNewGptId(e.target.value)}
                className="flex-1 rounded-lg px-3 py-2 text-sm"
                style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)", color: "var(--c-text-1)" }}
              >
                <option value="">Select a GPT…</option>
                {gpts.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <button
                onClick={tagGpt}
                disabled={!newGptId || mutations.tagGpt.isPending}
                className="px-3 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--c-accent-bg)", color: "#3b82f6" }}
              >
                + Tag
              </button>
            </div>
            <p className="text-xs" style={{ color: "var(--c-text-5)" }}>
              {workshop.tagged_gpt_count} GPT{workshop.tagged_gpt_count !== 1 ? "s" : ""} tagged.
            </p>
          </div>
        )}

        {tab === "impact" && <ImpactPanel workshopId={wid} />}
      </div>
    </div>
  );
}

export default function Workshops() {
  const { data: workshops = [], isLoading } = useWorkshops();
  const mutations = useWorkshopMutations();
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const handleCreate = async (data: WorkshopPayload) => {
    await mutations.create.mutateAsync(data);
    setShowForm(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this workshop?")) return;
    await mutations.remove.mutateAsync(id);
    if (selectedId === id) setSelectedId(null);
  };

  const selectedWorkshop = workshops.find((w) => w.id === selectedId);

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-2" style={{ color: "var(--c-text-5)" }}>
        <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        Loading workshops…
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--c-text-1)" }}>
            Workshops
          </h2>
          <p className="text-sm" style={{ color: "var(--c-text-5)" }}>
            Track L&D events and measure their impact on GPT quality over time
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: "var(--c-accent-bg)", color: "#3b82f6", border: "1px solid var(--c-accent-bg)" }}
        >
          + New Workshop
        </button>
      </div>

      {showForm && (
        <WorkshopForm
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
          saving={mutations.create.isPending}
        />
      )}

      {workshops.length === 0 && !showForm && (
        <div
          className="rounded-xl py-12 text-center"
          style={{ border: "1px dashed var(--c-border)", color: "var(--c-text-5)" }}
        >
          No workshops yet. Create your first one to start tracking L&D impact.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {workshops.map((w) => (
          <div key={w.id}>
            <div
              className="rounded-xl p-4 cursor-pointer transition-colors"
              style={{
                border: selectedId === w.id ? "1px solid #3b82f6" : "1px solid var(--c-border)",
                background: "var(--c-surface)",
              }}
              onClick={() => setSelectedId(selectedId === w.id ? null : w.id)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="font-semibold text-sm" style={{ color: "var(--c-text-1)" }}>
                    {w.title}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs" style={{ color: "var(--c-text-5)" }}>
                      {fmt(w.event_date)}
                    </span>
                    {w.duration_hours != null && (
                      <span className="text-xs" style={{ color: "var(--c-text-5)" }}>
                        {w.duration_hours}h
                      </span>
                    )}
                    {w.facilitator && (
                      <span className="text-xs" style={{ color: "var(--c-text-5)" }}>
                        by {w.facilitator}
                      </span>
                    )}
                  </div>
                  {w.description && (
                    <div className="text-xs mt-0.5 truncate" style={{ color: "var(--c-text-5)", maxWidth: 500 }}>
                      {w.description}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex gap-3 text-xs" style={{ color: "var(--c-text-5)" }}>
                    <span>{w.participant_count} participants</span>
                    <span>{w.tagged_gpt_count} GPTs</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(w.id);
                    }}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: "#ef4444" }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>

            {selectedId === w.id && selectedWorkshop && (
              <WorkshopDetailPanel
                workshop={selectedWorkshop}
                onClose={() => setSelectedId(null)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
