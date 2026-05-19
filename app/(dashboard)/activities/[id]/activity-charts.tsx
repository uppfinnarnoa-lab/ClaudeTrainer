"use client";

import { useEffect, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ComposedChart, Bar,
} from "recharts";
import { Loader2 } from "lucide-react";

interface StreamPoint {
  distKm: number;
  paceSecKm: number | null;
  heartrate: number | null;
  altitude: number | null;
  cadence: number | null;
}

function formatPaceStr(secPerKm: number) {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

export function ActivityCharts({ activityId }: { activityId: string }) {
  const [data, setData] = useState<StreamPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/activities/${activityId}/streams`)
      .then(r => r.json())
      .then(raw => {
        if (raw.error) { setError(true); return; }

        const time     = raw.time?.data     as number[]   ?? [];
        const dist     = raw.distance?.data as number[]   ?? [];
        const hr       = raw.heartrate?.data as number[]  ?? [];
        const vel      = raw.velocity_smooth?.data as number[] ?? [];
        const alt      = raw.altitude?.data  as number[]  ?? [];
        const cad      = raw.cadence?.data   as number[]  ?? [];

        if (dist.length === 0) { setError(true); return; }

        // Downsample to ~300 points for performance
        const step = Math.max(1, Math.floor(dist.length / 300));
        const points: StreamPoint[] = [];
        for (let i = 0; i < dist.length; i += step) {
          const v = vel[i];
          points.push({
            distKm:     Math.round(dist[i] / 10) / 100,
            paceSecKm:  v && v > 0 ? Math.round(1000 / v) : null,
            heartrate:  hr[i] ?? null,
            altitude:   alt[i] != null ? Math.round(alt[i]) : null,
            cadence:    cad[i] ? cad[i] * 2 : null, // Strava stores as 1-leg cadence
          });
        }
        setData(points);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [activityId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted py-6">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Loading stream data…</span>
      </div>
    );
  }

  if (error || data.length === 0) {
    return <p className="text-sm text-muted py-4">Stream data not available for this activity.</p>;
  }

  const hasPace = data.some(d => d.paceSecKm);
  const hasHR   = data.some(d => d.heartrate);
  const hasAlt  = data.some(d => d.altitude);

  return (
    <div className="space-y-5">
      {/* Pace chart */}
      {hasPace && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Pace</p>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="paceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6EE7B7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6EE7B7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="distKm" tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                tickFormatter={v => `${v}km`} axisLine={false} tickLine={false} />
              <YAxis reversed tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "monospace" }}
                tickFormatter={v => formatPaceStr(v)} axisLine={false} tickLine={false} width={52}
                domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [formatPaceStr(v), "Pace"]}
                labelFormatter={v => `${v} km`}
              />
              <Area dataKey="paceSecKm" stroke="#6EE7B7" strokeWidth={1.5}
                fill="url(#paceGrad)" dot={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* HR chart */}
      {hasHR && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Heart Rate</p>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F87171" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#F87171" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="distKm" tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                tickFormatter={v => `${v}km`} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                axisLine={false} tickLine={false} width={36} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`${Math.round(v)} bpm`, "HR"]}
                labelFormatter={v => `${v} km`}
              />
              <Area dataKey="heartrate" stroke="#F87171" strokeWidth={1.5}
                fill="url(#hrGrad)" dot={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Elevation chart */}
      {hasAlt && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Elevation</p>
          <ResponsiveContainer width="100%" height={80}>
            <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="altGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#818CF8" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#818CF8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="distKm" tick={false} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                axisLine={false} tickLine={false} width={36} unit="m" />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`${v} m`, "Altitude"]}
                labelFormatter={v => `${v} km`}
              />
              <Area dataKey="altitude" stroke="#818CF8" strokeWidth={1.5}
                fill="url(#altGrad)" dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
