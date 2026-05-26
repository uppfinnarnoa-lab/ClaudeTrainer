"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { format, parseISO } from "date-fns";
import type { EasyPacePoint } from "@/app/(dashboard)/stats/page";

interface Props {
  data: EasyPacePoint[];
}

function formatPace(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function linearRegression(points: { x: number; y: number }[]) {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  const num = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const den = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (den === 0) return null;
  const b = num / den;
  const a = my - b * mx;
  return { a, b }; // y = a + b*x
}

// Group monthly data into quarters
function toQuarterly(data: EasyPacePoint[]): EasyPacePoint[] {
  const byQ = new Map<string, number[]>();
  const byQHR = new Map<string, number[]>();
  const byQCount = new Map<string, number>();
  for (const d of data) {
    const [yr, mo] = d.month.split("-").map(Number);
    const q = Math.ceil(mo / 3);
    const key = `${yr}-Q${q}`;
    if (!byQ.has(key)) { byQ.set(key, []); byQHR.set(key, []); byQCount.set(key, 0); }
    byQ.get(key)!.push(d.medianGap);
    byQHR.get(key)!.push(d.avgHR);
    byQCount.set(key, (byQCount.get(key) ?? 0) + d.count);
  }
  return [...byQ.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, gaps]) => {
      const sorted = [...gaps].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const medianGap = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
      const hrs = byQHR.get(month)!;
      return {
        month,
        medianGap: Math.round(medianGap),
        avgHR: Math.round(hrs.reduce((s, v) => s + v, 0) / hrs.length),
        count: byQCount.get(month) ?? 0,
      };
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as EasyPacePoint & { trendGap?: number };
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg space-y-0.5">
      <p className="font-semibold text-primary">{label}</p>
      <p className="text-accent">Tempo: {formatPace(d.medianGap)}/km (GAP)</p>
      <p className="text-muted">Snitt HR: {d.avgHR} bpm</p>
      <p className="text-muted">{d.count} pass</p>
    </div>
  );
}

export function EasyPaceTrendChart({ data }: Props) {
  const autoQuarterly = data.length > 18;
  const [quarterly, setQuarterly] = useState(autoQuarterly);

  const display = useMemo(() =>
    quarterly ? toQuarterly(data) : data,
    [data, quarterly]
  );

  const reg = useMemo(() => {
    const pts = display.map((d, i) => ({ x: i, y: d.medianGap }));
    return linearRegression(pts);
  }, [display]);

  const withTrend = useMemo(() =>
    display.map((d, i) => ({
      ...d,
      trendGap: reg ? Math.round(reg.a + reg.b * i) : undefined,
    })),
    [display, reg]
  );

  if (data.length === 0) {
    return (
      <p className="text-xs text-muted py-4 text-center">
        Ingen data — kräver löppass med HR under LT1, ≥ 6 km, ≥ 3 pass per period.
      </p>
    );
  }

  // Y-axis domain: add 10 sec/km padding, reversed (faster = higher)
  const allGaps = display.map(d => d.medianGap);
  const minGap = Math.min(...allGaps) - 10;
  const maxGap = Math.max(...allGaps) + 10;

  const improving = reg ? reg.b < 0 : false; // negative slope = faster over time

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          {reg && (
            <p className={`text-xs font-medium ${improving ? "text-accent" : "text-orange-400"}`}>
              {improving
                ? `Trend: +${formatPace(Math.abs(Math.round(reg.b * display.length)))}/km snabbare över perioden`
                : `Trend: ${formatPace(Math.round(Math.abs(reg.b * display.length)))}/km långsammare över perioden`}
            </p>
          )}
          <p className="text-[10px] text-muted mt-0.5">GAP-justerat tempo · lägre sekunder = snabbare</p>
        </div>
        {data.length > 6 && (
          <button
            onClick={() => setQuarterly(q => !q)}
            className="text-[10px] px-2 py-1 rounded border border-border text-muted hover:text-primary transition-colors"
          >
            {quarterly ? "Månadsvis" : "Kvartalsvis"}
          </button>
        )}
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={withTrend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: "var(--muted)" }}
            tickFormatter={v => {
              if (quarterly) return v; // "2024-Q2"
              try { return format(parseISO(v + "-01"), "MMM yy"); } catch { return v; }
            }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[minGap, maxGap]}
            reversed
            tick={{ fontSize: 10, fill: "var(--muted)" }}
            tickFormatter={v => formatPace(v)}
            width={42}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="medianGap"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--accent)" }}
            activeDot={{ r: 5 }}
            name="Tempo"
          />
          {reg && (
            <Line
              type="linear"
              dataKey="trendGap"
              stroke="var(--muted)"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              name="Trend"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
