/**
 * Aerobic decoupling LT1 estimation.
 *
 * For each qualifying steady-state run (45+ min, low pace variance), compute
 * the HR/GAP ratio drift between the first and second half.
 * When drift consistently exceeds 5 %, the runner has crossed LT1.
 *
 * Reference: Coggan (2003); Friel "The Triathlete's Training Bible" (2009).
 */

interface SplitWithHR {
  distance: number;
  moving_time: number;
  average_speed: number;
  elevation_difference?: number | null;
  average_heartrate?: number | null;
}

export interface DecouplingResult {
  lt1HR: number;
  confidence: "high" | "medium" | "low";
  runsUsed: number;
  drift5pctHR: number | null;
}

interface ActivityForDecoupling {
  splitsMetric: unknown;
  movingTime: number;
  distance: number;
  totalElevationGain: number;
}

function gapSpeed(speedMs: number, elevDiff: number, distM: number): number {
  if (distM < 50 || elevDiff === 0) return speedMs;
  const grade = Math.max(-0.25, Math.min(0.25, elevDiff / distM));
  return speedMs / (1 + grade * 0.033); // Minetti metabolic cost
}

function halfRatio(segs: SplitWithHR[]): number {
  const sumTime = segs.reduce((s, g) => s + g.moving_time, 0);
  const avgHR   = segs.reduce((s, g) => s + g.average_heartrate! * g.moving_time, 0) / sumTime;
  const avgGAP  = segs.reduce((s, g) => {
    const gap = gapSpeed(g.average_speed, g.elevation_difference ?? 0, g.distance);
    return s + gap * g.moving_time;
  }, 0) / sumTime;
  return avgGAP > 0 ? avgHR / avgGAP : 0;
}

function computeDrift(splits: SplitWithHR[]): { avgHR: number; drift: number } | null {
  const valid = splits.filter(
    s => s.average_heartrate && s.average_heartrate > 50 &&
         s.average_speed > 0 && s.moving_time > 0 && s.distance > 200,
  );
  if (valid.length < 4) return null;

  // Skip first split (warm-up) on long runs
  const work = valid.length >= 8 ? valid.slice(1, -1) : valid;
  const mid  = Math.floor(work.length / 2);
  const r1 = halfRatio(work.slice(0, mid));
  const r2 = halfRatio(work.slice(mid));
  if (r1 <= 0) return null;

  const sumTime = valid.reduce((s, g) => s + g.moving_time, 0);
  const avgHR   = valid.reduce((s, g) => s + g.average_heartrate! * g.moving_time, 0) / sumTime;

  return { avgHR, drift: r2 / r1 - 1 };
}

export function estimateLT1FromDecoupling(
  activities: ActivityForDecoupling[],
  maxHR: number,
): DecouplingResult | null {
  const MIN_TIME = 45 * 60;
  const MIN_DIST = 7_000;
  const DRIFT_THRESHOLD = 0.05;
  const BUCKET = 5;

  const results: { avgHR: number; drift: number }[] = [];

  for (const act of activities) {
    if (act.movingTime < MIN_TIME || act.distance < MIN_DIST) continue;
    if (!Array.isArray(act.splitsMetric) || act.splitsMetric.length < 4) continue;

    const splits = act.splitsMetric as SplitWithHR[];
    const withHR = splits.filter(s => s.average_heartrate && s.average_heartrate > 50);
    if (withHR.length < 4) continue;

    // Reject interval sessions: coefficient of variation > 20 %
    const speeds = splits.map(s => s.average_speed).filter(v => v > 0);
    const mean   = speeds.reduce((s, v) => s + v, 0) / speeds.length;
    const cv     = Math.sqrt(speeds.reduce((s, v) => s + (v - mean) ** 2, 0) / speeds.length) / mean;
    if (cv > 0.20) continue;

    const r = computeDrift(splits);
    if (!r) continue;
    if (r.avgHR < maxHR * 0.55 || r.avgHR > maxHR * 0.95) continue;

    results.push(r);
  }

  if (results.length < 3) return null;

  // Group into 5-bpm buckets, compute median drift per bucket
  const buckets = new Map<number, number[]>();
  for (const r of results) {
    const b = Math.round(r.avgHR / BUCKET) * BUCKET;
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b)!.push(r.drift);
  }

  const sorted = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hr, drifts]) => {
      drifts.sort((a, b) => a - b);
      return { hr, median: drifts[Math.floor(drifts.length / 2)] };
    });

  let lt1Bucket: number | null = null;
  let drift5pctHR: number | null = null;

  for (const { hr, median } of sorted) {
    if (median <= DRIFT_THRESHOLD) {
      lt1Bucket = hr;
    } else if (drift5pctHR === null) {
      drift5pctHR = hr;
    }
  }

  if (lt1Bucket === null) return null;

  return {
    lt1HR: Math.round(lt1Bucket + BUCKET / 2),
    confidence: results.length >= 20 ? "high" : results.length >= 8 ? "medium" : "low",
    runsUsed: results.length,
    drift5pctHR,
  };
}
