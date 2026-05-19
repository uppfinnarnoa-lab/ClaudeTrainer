"use client";

/**
 * Splits chart — like Strava's lap view:
 * - Each bar represents one km split
 * - Bar HEIGHT = relative pace (faster = taller bar)
 * - Bar WIDTH = proportional to time taken (slower km = wider bar)
 * - Colour encodes pace vs activity average (green=faster, red=slower)
 */

import { useMemo } from "react";

interface Split {
  split: number;
  distance: number;       // meters
  moving_time: number;    // seconds
  average_speed: number;  // m/s
  average_heartrate?: number;
  elevation_difference?: number;
}

interface Props {
  splits: Split[];
  avgSpeedMs: number;
}

function secPerKmStr(secPerKm: number) {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SplitsChart({ splits, avgSpeedMs }: Props) {
  const validSplits = splits.filter(s => s.average_speed > 0 && s.moving_time > 0);
  if (validSplits.length < 2) return null;

  const avgSecPerKm  = avgSpeedMs > 0 ? 1000 / avgSpeedMs : 300;
  const paces        = validSplits.map(s => 1000 / s.average_speed);
  const minPace      = Math.min(...paces);
  const maxPace      = Math.max(...paces);
  const paceRange    = maxPace - minPace || 1;
  const totalTimeSec = validSplits.reduce((s, sp) => s + sp.moving_time, 0);

  const chartHeight = 80; // px
  const chartWidth  = 600; // reference width, scaled by container

  // Compute bar dimensions
  const bars = useMemo(() => validSplits.map(sp => {
    const pace    = 1000 / sp.average_speed;
    const widthPct = (sp.moving_time / totalTimeSec) * 100;
    // Invert: faster (lower secPerKm) = taller bar
    const heightPct = 30 + ((maxPace - pace) / paceRange) * 70;
    const delta = pace - avgSecPerKm;
    // green if faster than avg, red if slower
    const color = delta < -5 ? "#6EE7B7" : delta > 5 ? "#F87171" : "#818CF8";
    return { sp, pace, widthPct, heightPct, color };
  }), [validSplits, totalTimeSec, maxPace, paceRange, avgSecPerKm]);

  return (
    <div>
      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
        Splits — bar height = pace, width = time
      </p>

      {/* Chart */}
      <div className="relative" style={{ height: chartHeight + 24 }}>
        {/* Baseline */}
        <div className="absolute bottom-6 left-0 right-0 border-b border-border/50" />
        {/* Average pace line */}
        <div className="absolute left-0 right-0 border-b border-dashed border-accent/40"
          style={{ bottom: 6 + chartHeight * (30 + 35) / 100 }}
          title={`Avg ${secPerKmStr(avgSecPerKm)}/km`}
        />

        {/* Bars */}
        <div className="absolute bottom-6 left-0 right-0 flex items-end" style={{ gap: "1px" }}>
          {bars.map(({ sp, pace, widthPct, heightPct, color }) => (
            <div key={sp.split}
              className="relative shrink-0 rounded-t-sm transition-all cursor-default group/bar"
              style={{
                width: `${widthPct}%`,
                height: `${(heightPct / 100) * chartHeight}px`,
                backgroundColor: `${color}90`,
                borderTop: `2px solid ${color}`,
              }}
            >
              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/bar:flex flex-col items-center z-10 pointer-events-none">
                <div className="bg-surface border border-border rounded-lg px-2 py-1 text-xs text-center whitespace-nowrap shadow-xl">
                  <p className="font-semibold font-mono text-primary">{secPerKmStr(pace)}/km</p>
                  <p className="text-muted">km {sp.split}</p>
                  {sp.average_heartrate && <p className="text-muted">{Math.round(sp.average_heartrate)} bpm</p>}
                  {sp.elevation_difference != null && sp.elevation_difference !== 0 && (
                    <p className="text-muted">{sp.elevation_difference > 0 ? "+" : ""}{Math.round(sp.elevation_difference)}m</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* km labels */}
        <div className="absolute bottom-0 left-0 right-0 flex">
          {bars.map(({ sp, widthPct }) => (
            <div key={sp.split} style={{ width: `${widthPct}%` }}
              className="shrink-0 text-center text-[9px] text-muted truncate">
              {sp.split}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-[10px] text-muted">
        <span className="flex items-center gap-1"><span className="w-3 h-1 rounded inline-block bg-accent" />Faster than avg</span>
        <span className="flex items-center gap-1"><span className="w-3 h-1 rounded inline-block" style={{ backgroundColor: "#818CF8" }} />Near avg</span>
        <span className="flex items-center gap-1"><span className="w-3 h-1 rounded inline-block bg-error" />Slower than avg</span>
        <span className="ml-auto">Hover bar for details</span>
      </div>
    </div>
  );
}
