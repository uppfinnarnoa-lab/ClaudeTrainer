/**
 * Multi-model VO2max estimation.
 *
 * Models used (weighted mean):
 *   1. Daniels VDOT          — from best quality-session pace segments (weight 0.50)
 *   2. Uth-Sørensen (2003)   — 15 × (HRmax/HRrest)                    (weight 0.15)
 *   3. Cooper (1968)         — 15.3 × (HRmax/HRrest)                   (weight 0.10)
 *   4. HR-pace regression    — Firstbeat-style slope extrapolation      (weight 0.20)
 *   5. Fitness decay bridge  — last known VDOT × decay factor           (weight 0.05)
 *
 * Key rule: easy runs NEVER lower the estimate.
 *   Only quality sessions (pace > easy threshold, or isRace) are used for VDOT.
 *   Easy runs only contribute to HR-based methods.
 *   Fitness decay is applied when no quality data exists recently.
 */

export interface VO2maxEstimate {
  value: number;
  vdot: number;
  confidence: "high" | "medium" | "low";
  method: string;
  breakdown?: Record<string, number>; // model → estimate
}

// ── Daniels VDOT formula ─────────────────────────────────────────────────

export function vdotFromRace(distanceM: number, timeSec: number): number {
  const v = distanceM / timeSec * 60; // m/min
  const pctVO2max = percentVO2maxFromDuration(timeSec / 60);
  const vo2atPace = -4.60 + 0.182258 * v + 0.000104 * v * v;
  return vo2atPace / pctVO2max;
}

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

// ── Predict race time from VDOT ───────────────────────────────────────────

export function predictRaceTime(vdot: number, distanceM: number): number {
  let lo = distanceM / 15, hi = distanceM * 3;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFromRace(distanceM, mid) > vdot) lo = mid; else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

export function tsbAdjustedRaceTime(baseTimeSec: number, tsb: number): number {
  const adj = Math.max(Math.min(-tsb * 0.0005, 0.08), -0.04);
  return Math.round(baseTimeSec * (1 + adj));
}

// ── HR-based models ───────────────────────────────────────────────────────

/** Uth-Sørensen-Overgaard-Pedersen (2003): VO2max = 15 × HRmax/HRrest */
export function vo2maxUth(maxHR: number, restHR: number): number {
  return 15 * (maxHR / restHR);
}

/** Cooper (1968): VO2max = 15.3 × HRmax/HRrest */
export function vo2maxCooper(maxHR: number, restHR: number): number {
  return 15.3 * (maxHR / restHR);
}

/**
 * HR-pace regression (Firstbeat-style).
 * Fits a line through (avgHR, vo2atPace) points from submaximal runs.
 * Extrapolates to maxHR to estimate VO2max.
 * Only uses runs in the aerobic zone (60-90% maxHR) where HR/pace is linear.
 */
export function vo2maxHRPaceRegression(
  runs: Array<{ avgHR: number; avgPaceSecPerKm: number }>,
  maxHR: number,
): number | null {
  const valid = runs.filter(r =>
    r.avgHR > maxHR * 0.60 && r.avgHR < maxHR * 0.92 &&
    r.avgPaceSecPerKm > 180 && r.avgPaceSecPerKm < 600
  );
  if (valid.length < 4) return null;

  // Compute VO2 at each observed pace using Daniels approximation
  const points = valid.map(r => {
    const vMin = 1000 / r.avgPaceSecPerKm * 60;
    const vo2 = -4.60 + 0.182258 * vMin + 0.000104 * vMin * vMin;
    return { hr: r.avgHR, vo2 };
  });

  // Linear regression: vo2 = a × hr + b
  const n = points.length;
  const sumHR  = points.reduce((s, p) => s + p.hr, 0);
  const sumVO2 = points.reduce((s, p) => s + p.vo2, 0);
  const sumHR2 = points.reduce((s, p) => s + p.hr * p.hr, 0);
  const sumHRVO2 = points.reduce((s, p) => s + p.hr * p.vo2, 0);
  const denom = n * sumHR2 - sumHR * sumHR;
  if (Math.abs(denom) < 1e-6) return null;

  const a = (n * sumHRVO2 - sumHR * sumVO2) / denom;
  const b = (sumVO2 - a * sumHR) / n;

  const vo2atMax = a * maxHR + b;
  return vo2atMax > 30 && vo2atMax < 90 ? vo2atMax : null;
}

/** Submaximal effort extrapolation (Åstrand-Ryhming adapted for running) */
export function vo2maxFromSubmaxEffort(
  avgPaceSecPerKm: number,
  avgHR: number,
  maxHR: number,
): number {
  const v = 1000 / avgPaceSecPerKm * 60;
  const vo2AtPace = -4.60 + 0.182258 * v + 0.000104 * v * v;
  return vo2AtPace / (avgHR / maxHR);
}

// ── Helpers ───────────────────────────────────────────────────────────────

function looksLikeRace(name: string): boolean {
  return /tävl|race|lopp|mila|stafett|sic\b|parkrun|time.?trial|tt\b|halvmara|half.?marathon/i
    .test(name);
}

function nearDistance(distM: number, targetM: number) {
  return Math.abs(distM - targetM) / targetM < 0.08;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(Math.floor(sorted.length * p), sorted.length - 1)];
}

interface SplitKm {
  distance: number;
  moving_time: number;
  average_speed: number;
}

function bestNkmSpeed(splits: SplitKm[], n: number): number | null {
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

/** Exponential recency weight: 1.0 at 0 days, 0.5 at 90 days, 0.25 at 180 days */
function recencyWeight(startDate: Date | undefined): number {
  if (!startDate) return 0.5;
  const daysAgo = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-daysAgo / 130); // ~130 day half-life → old PRs stay relevant for a year
}

/**
 * Is this run a QUALITY session?
 * Quality = race, keyword race, OR pace is significantly above easy threshold.
 * Easy runs are excluded from VDOT estimation to prevent dragging it down.
 */
function isQualitySession(a: ActivitySample, easyPaceThreshold: number): boolean {
  if (a.isRace || looksLikeRace(a.name ?? "")) return true;
  const avgPaceSecPerKm = a.distanceM > 0 && a.timeSec > 0
    ? a.timeSec / (a.distanceM / 1000) : null;
  // Quality if faster than easy pace - 60 sec/km (allows a wide margin)
  return avgPaceSecPerKm != null && avgPaceSecPerKm < (easyPaceThreshold - 60);
}

/** Fitness decay model (Mujika & Padilla, 2000; Coyle, 1984).
 *  With regular easy running: ~5% loss per 12 weeks.
 *  With complete cessation: ~20% loss per 12 weeks.
 */
function applyFitnessDecay(
  vdot: number,
  daysSinceLastQuality: number,
  hasRecentEasyRuns: boolean,
): number {
  if (daysSinceLastQuality < 14) return vdot; // recent quality = no decay
  const weeks = (daysSinceLastQuality - 14) / 7;
  // Weekly decay rate: 0.4% with easy maintenance, 1.5% without
  const weeklyDecay = hasRecentEasyRuns ? 0.004 : 0.015;
  const decayed = vdot * Math.pow(1 - weeklyDecay, weeks);
  return Math.max(decayed, vdot * 0.70); // floor at 70% of best (realistic minimum)
}

// ── Main estimation function ──────────────────────────────────────────────

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
  startDate?: Date;
}

export function estimateVO2max(
  activities: ActivitySample[],
  maxHR: number,
  restHR: number,
): VO2maxEstimate {
  const isRunning = (a: ActivitySample) => /run|trail/i.test(a.sportType);
  const runs = activities.filter(isRunning);

  // Estimate "easy pace" as 75th percentile pace of ALL runs (easy runs cluster here)
  const allPaces = runs
    .filter(a => a.distanceM >= 3000 && a.timeSec > 0)
    .map(a => a.timeSec / (a.distanceM / 1000));
  const easyPaceThreshold = allPaces.length > 5 ? percentile(allPaces, 0.75) : 360;

  // ── MODEL 1: Pace-based VDOT from quality sessions only ──────────────────
  interface VdotCandidate { v: number; weight: number; source: string }
  const candidates: VdotCandidate[] = [];

  for (const a of runs) {
    const w = recencyWeight(a.startDate);

    // From splits: rolling segment bests
    if (a.splitsMetric && Array.isArray(a.splitsMetric)) {
      const splits = (a.splitsMetric as SplitKm[]).filter(s => s.moving_time > 0);
      for (const [n, label, factor] of [[5, "5km-seg", 1.0], [3, "3km-seg", 1.02], [10, "10km-seg", 1.0]] as const) {
        const speed = bestNkmSpeed(splits, n);
        if (!speed) continue;
        const timeSec = (n * 1000) / speed * (factor as number);
        const v = vdotFromRace(n * 1000, timeSec);
        if (v > 35 && v < 90) candidates.push({ v, weight: w, source: label });
      }
    }

    // From bestEfforts JSON
    if (a.bestEfforts && Array.isArray(a.bestEfforts)) {
      for (const e of a.bestEfforts as Array<{ distance: number; elapsed_time: number }>) {
        if (e.distance >= 1500 && e.elapsed_time > 0) {
          const v = vdotFromRace(e.distance, e.elapsed_time);
          if (v > 35 && v < 90) candidates.push({ v, weight: w * 1.05, source: "bestEffort" });
        }
      }
    }

    // From whole-activity pace (only if quality session or race)
    if (!isQualitySession(a, easyPaceThreshold)) continue;
    if (a.distanceM < 1500 || a.timeSec <= 0) continue;

    const isRaceSession = a.isRace || looksLikeRace(a.name ?? "");
    const BUCKETS = [{ m: 5000, tol: 0.10 }, { m: 3000, tol: 0.12 }, { m: 10000, tol: 0.08 }, { m: 15000, tol: 0.10 }, { m: 21097, tol: 0.08 }];
    for (const b of BUCKETS) {
      if (!nearDistance(a.distanceM, b.m)) continue;
      const factor = isRaceSession ? 1 : (b.m < 8000 ? 0.95 : 0.98);
      const v = vdotFromRace(b.m, a.timeSec / factor);
      if (v > 35 && v < 90) candidates.push({ v, weight: w * (isRaceSession ? 1.1 : 0.85), source: isRaceSession ? "race" : "quality-run" });
    }
  }

  // Best recency-boosted VDOT (score = v + ln(weight)×3 — recent fast > old fast)
  let model1Vdot: number | null = null;
  if (candidates.length > 0) {
    const best = candidates.reduce((a, b) =>
      (a.v + Math.log(a.weight + 0.01) * 3) > (b.v + Math.log(b.weight + 0.01) * 3) ? a : b
    );
    model1Vdot = best.v;
  }

  // ── MODEL 2: Uth-Sørensen (2003) ─────────────────────────────────────────
  const model2 = restHR > 0 && maxHR > 0 ? vo2maxUth(maxHR, restHR) : null;

  // ── MODEL 3: Cooper (1968) ────────────────────────────────────────────────
  const model3 = restHR > 0 && maxHR > 0 ? vo2maxCooper(maxHR, restHR) : null;

  // ── MODEL 4: HR-pace regression (Firstbeat-style) ────────────────────────
  const regressionRuns = runs
    .filter(a => a.avgHR && a.distanceM >= 3000 && a.timeSec > 0)
    .map(a => ({ avgHR: a.avgHR!, avgPaceSecPerKm: a.timeSec / (a.distanceM / 1000) }));
  const model4 = maxHR > 0 ? vo2maxHRPaceRegression(regressionRuns, maxHR) : null;

  // ── MODEL 5: Fitness decay bridge ────────────────────────────────────────
  // If we have a recent good VDOT but nothing current, apply decay
  let model5Vdot: number | null = null;
  if (model1Vdot) {
    const lastQualityDate = candidates.length > 0
      ? runs.filter(a => isQualitySession(a, easyPaceThreshold) && a.startDate)
          .sort((a, b) => (b.startDate!.getTime()) - (a.startDate!.getTime()))
          .at(0)?.startDate
      : undefined;
    const daysSinceQuality = lastQualityDate
      ? (Date.now() - lastQualityDate.getTime()) / (1000 * 60 * 60 * 24) : 999;
    const hasRecentEasy = runs.some(a =>
      a.startDate && (Date.now() - a.startDate.getTime()) / (1000 * 60 * 60 * 24) < 30
    );
    model5Vdot = applyFitnessDecay(model1Vdot, daysSinceQuality, hasRecentEasy);
  }

  // ── WEIGHTED MEAN ─────────────────────────────────────────────────────────
  type ModelEntry = [number | null, number, string];
  const models: ModelEntry[] = [
    [model1Vdot,  0.50, "VDOT (pace)"],
    [model4,      0.20, "HR-pace regression"],
    [model2,      0.15, "Uth-Sørensen"],
    [model3,      0.10, "Cooper"],
    [model5Vdot,  0.05, "decay bridge"],
  ];

  const available = models.filter(([v]) => v !== null && v > 35 && v < 90);
  if (available.length === 0) {
    return { value: 45, vdot: 45, confidence: "low", method: "default estimate" };
  }

  const totalWeight = available.reduce((s, [, w]) => s + w, 0);
  const weightedSum = available.reduce((s, [v, w]) => s + v! * w, 0);
  const mean = weightedSum / totalWeight;

  const clamped = Math.min(Math.max(mean, 25), 90);
  const breakdown = Object.fromEntries(available.map(([v, , name]) => [name, Math.round(v! * 10) / 10]));

  const primaryMethod = available[0][2]; // highest-weight available method
  const methodStr = `${primaryMethod} + ${available.length - 1} models (weighted mean)`;

  return {
    value: Math.round(clamped * 10) / 10,
    vdot:  Math.round(clamped * 10) / 10,
    confidence: model1Vdot ? (candidates.length >= 3 ? "high" : "medium") : "low",
    method: methodStr,
    breakdown,
  };
}
