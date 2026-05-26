"use client";

import { useState } from "react";
import { Activity, TrendingUp, Calendar, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/utils";

interface SportData { km: number; sec: number; count: number }
interface SportExtra { onPaceKm: number; lyYtdKm: number; lyFullYearKm: number; avgWeekKm: number }
interface Props {
  all: { week: SportData; month: SportData; ytd: SportData } & SportExtra;
  run: { week: SportData; month: SportData; ytd: SportData } & SportExtra;
  fitnessLabel: string | null;
  fitnessPrimary: string;
  fitnessSub: string;
}

function fmt(m: number) { return `${(m / 1000).toFixed(0)} km`; }
function fmtKm(km: number) { return `${Math.round(km).toLocaleString("sv-SE")} km`; }

export function DashboardCards({ all, run, fitnessLabel, fitnessPrimary, fitnessSub }: Props) {
  const [mode, setMode] = useState<"all" | "run">("all");
  const d = mode === "run" ? run : all;

  return (
    <div className="space-y-3">
      {/* Toggle */}
      <div className="flex justify-end">
        <div className="flex gap-1 rounded-lg border border-border p-0.5 text-xs">
          {(["all", "run"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={cn("px-3 py-1 rounded-md transition-colors",
                mode === m ? "bg-accent/10 text-accent" : "text-muted hover:text-primary"
              )}>
              {m === "all" ? "All sports" : "Running"}
            </button>
          ))}
        </div>
      </div>

      {/* Main volume cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="This week"
          primary={d.week.km > 0 ? fmt(d.week.km * 1000) : "—"}
          sub={d.week.km > 0 ? `${formatDuration(d.week.sec)} · ${d.week.count} sessions` : "No activities yet"}
          tint />

        <StatCard label="This month"
          primary={d.month.km > 0 ? fmt(d.month.km * 1000) : "—"}
          sub={d.month.km > 0 ? formatDuration(d.month.sec) : "Sync Strava to see data"}
          tint />

        <StatCard label="Year to date"
          primary={d.ytd.km > 0 ? fmt(d.ytd.km * 1000) : "—"}
          sub={d.ytd.km > 0 ? `${formatDuration(d.ytd.sec)} · ${d.ytd.count} sessions` : "Sync Strava to see data"}
          accent />

        <StatCard label={fitnessLabel ?? "Activities synced"} primary={fitnessPrimary} sub={fitnessSub} tint />
      </div>

      {/* Trend cards — Running */}
      {run.ytd.km > 0 && (
        <>
          <p className="text-[11px] font-medium text-accent uppercase tracking-wide pt-1">Running</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <TrendCard
              icon={<TrendingUp size={13} />}
              label="On pace for"
              primary={fmtKm(run.onPaceKm)}
              sub={run.lyFullYearKm > 0 ? `vs ${fmtKm(run.lyFullYearKm)} total last year` : "first full year"}
              highlight={run.onPaceKm > run.lyFullYearKm}
            />
            <TrendCard
              icon={<Activity size={13} />}
              label="Year to date"
              primary={fmtKm(run.ytd.km)}
              sub={run.lyYtdKm > 0 ? `vs ${fmtKm(run.lyYtdKm)} same period last year` : `${run.ytd.count} runs`}
              highlight={run.ytd.km > run.lyYtdKm}
            />
            <TrendCard
              icon={<Calendar size={13} />}
              label="Avg / week YTD"
              primary={`${run.avgWeekKm} km`}
              sub="running distance"
            />
          </div>
        </>
      )}

      {/* Trend cards — All sports */}
      {all.ytd.km > 0 && (
        <>
          <p className="text-[11px] font-medium text-accent uppercase tracking-wide pt-1">All sports</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <TrendCard
              icon={<TrendingUp size={13} />}
              label="On pace for"
              primary={fmtKm(all.onPaceKm)}
              sub={all.lyFullYearKm > 0 ? `vs ${fmtKm(all.lyFullYearKm)} total last year` : "first full year"}
              highlight={all.onPaceKm > all.lyFullYearKm}
            />
            <TrendCard
              icon={<Dumbbell size={13} />}
              label="Year to date"
              primary={fmtKm(all.ytd.km)}
              sub={all.lyYtdKm > 0 ? `vs ${fmtKm(all.lyYtdKm)} same period last year` : `${all.ytd.count} sessions`}
              highlight={all.ytd.km > all.lyYtdKm}
            />
            <TrendCard
              icon={<Calendar size={13} />}
              label="Avg / week YTD"
              primary={`${all.avgWeekKm} km`}
              sub="all sports"
            />
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, primary, sub, accent, tint }: {
  label: string; primary: string; sub: string; accent?: boolean; tint?: boolean;
}) {
  const cls = accent
    ? "border-accent/40 bg-accent/8"
    : tint
    ? "border-accent/20 bg-accent/5"
    : "border-border";
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${cls}`}>
      <p className="text-xs font-medium text-muted uppercase tracking-wide">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold font-mono leading-none ${accent ? "text-accent" : "text-primary"}`}>{primary}</p>
      <p className="text-xs text-muted mt-1">{sub}</p>
    </div>
  );
}

function TrendCard({ icon, label, primary, sub, highlight }: {
  icon: React.ReactNode; label: string; primary: string; sub: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${highlight ? "border-accent/35 bg-accent/7" : "border-accent/15 bg-accent/3"}`}>
      <div className="flex items-center gap-1.5 text-muted mb-1.5">
        <span className={highlight ? "text-accent" : ""}>{icon}</span>
        <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className={`text-xl font-semibold font-mono leading-none ${highlight ? "text-accent" : "text-primary"}`}>{primary}</p>
      <p className="text-xs text-muted mt-1">{sub}</p>
    </div>
  );
}
