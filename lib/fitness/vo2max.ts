// VO2max estimation via three methods, weighted by confidence.

export interface VO2maxEstimate {
  value: number;       // ml/kg/min
  vdot: number;        // Daniels VDOT (≈VO2max for running)
  confidence: "high" | "medium" | "low";
  method: string;
}

// ─── Method 1: Race-based VDOT (most accurate) ────────────────────────────

// Daniels VDOT from a race performance.
// distance in meters, time in seconds.
export function vdotFromRace(distanceM: number, timeSec: number): number {
  const v = distanceM / timeSec * 60; // m/min
  const pctVO2max = percentVO2maxFromDuration(timeSec / 60);
  const vo2atPace = -4.60 + 0.182258 * v + 0.000104 * v * v;
  return vo2atPace / pctVO2max;
}

// Approximate %VO2max sustainable for a given race duration (minutes).
// Based on Daniels' tables.
function percentVO2maxFromDuration(minutes: number): number {
  if (minutes <= 3.5)  return 1.00;
  if (minutes <= 5)    return 0.975;
  if (minutes <= 8)    return 0.96;
  if (minutes <= 10)   return 0.952;
  if (minutes <= 15)   return 0.942;
  if (minutes <= 20)   return 0.936;
  if (minutes <= 30)   return 0.927;
  if (minutes <= 40)   return 0.92;
  if (minutes <= 60)   return 0.907;
  if (minutes <= 90)   return 0.892;
  if (minutes <= 120)  return 0.88;
  return 0.865;
}

// ─── Method 2: HR-ratio (Astrand-Ryhming) ────────────────────────────────

export function vo2maxFromHRRatio(maxHR: number, restHR: number): number {
  // Simple formula: VO2max ≈ 15 × (HRmax / HRrest)
  return 15 * (maxHR / restHR);
}

// ─── Method 3: Submaximal run (Uth et al.) ───────────────────────────────
// Uses pace + HR from aerobic runs. Estimates VO2 at observed pace/HR, extrapolates.

export function vo2maxFromSubmaxEffort(
  avgPaceSecPerKm: number, // pace at the effort
  avgHR: number,
  maxHR: number,
): number {
  // VO2 at that pace (ml/kg/min using Daniels approximation)
  const v = 1000 / avgPaceSecPerKm * 60; // m/min
  const vo2AtPace = -4.60 + 0.182258 * v + 0.000104 * v * v;
  // Scale to 100% HR max
  const hrFraction = avgHR / maxHR;
  return vo2AtPace / hrFraction;
}

// ─── Combined estimate ────────────────────────────────────────────────────

function looksLikeRace(name: string): boolean {
  return /tävl|race|lopp|mila|stafett|sic\b|parkrun|time.?trial|tt\b|5k|10k|halvmara|half.?marathon/i
    .test(name);
}

// Is this activity approximately a given distance? (±8%)
function nearDistance(distM: number, targetM: number) {
  return Math.abs(distM - targetM) / targetM < 0.08;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

interface ActivitySample {
  distanceM: number;
  timeSec: number;
  avgHR: number | null;
  maxHR?: number | null;
  isRace: boolean;
  sportType: string;
  name?: string;
  bestEfforts?: unknown;
}

export function estimateVO2max(
  activities: ActivitySample[],
  maxHR: number,
  restHR: number,
): VO2maxEstimate {
  const estimates: number[] = [];
  let bestMethod = "HR ratio";

  const isRunning = (a: ActivitySample) =>
    /run|trail/i.test(a.sportType);

  const runs = activities.filter(isRunning);

  // ── Strategy: find the BEST pace over each standard distance ─────────────
  // For each target distance bucket, find the fastest run of roughly that length.
  // This catches parkruns, races, time trials, and any fast training session.
  // Marked races get no correction (true race pace).
  // Other fast activities get a small correction since avg pace < race pace.
  const DISTANCE_BUCKETS = [
    { name: "5K",   target: 5000,  tol: 0.10 },
    { name: "3K",   target: 3000,  tol: 0.12 },
    { name: "10K",  target: 10000, tol: 0.08 },
    { name: "15K",  target: 15000, tol: 0.10 },
    { name: "HM",   target: 21097, tol: 0.08 },
    { name: "Mar",  target: 42195, tol: 0.05 },
  ];

  const paceVdots: { v: number; source: string }[] = [];

  for (const bucket of DISTANCE_BUCKETS) {
    const candidates = runs
      .filter(a => nearDistance(a.distanceM, bucket.target) && a.timeSec > 0)
      .sort((a, b) => (a.timeSec / a.distanceM) - (b.timeSec / b.distanceM)); // fastest first

    if (candidates.length === 0) continue;

    // Take the fastest 3 and use the median to avoid outlier sessions
    const top = candidates.slice(0, 3);
    const times = top.map(a => {
      const isRaceSession = a.isRace || looksLikeRace(a.name ?? "");
      // Non-race activities: avg pace = ~95% of race pace for short, ~98% for long
      const factor = isRaceSession ? 1 : (bucket.target < 8000 ? 0.95 : 0.98);
      return a.timeSec / factor;
    });
    const medianTime = times[Math.floor(times.length / 2)];
    const v = vdotFromRace(bucket.target, medianTime);
    if (v > 35 && v < 90) {
      paceVdots.push({ v, source: `${bucket.name} best pace` });
    }
  }

  // Also: bestEfforts JSON from Strava (most reliable if present)
  for (const a of runs) {
    if (!a.bestEfforts) continue;
    try {
      const efforts = a.bestEfforts as Array<{ distance: number; elapsed_time: number }>;
      for (const e of efforts) {
        if (e.distance >= 1500 && e.elapsed_time > 0) {
          const v = vdotFromRace(e.distance, e.elapsed_time);
          if (v > 35 && v < 90) paceVdots.push({ v, source: "Strava best effort" });
        }
      }
    } catch { /* malformed JSON */ }
  }

  if (paceVdots.length > 0) {
    const best = paceVdots.reduce((a, b) => a.v > b.v ? a : b);
    estimates.push(best.v);
    bestMethod = best.source;
  }

  // Method 2: HR ratio
  if (maxHR > 0 && restHR > 0) {
    estimates.push(vo2maxFromHRRatio(maxHR, restHR));
  }

  // Method 3: submaximal runs (easy runs with HR data, distance 5-15km)
  const submaxRuns = activities
    .filter(a =>
      a.sportType.toLowerCase().includes("run") &&
      a.avgHR && a.avgHR > 0 &&
      a.distanceM >= 4000 &&
      a.distanceM <= 20000
    )
    .slice(0, 10);
  if (submaxRuns.length > 0 && maxHR > 0) {
    const subEstimates = submaxRuns
      .filter(r => r.avgHR)
      .map(r => vo2maxFromSubmaxEffort(r.timeSec / (r.distanceM / 1000), r.avgHR!, maxHR));
    const filtered = subEstimates.filter(v => v > 30 && v < 90);
    if (filtered.length > 0) {
      estimates.push(filtered.reduce((a, b) => a + b, 0) / filtered.length);
    }
  }

  if (estimates.length === 0) {
    return { value: 45, vdot: 45, confidence: "low", method: "default estimate" };
  }

  // Weighted average (race-based gets higher weight)
  const value = estimates.length > 1
    ? estimates[0] * 0.6 + estimates.slice(1).reduce((a, b) => a + b, 0) / estimates.slice(1).length * 0.4
    : estimates[0];

  const clamped = Math.min(Math.max(value, 25), 90);

  return {
    value: Math.round(clamped * 10) / 10,
    vdot: Math.round(clamped * 10) / 10,
    confidence: paceVdots.length > 0 ? "high" : estimates.length >= 2 ? "medium" : "low",
    method: bestMethod,
  };
}

// Predict race time from VDOT for a given distance.
// vdotFromRace is a DECREASING function of time (faster = higher VDOT),
// so when the estimate is too high we need MORE time (move lo up), and
// when too low we need LESS time (move hi down).
export function predictRaceTime(vdot: number, distanceM: number): number {
  let lo = distanceM / 15; // fastest plausible (e.g. 4 min/km for 5K)
  let hi = distanceM * 3;  // slowest plausible
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const estimated = vdotFromRace(distanceM, mid);
    if (estimated > vdot) {
      lo = mid; // estimated VDOT too high → need more time → raise lo
    } else {
      hi = mid; // estimated VDOT too low → need less time → lower hi
    }
  }
  return Math.round((lo + hi) / 2);
}

// TSB-adjusted race time: account for current fatigue.
export function tsbAdjustedRaceTime(baseTimeSec: number, tsb: number): number {
  // TSB 0 = neutral, positive = fresh, negative = fatigued
  // Rough: each -10 TSB points = ~0.5% slower
  const adjustment = Math.max(Math.min(-tsb * 0.0005, 0.08), -0.04);
  return Math.round(baseTimeSec * (1 + adjustment));
}
