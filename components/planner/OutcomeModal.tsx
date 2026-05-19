"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import type { PlannedWorkout } from "@/lib/planner/types";
import { cn } from "@/lib/utils";

const MISSED_REASONS = [
  { value: "injury",       label: "Injury" },
  { value: "illness",      label: "Illness" },
  { value: "fatigue",      label: "Excessive fatigue" },
  { value: "travel",       label: "Travel / logistics" },
  { value: "work",         label: "Work / obligations" },
  { value: "weather",      label: "Weather" },
  { value: "planned_rest", label: "Planned rest" },
  { value: "other",        label: "Other" },
];

interface Props {
  workout: PlannedWorkout;
  onClose: () => void;
  onSave: (id: string, status: string, missedReason?: string, missedNote?: string) => Promise<void>;
}

export function OutcomeModal({ workout, onClose, onSave }: Props) {
  const [step, setStep] = useState<"choose" | "missed">("choose");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const isPast = new Date(workout.date) <= new Date();

  async function save(status: string, r?: string, n?: string) {
    setSaving(true);
    await onSave(workout.id, status, r, n);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="font-semibold text-primary">{workout.name}</p>
            <p className="text-xs text-muted mt-0.5">{new Date(workout.date + "T00:00:00").toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" })}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:bg-surface-2 transition">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {step === "choose" && (
            <>
              {isPast && workout.status === "planned" && (
                <p className="text-sm text-muted">Did you complete this session?</p>
              )}
              {workout.status !== "planned" && (
                <p className="text-sm text-muted">Update status for this session:</p>
              )}

              <div className="grid grid-cols-1 gap-2">
                <button onClick={() => save("completed")}
                  disabled={saving}
                  className="w-full py-2.5 rounded-xl bg-accent/10 border border-accent/20 text-sm font-medium text-accent hover:bg-accent/15 transition flex items-center justify-center gap-2">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : "✓"} Completed
                </button>
                <button onClick={() => save("partial")}
                  disabled={saving}
                  className="w-full py-2.5 rounded-xl bg-warning/10 border border-warning/20 text-sm font-medium text-warning hover:bg-warning/15 transition">
                  Partially completed
                </button>
                <button onClick={() => setStep("missed")}
                  disabled={saving}
                  className="w-full py-2.5 rounded-xl bg-error/10 border border-error/20 text-sm font-medium text-error hover:bg-error/15 transition">
                  Missed
                </button>
                {workout.status !== "planned" && (
                  <button onClick={() => save("planned")}
                    disabled={saving}
                    className="w-full py-2.5 rounded-xl border border-border text-sm font-medium text-muted hover:bg-surface-2 transition">
                    Reset to planned
                  </button>
                )}
              </div>
            </>
          )}

          {step === "missed" && (
            <>
              <p className="text-sm text-muted">Why was this session missed?</p>
              <div className="grid grid-cols-2 gap-2">
                {MISSED_REASONS.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setReason(r.value)}
                    className={cn(
                      "px-3 py-2 rounded-xl text-xs font-medium border transition",
                      reason === r.value
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted hover:border-accent/40 hover:text-primary"
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Optional: add a note (e.g. which muscle, severity)"
                rows={2}
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={() => setStep("choose")} className="px-4 py-2 text-sm text-muted hover:text-primary">Back</button>
                <button
                  onClick={() => save("missed", reason || undefined, note || undefined)}
                  disabled={saving}
                  className="flex-1 py-2 rounded-xl bg-error/10 border border-error/20 text-sm font-medium text-error hover:bg-error/15 transition flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  Save as missed
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
