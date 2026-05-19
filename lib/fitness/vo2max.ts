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

interface SplitKm {
  distance: number;    // meters (usually ~1000)
  moving_time: number; // seconds
  average_speed: number; // m/s
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
  splitsMetric?: unknown;
  startDate?: Date;  // for recency weighting
}

/**
 * Find the best average speed over N consecutive km splits.
 * Used to extract the fastest 5K segment within any activity.
 */
function bestNkmSpeed(splits: SplitKm[], n: number): number | null {
  // Filter out very slow splits (< 2 m/s) that are warmup/cooldown
  const valid = splits.filter(s => s.average_speed > 2 && s.distance > 500);
  if (valid.length < n) return null;
  let best = 0;
  for (let i = 0; i <= valid.length - n; i++) {
    const seg = valid.slice(i, i + n);
    const totalDist = seg.reduce((s, x) => s + x.distance, 0);
    const totalTime = seg.reduce((s, x) => s + x.moving_time, 0);
    if (totalTime > 0) best = Math.max(best, totalDist / totalTime);
  }
  return best > 0 ? best : null;
}

/** Recency weight: exponential decay with 90-day half-life. Recent = high weight. */
function recencyWeight(startDate: Date | undefined): number {
  if (!startDate) return 0.5;
  const daysAgo = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-daysAgo / 90); // weight = 1.0 at 0 days, 0.37 at 90 days
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

  // ── Collect recency-weighted VDOT candidates from ALL sources ───────────

  interface VdotCandidate { v: number; weight: number; source: string }
  const candidates: VdotCandidate[] = [];

  // ── Source A: best N-km segment from splits (catches intervals, first 5K of 10K etc.) ──
  for (const a of runs) {
    if (!a.splitsMetric || !Array.isArray(a.splitsMetric)) continue;
    const splits = (a.splitsMetric as SplitKm[]).filter(s => s.moving_time > 0);
    const w = recencyWeight(a.startDate);

    // Try 5-km rolling best (catches first 5K of 10K, 5km time trials)
    const speed5k = bestNkmSpeed(splits, 5);
    if (speed5k) {
      const time5k = 5000 / speed5k;
      const v = vdotFromRace(5000, time5k);
      if (v > 35 && v < 90) candidates.push({ v, weight: w * 1.0, source: "best 5-km segment" });
    }

    // Try 3-km rolling best (short intervals, Tisdagsbana reps)
    const speed3k = bestNkmSpeed(splits, 3);
    if (speed3k) {
      const time3k = 3000 / speed3k;
      const v = vdotFromRace(3000, time3k * 1.02); // 2% conservative adj for 3km
      if (v > 35 && v < 90) candidates.push({ v, weight: w * 0.9, source: "best 3-km segment" });
    }

    // Try 10-km rolling best (tempo runs, longer races)
    const speed10k = bestNkmSpeed(splits, 10);
    if (speed10k) {
      const time10k = 10000 / speed10k;
      const v = vdotFromRace(10000, time10k);
      if (v > 35 && v < 90) candidates.push({ v, weight: w * 1.0, source: "best 10-km segment" });
    }
  }

  // ── Source B: full activity as race (isRace or keyword) ──────────────────
  const raceRuns = runs.filter(a => a.distanceM >= 1500 && (a.isRace || looksLikeRace(a.name ?? "")));
  for (const a of raceRuns) {
    const v = vdotFromRace(a.distanceM, a.timeSec);
    if (v > 35 && v < 90) {
      candidates.push({ v, weight: recencyWeight(a.startDate) * 1.1, source: "race" });
    }
  }

  // ── Source C: Strava bestEfforts JSON ────────────────────────────────────
  for (const a of runs) {
    if (!a.bestEfforts) continue;
    try {
      const efforts = a.bestEfforts as Array<{ distance: number; elapsed_time: number }>;
      for (const e of efforts) {
        if (e.distance >= 1500 && e.elapsed_time > 0) {
          const v = vdotFromRace(e.distance, e.elapsed_time);
          if (v > 35 && v < 90) {
            candidates.push({ v, weight: recencyWeight(a.startDate) * 1.05, source: "Strava best effort" });
          }
        }
      }
    } catch { /* malformed */ }
  }

  // ── Source D: distance-bucket approach (catches whole-activity fast runs) ──
  const BUCKETS = [
    { name: "5K",  m: 5000,  tol: 0.10 },
    { name: "10K", m: 10000, tol: 0.08 },
    { name: "15K", m: 15000, tol: 0.10 },
    { name: "HM",  m: 21097, tol: 0.08 },
  ];
  for (const b of BUCKETS) {
    const matching = runs
      .filter(a => nearDistance(a.distanceM, b.m) && a.timeSec > 0)
      .sort((a, s) => (a.timeSec / a.distanceM) - (s.timeSec / s.distanceM));
    if (matching.length === 0) continue;
    // Use fastest, with conservative factor for non-race
    const a = matching[0];
    const isRaceSession = a.isRace || looksLikeRace(a.name ?? "");
    const factor = isRaceSession ? 1 : (b.m < 8000 ? 0.95 : 0.98);
    const v = vdotFromRace(b.m, a.timeSec / factor);
    if (v > 35 && v < 90) {
      candidates.push({ v, weight: recencyWeight(a.startDate) * (isRaceSession ? 1.1 : 0.9), source: `${b.name} activity` });
    }
  }

  // ── Pick VDOT: recency-weighted maximum ───────────────────────────────────
  // Sort by weight×v descending, take the best
  if (candidates.length > 0) {
    // Sort: recency-boosted v = v + log(weight) * 3  (recent fast > old fast > recent slow)
    const scored = candidates.map(c => ({ ...c, score: c.v + Math.log(c.weight + 0.01) * 3 }));
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    estimates.push(best.v);
    bestMethod = `${best.source} (recency-weighted)`;
  }

  // ── Method 2: HR ratio (sanity check, low weight) ─────────────────────────
  if (maxHR > 0 && restHR > 0) {
    estimates.push(vo2maxFromHRRatio(maxHR, restHR));
  }

  if (estimates.length === 0) {
    return { value: 45, vdot: 45, confidence: "low", method: "default estimate" };
  }

  // Pace-based estimate dominates (0.85 weight), HR-ratio as minor cross-check
  const value = candidates.length > 0
    ? estimates[0] * 0.85 + (estimates[1] ?? estimates[0]) * 0.15
    : estimates[0];

  const clamped = Math.min(Math.max(value, 25), 90);

  return {
    value: Math.round(clamped * 10) / 10,
    vdot: Math.round(clamped * 10) / 10,
    confidence: candidates.length >= 3 ? "high" : candidates.length >= 1 ? "medium" : "low",
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
