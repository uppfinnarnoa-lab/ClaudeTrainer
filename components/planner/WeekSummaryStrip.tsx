"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ZoneBar } from "./ZoneBar";
import type { PlannedWorkout, TrainingBlock } from "@/lib/planner/types";
import { formatDuration, formatDistance } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  weekStart: Date;
  workouts: PlannedWorkout[];
  block?: TrainingBlock;
  onClick?: () => void;
}

export function WeekSummaryStrip({ weekStart, workouts, block, onClick }: Props) {
  const router = useRouter();

  function handleClick() {
    if (onClick) { onClick(); return; }
    const dateStr = format(weekStart, "yyyy-MM-dd");
    router.push(`/planner/week?date=${dateStr}`);
  }
  if (workouts.length === 0 && !block) return null;

  // Aggregate by sport
  const bySport: Record<string, { km: number; timeSec: number }> = {};
  let totalZones: Record<string, number> = {};
  let completed = 0;
  let missed = 0;

  for (const w of workouts) {
    const sport = w.sportType;
    if (!bySport[sport]) bySport[sport] = { km: 0, timeSec: 0 };
    if (w.targetDistance) bySport[sport].km += w.targetDistance / 1000;
    if (w.targetDuration) bySport[sport].timeSec += w.targetDuration;

    // Add zone distribution from template
    const zoneDist = w.template?.estimatedZoneDistribution;
    if (zoneDist) {
      for (const [z, v] of Object.entries(zoneDist)) {
        totalZones[z] = (totalZones[z] ?? 0) + v;
      }
    }

    if (w.status === "completed" || w.status === "partial") completed++;
    if (w.status === "missed") missed++;
  }

  const topSports = Object.entries(bySport)
    .sort((a, b) => (b[1].timeSec || b[1].km) - (a[1].timeSec || a[1].km))
    .slice(0, 2);

  const hasZones = Object.values(totalZones).some(v => v > 0);
  const isPast = workouts.some(w => new Date(w.date) < new Date());

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full text-left px-2 py-1.5 rounded-lg border border-border/50 bg-surface/80",
        "hover:border-accent/30 hover:bg-surface transition-all text-xs space-y-1",
        block ? "border-l-2" : ""
      )}
      style={block ? { borderLeftColor: block.color } : undefined}
    >
      {/* Block label */}
      {block && (
        <span
          className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide text-white"
          style={{ backgroundColor: block.color }}
        >
          {block.blockType}
        </span>
      )}

      {/* Sport summaries */}
      {topSports.map(([sport, data]) => (
        <div key={sport} className="flex items-center gap-2 text-muted">
          <span className="font-medium text-primary truncate max-w-[80px]">{sport.replace("_", " ")}</span>
          {data.km > 0 && <span className="font-mono">{data.km.toFixed(0)}km</span>}
          {data.timeSec > 0 && <span className="text-muted">{formatDuration(data.timeSec)}</span>}
        </div>
      ))}

      {/* Zone fingerprint */}
      {hasZones && <ZoneBar distribution={totalZones} height={3} />}

      {/* Completeness */}
      {isPast && workouts.length > 0 && (
        <div className="flex items-center gap-1 text-muted">
          <span className="text-accent">{completed}/{workouts.length}</span>
          {missed > 0 && <span className="text-error">·{missed} missed</span>}
        </div>
      )}
    </button>
  );
}
