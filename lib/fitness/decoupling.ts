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
  weatherTemp?: number | null;
  startDate?: Date;
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

  // Always skip first split (warm-up)
  const work = valid.slice(1, valid.length >= 8 ? -1 : undefined);
  if (work.length < 4) return null;

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
  // Tighter CV: reject anything with > 10% pace variation (intervals, fartlek)
  const CV_MAX = 0.10;

  const results: { avgHR: number; drift: number; tempWeight: number }[] = [];

  for (const act of activities) {
    if (act.movingTime < MIN_TIME || act.distance < MIN_DIST) continue;
    if (!Array.isArray(act.splitsMetric) || act.splitsMetric.length < 4) continue;

    const splits = act.splitsMetric as SplitWithHR[];
    const withHR = splits.filter(s => s.average_heartrate && s.average_heartrate > 50);
    if (withHR.length < 4) continue;

    // Reject interval sessions: coefficient of variation > CV_MAX
    const speeds = splits.map(s => s.average_speed).filter(v => v > 0);
    if (speeds.length < 4) continue;
    const mean = speeds.reduce((s, v) => s + v, 0) / speeds.length;
    if (mean === 0) continue;
    const cv = Math.sqrt(speeds.reduce((s, v) => s + (v - mean) ** 2, 0) / speeds.length) / mean;
    if (cv > CV_MAX) continue;

    // Temperature weighting — hot runs inflate HR vs GAP, downweight them.
    // Runs above 28°C are excluded entirely (too much heat effect).
    const temp = act.weatherTemp ?? 15;
    if (temp > 28) continue;
    const tempWeight = temp > 22 ? 0.4 : temp > 18 ? 0.7 : 1.0;

    const r = computeDrift(splits);
    if (!r) continue;
    // Guard: only runs in a physiologically plausible HR range for aerobic work
    if (r.avgHR < maxHR * 0.58 || r.avgHR > maxHR * 0.90) continue;

    results.push({ ...r, tempWeight });
  }

  if (results.length < 3) return null;

  // Group into 5-bpm buckets, compute weighted-median drift per bucket
  const buckets = new Map<number, { drift: number; w: number }[]>();
  for (const r of results) {
    const b = Math.round(r.avgHR / BUCKET) * BUCKET;
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b)!.push({ drift: r.drift, w: r.tempWeight });
  }

  const sorted = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hr, entries]) => {
      // Weighted median
      const s = [...entries].sort((a, b) => a.drift - b.drift);
      const totalW = s.reduce((acc, e) => acc + e.w, 0);
      let cum = 0, median = s[0].drift;
      for (const e of s) { cum += e.w; if (cum >= totalW / 2) { median = e.drift; break; } }
      return { hr, median, n: entries.length };
    });

  // Need at least 3 buckets to establish a meaningful trend
  if (sorted.length < 3) return null;

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

  // Return the midpoint of the last below-threshold bucket
  return {
    lt1HR: Math.round(lt1Bucket + BUCKET / 2),
    confidence: results.length >= 20 ? "high" : results.length >= 8 ? "medium" : "low",
    runsUsed: results.length,
    drift5pctHR,
  };
}
