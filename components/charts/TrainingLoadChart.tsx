"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { format, parseISO, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import type { DailyLoad } from "@/lib/fitness/training-load";

interface Props {
  curve: DailyLoad[];
}

const RANGES = [
  { label: "3M",  days: 90  },
  { label: "6M",  days: 180 },
  { label: "1Y",  days: 365 },
  { label: "2Y",  days: 730 },
] as const;

function tickFormatter(date: string, index: number, totalPoints: number) {
  // Fewer labels for longer ranges to avoid crowding
  const interval = totalPoints > 500 ? 28 : totalPoints > 250 ? 14 : 7;
  if (index % interval !== 0) return "";
  return format(parseISO(date), "d MMM");
}

export function TrainingLoadChart({ curve }: Props) {
  const [range, setRange] = useState<"3M" | "6M" | "1Y" | "2Y">("3M");

  const days = RANGES.find(r => r.label === range)?.days ?? 90;
  const sliced = curve.slice(-days);

  return (
    <div className="space-y-2">
      <div className="flex gap-1 justify-end">
        {RANGES.map(r => (
          <button
            key={r.label}
            onClick={() => setRange(r.label)}
            className={cn(
              "px-2.5 py-0.5 rounded-lg text-xs font-medium transition",
              range === r.label
                ? "bg-accent/15 text-accent"
                : "text-muted hover:text-primary hover:bg-surface-2"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={sliced} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v, i) => tickFormatter(v, i, sliced.length)}
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            contentStyle={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--text-primary)" }}
            labelStyle={{ color: "var(--text-primary)", fontWeight: 600 }}
            labelFormatter={(v: string) => format(parseISO(v), "EEE d MMM yyyy")}
            formatter={(v: number, name: string) => [v.toFixed(1), name]}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
          <Line dataKey="ctl" name="CTL (fitness)" stroke="#6EE7B7" strokeWidth={2} dot={false} />
          <Line dataKey="atl" name="ATL (fatigue)" stroke="#F87171" strokeWidth={2} dot={false} />
          <Line dataKey="tsb" name="TSB (form)" stroke="#818CF8" strokeWidth={1.5} dot={false} strokeDasharray="5 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
