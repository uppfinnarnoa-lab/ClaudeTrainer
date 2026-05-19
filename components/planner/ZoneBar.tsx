"use client";

import { ZONE_COLORS } from "@/lib/planner/types";

interface Props {
  /** seconds per zone: { z1: n, z2: n, ... } */
  distribution: Record<string, number> | null;
  height?: number;
  className?: string;
}

export function ZoneBar({ distribution, height = 4, className }: Props) {
  if (!distribution) return null;
  const total = Object.values(distribution).reduce((s, v) => s + v, 0);
  if (total === 0) return null;

  const zones = [1, 2, 3, 4, 5];

  return (
    <div
      className={`flex rounded-full overflow-hidden w-full ${className ?? ""}`}
      style={{ height }}
      title={zones
        .map(z => {
          const pct = Math.round(((distribution[`z${z}`] ?? 0) / total) * 100);
          return pct > 0 ? `Z${z}: ${pct}%` : null;
        })
        .filter(Boolean)
        .join(" · ")}
    >
      {zones.map(z => {
        const pct = ((distribution[`z${z}`] ?? 0) / total) * 100;
        if (pct < 0.5) return null;
        return (
          <div
            key={z}
            style={{ width: `${pct}%`, backgroundColor: ZONE_COLORS[z] }}
          />
        );
      })}
    </div>
  );
}
