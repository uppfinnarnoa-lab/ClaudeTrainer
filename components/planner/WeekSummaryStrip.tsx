"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ZoneBar } from "./ZoneBar";
import type { PlannedWorkout, TrainingBlock } from "@/lib/planner/types";
import { formatDuration } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  weekStart: Date;
  workouts: PlannedWorkout[];
  block?: TrainingBlock;
  onClick?: () => void;
  compact?: boolean; // sidebar mode: vertical stack instead of horizontal row
}

export function WeekSummaryStrip({ weekStart, workouts, block, onClick, compact }: Props) {
  const router = useRouter();

  function handleClick() {
    if (onClick) { onClick(); return; }
    router.push(`/planner/week?date=${format(weekStart, "yyyy-MM-dd")}`);
  }

  // Aggregate
  const bySport: Record<string, { km: number; timeSec: number }> = {};
  const totalZones: Record<string, number> = {};
  let completed = 0, missed = 0;

  for (const w of workouts) {
    const sport = w.sportType;
    if (!bySport[sport]) bySport[sport] = { km: 0, timeSec: 0 };
    if (w.targetDistance) bySport[sport].km += w.targetDistance / 1000;
    if (w.targetDuration) bySport[sport].timeSec += w.targetDuration;

    const zoneDist = w.template?.estimatedZoneDistribution as Record<string, number> | null;
    if (zoneDist) {
      for (const [z, v] of Object.entries(zoneDist)) {
        totalZones[z] = (totalZones[z] ?? 0) + v;
      }
    }
    if (w.status === "completed" || w.status === "partial") completed++;
    if (w.status === "missed") missed++;
  }

  const totalKm  = Object.values(bySport).reduce((s, v) => s + v.km, 0);
  const totalSec = Object.values(bySport).reduce((s, v) => s + v.timeSec, 0);
  const hasZones = Object.values(totalZones).some(v => v > 0);
  const isPast   = workouts.some(w => w.date < format(new Date(), "yyyy-MM-dd"));
  const topSports = Object.entries(bySport)
    .sort((a, b) => b[1].timeSec - a[1].timeSec)
    .slice(0, 3);

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full text-left px-3 py-2 rounded-xl border transition-all",
        "hover:border-accent/40 hover:bg-surface-2",
        block ? "border-l-[3px]" : "border-border/50",
        "bg-surface/60"
      )}
      style={block ? { borderLeftColor: block.color } : undefined}
    >
      <div className="flex items-center gap-3 flex-wrap">
        {/* Block label */}
        {block && (
          <span
            className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-white"
            style={{ backgroundColor: block.color }}
          >
            {block.blockType}
          </span>
        )}

        {/* Sport volumes */}
        {topSports.map(([sport, d]) => (
          <span key={sport} className="text-xs text-muted shrink-0">
            <span className="font-semibold text-primary">
              {sport.replace(/([A-Z])/g, " $1").trim().split(" ")[0]}
            </span>
            {d.km > 0 && <span className="font-mono ml-1">{d.km.toFixed(0)}km</span>}
            {d.timeSec > 0 && <span className="ml-1 text-muted">{formatDuration(d.timeSec)}</span>}
          </span>
        ))}

        {/* Total if multiple sports */}
        {topSports.length > 1 && totalSec > 0 && (
          <span className="text-xs text-muted shrink-0">
            · <span className="font-mono">{formatDuration(totalSec)}</span> total
          </span>
        )}

        {/* Zone bar */}
        {hasZones && (
          <div className="flex-1 min-w-[60px]">
            <ZoneBar distribution={totalZones} height={4} />
          </div>
        )}

        {/* Completion */}
        {isPast && (
          <span className={cn(
            "shrink-0 text-xs font-semibold ml-auto",
            missed > 0 ? "text-error" : "text-accent"
          )}>
            {completed}/{workouts.length}
          </span>
        )}
      </div>
    </button>
  );
}
