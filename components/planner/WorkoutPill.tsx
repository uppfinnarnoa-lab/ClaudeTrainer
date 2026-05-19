"use client";

import { CheckCircle, XCircle, AlertCircle, Clock } from "lucide-react";
import type { PlannedWorkout } from "@/lib/planner/types";
import { formatDuration, formatDistance, sportColor } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  workout: PlannedWorkout;
  isPast: boolean;
  onClick: (workout: PlannedWorkout) => void;
}

const STATUS_ICONS = {
  completed: <CheckCircle size={11} className="text-accent shrink-0" />,
  missed:    <XCircle size={11} className="text-error shrink-0" />,
  partial:   <AlertCircle size={11} className="text-warning shrink-0" />,
  planned:   null,
};

export function WorkoutPill({ workout, isPast, onClick }: Props) {
  const color = workout.color ?? workout.template?.sport.color ?? sportColor(workout.sportType);
  const isMissed = workout.status === "missed";
  const isCompleted = workout.status === "completed" || workout.status === "partial";

  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(workout); }}
      className={cn(
        "w-full text-left px-2 py-1.5 rounded-lg text-xs transition-all group",
        "border hover:shadow-sm",
        isMissed
          ? "bg-error/5 border-error/20 opacity-60"
          : isCompleted
          ? "bg-accent/5 border-accent/20"
          : "bg-surface border-border hover:border-accent/40"
      )}
      style={{ borderLeftWidth: 2.5, borderLeftColor: color }}
    >
      <div className="flex items-center gap-1.5">
        {STATUS_ICONS[workout.status]}
        <span className={cn("font-medium truncate flex-1", isMissed ? "line-through text-muted" : "text-primary")}>
          {workout.name}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-0.5 text-muted">
        {workout.targetDuration && (
          <span className="flex items-center gap-0.5">
            <Clock size={10} />
            {formatDuration(workout.targetDuration)}
          </span>
        )}
        {workout.targetDistance && (
          <span>{formatDistance(workout.targetDistance)}</span>
        )}
        {isPast && workout.status === "planned" && (
          <span className="text-warning font-medium ml-auto">Log?</span>
        )}
      </div>

      {isMissed && workout.missedReason && (
        <p className="mt-0.5 text-xs text-muted capitalize">{workout.missedReason.replace("_", " ")}</p>
      )}
    </button>
  );
}
