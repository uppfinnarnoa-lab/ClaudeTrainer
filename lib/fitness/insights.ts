/**
 * Generates human-readable training insights for the dashboard.
 * Pure computation — no AI, no DB calls.
 */

import { formatDuration } from "@/lib/utils";
import { getDay } from "date-fns";

export interface InsightInput {
  weekKm:   number; weekSec: number; weekCount: number;
  monthKm:  number; monthSec: number;
  ytdKm:    number; ytdSec: number;
  ctl:      number; atl: number; tsb: number;
  vo2max:   number | null; vdot: number | null;
  maxHR:    number | null;
  avgWeekKm4w:   number; // 4-week average weekly km (full weeks)
  runKmThisWeek: number;
  runKmYtd:      number;
  totalActivities: number;
}

export interface Insight {
  type: "positive" | "neutral" | "warning";
  text: string;
}

export function generateInsights(d: InsightInput): Insight[] {
  const insights: Insight[] = [];

  // ── Training load / form ───────────────────────────────────────────────
  if (d.tsb > 15) {
    insights.push({ type: "positive", text: `Fresh form (TSB +${d.tsb.toFixed(0)}) — good time to race or hit a quality session.` });
  } else if (d.tsb < -25) {
    insights.push({ type: "warning", text: `High fatigue (TSB ${d.tsb.toFixed(0)}) — consider easier training before pushing hard again.` });
  } else if (d.tsb >= 0) {
    insights.push({ type: "neutral", text: `Balanced form (TSB +${d.tsb.toFixed(0)}) — solid training block territory.` });
  }

  // ── Volume — pro-rated comparison ─────────────────────────────────────
  // Compare week-so-far against the SAME time-point of an average week.
  // getDay returns 0=Sun,1=Mon,...6=Sat. weekStartsOn:Mon so Mon=day 1.
  if (d.avgWeekKm4w > 0 && d.weekKm >= 0) {
    const dayOfWeek = getDay(new Date()); // 0=Sun
    // Days elapsed since Monday (0 on Monday, 6 on Sunday)
    const daysElapsed = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const daysInWeek = 7;
    const fractionElapsed = Math.max((daysElapsed + 1) / daysInWeek, 1 / 7);
    const expectedByNow = d.avgWeekKm4w * fractionElapsed;

    if (d.weekKm === 0 && daysElapsed === 0) {
      // Monday with no activity yet — no insight needed
    } else if (d.weekKm === 0) {
      insights.push({ type: "neutral", text: `No activities yet this week.` });
    } else {
      const paceVsExpected = ((d.weekKm - expectedByNow) / expectedByNow) * 100;
      const projectedWeek = d.weekKm / fractionElapsed;

      if (paceVsExpected > 20) {
        insights.push({ type: "warning", text: `Running ${paceVsExpected.toFixed(0)}% ahead of your usual pace this week (${d.weekKm.toFixed(0)} km so far, on track for ~${projectedWeek.toFixed(0)} km). Watch overload risk.` });
      } else if (paceVsExpected < -30) {
        insights.push({ type: "neutral", text: `${d.weekKm.toFixed(0)} km so far — lighter than usual (${expectedByNow.toFixed(0)} km expected by ${daysElapsed === 0 ? "end of Monday" : "now"}).` });
      } else {
        insights.push({ type: "positive", text: `${d.weekKm.toFixed(0)} km this week across ${d.weekCount} session${d.weekCount !== 1 ? "s" : ""} — right on track${projectedWeek > 0 ? ` (on pace for ~${projectedWeek.toFixed(0)} km)` : ""}.` });
      }
    }
  }

  // ── CTL trend ─────────────────────────────────────────────────────────
  if (d.ctl > 60) {
    insights.push({ type: "positive", text: `Strong fitness base (CTL ${d.ctl.toFixed(0)}) — you're well-trained.` });
  } else if (d.ctl < 20 && d.totalActivities > 20) {
    insights.push({ type: "neutral", text: `CTL ${d.ctl.toFixed(0)} — room to build a bigger fitness base with consistent training.` });
  }

  // ── YTD highlight ────────────────────────────────────────────────────
  if (d.ytdKm > 0) {
    const ytdText = d.runKmYtd > 0 && d.runKmYtd < d.ytdKm
      ? `${d.ytdKm.toFixed(0)} km total this year (${d.runKmYtd.toFixed(0)} km running, ${formatDuration(d.ytdSec)})`
      : `${d.ytdKm.toFixed(0)} km across all sports this year — ${formatDuration(d.ytdSec)} of training`;
    insights.push({ type: "neutral", text: ytdText + "." });
  }

  // ── VO2max context ────────────────────────────────────────────────────
  if (d.vo2max && d.vdot && d.vo2max >= 50) {
    insights.push({ type: "positive", text: `VO2max ${d.vo2max.toFixed(1)} ml/kg/min (VDOT ${d.vdot.toFixed(0)}) — well-trained endurance range.` });
  }

  return insights.slice(0, 4);
}
