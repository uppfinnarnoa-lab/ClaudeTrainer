// Heart rate and pace zone calculations.
// Zones are defined relative to the athlete's lactate threshold HR and VO2max pace.

export interface HRZones {
  z1: [number, number]; // recovery
  z2: [number, number]; // aerobic
  z3: [number, number]; // tempo
  z4: [number, number]; // threshold
  z5: [number, number]; // VO2max
  maxHR: number;
  restHR: number;
}

export interface PaceZones {
  easy:      [number, number]; // sec/km
  marathon:  [number, number];
  threshold: [number, number];
  interval:  [number, number];
  repetition:[number, number];
  vdot: number;
}

/**
 * Estimate max HR from a list of per-activity max HR values.
 *
 * Strategy: take the 98th percentile rather than the absolute max to avoid
 * single-sensor spikes, then add a small margin because max is rarely reached
 * in training (only in true all-out efforts / races).
 *
 * The absolute max is used only as a floor (we won't estimate BELOW what was
 * actually observed).
 */
/**
 * Estimate max HR from per-activity max HR values.
 * Uses 95th percentile to filter sensor spikes, +2 bpm margin since
 * true max is rarely reached in ordinary training.
 */
export function estimateMaxHR(activityMaxHRs: number[]): number {
  if (activityMaxHRs.length === 0) return 185;
  const clean = activityMaxHRs.filter(h => h >= 130 && h <= 215);
  if (clean.length === 0) return 185;
  const sorted = [...clean].sort((a, b) => a - b);
  const p95 = sorted[Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1)];
  return Math.round(p95 + 2);
}

/**
 * Estimate max HR using ONLY race/hard-effort activities.
 * More reliable than global peak because races reach near-true max.
 * raceMaxHRs: maxHeartrate values from activities marked as race or keyword-race.
 */
export function estimateMaxHRFromRaces(raceMaxHRs: number[]): number | null {
  if (raceMaxHRs.length < 2) return null;
  const clean = raceMaxHRs.filter(h => h >= 140 && h <= 215);
  if (clean.length === 0) return null;
  const sorted = [...clean].sort((a, b) => a - b);
  // Take the 90th percentile of race max HRs (not absolute max — avoids mid-race spikes)
  const p90 = sorted[Math.min(Math.floor(sorted.length * 0.90), sorted.length - 1)];
  return Math.round(p90);
}

/**
 * Estimate max HR from threshold-effort activities.
 * More robust than raw max because threshold efforts have consistent, reliable HR.
 * thresholdHRs: array of average HRs from known hard/threshold sessions.
 */
export function estimateMaxHRFromThreshold(thresholdHRs: number[]): number | null {
  if (thresholdHRs.length < 3) return null; // not enough data
  const sorted = [...thresholdHRs].sort((a, b) => a - b);
  // 90th percentile of threshold HRs ≈ lactate threshold HR
  const p90idx = Math.floor(sorted.length * 0.90);
  const thresholdHR = sorted[Math.min(p90idx, sorted.length - 1)];
  // Threshold HR is typically 85–91% of max HR; use 88% midpoint
  return Math.round(thresholdHR / 0.88);
}

/**
 * Physiologically-anchored HR zones — non-uniform, based on LT1 and LT2.
 *
 * Uses % of maxHR (not HRR) because the research is clearer and the
 * zones are anchored at real metabolic thresholds, not math:
 *
 *   LT1 (aerobic threshold)       ≈ 75–80 % maxHR
 *   LT2 (lactate threshold / AT)  ≈ 86–91 % maxHR  ← trained athletes higher
 *
 * Zone widths are intentionally unequal:
 *   Z1  Recovery    < LT1 - 5 %
 *   Z2  Aerobic     LT1 - 5 % → LT1
 *   Z3  Tempo       LT1 → LT2
 *   Z4  Threshold   LT2 → LT2 + 6 %
 *   Z5  VO2max      > LT2 + 6 %
 */
export function buildHRZones(maxHR: number, restHR: number = 45): HRZones {
  const pct = (p: number) => Math.round(maxHR * p);

  // LT1 and LT2 as % of maxHR — higher values for well-trained athletes
  const lt1 = pct(0.78);  // aerobic threshold ≈ 78 % maxHR
  const lt2 = pct(0.88);  // lactate threshold ≈ 88 % maxHR

  return {
    z1: [restHR,      lt1 - 4],     // Recovery (below aerobic threshold)
    z2: [lt1 - 4,     lt1],         // Aerobic base
    z3: [lt1,         lt2],         // Tempo (between LT1 and LT2)
    z4: [lt2,         pct(0.94)],   // Threshold (at/above LT2)
    z5: [pct(0.94),   maxHR],       // VO2max
    maxHR,
    restHR,
  };
}

/** The LT1 and LT2 boundaries extracted from a zone set, for display. */
export function ltBoundaries(zones: HRZones) {
  return {
    lt1: zones.z3[0],  // LT1 = bottom of Z3
    lt2: zones.z4[0],  // LT2 = bottom of Z4
    ltTrainingRange: [zones.z4[0], Math.round(zones.maxHR * 0.91)] as [number, number],
    atTrainingRange: [zones.z3[0], zones.z4[0]] as [number, number],
  };
}

export interface LTBoundaries {
  lt1HR: number;
  lt2HR: number;
  lt1PaceSecPerKm: number;
  lt2PaceSecPerKm: number;
  source: "race-pbs" | "default";
}

/**
 * Estimate LT1 and LT2 from stored race PBs.
 *
 * Priority: HM → 10K → 5K for LT2.
 * LT2 pace scaling factors from research:
 *   HM pace ≈ LT2 pace (direct, most accurate)
 *   10K pace × 1.065 ≈ LT2 pace
 *   5K pace × 1.135 ≈ LT2 pace
 *
 * Convert pace → HR via linear regression if available.
 * Falls back to % of maxHR if no regression.
 */
export function estimateLTFromRaces(
  racePBs: Array<{ distanceM: number; timeSec: number }>,
  maxHR: number,
  restHR: number,
  regression?: { slope: number; intercept: number } | null,
): LTBoundaries {
  // Sort PBs by distance
  const byDist = [...racePBs].sort((a, b) => a.distanceM - b.distanceM);

  function paceOf(distM: number): number | null {
    // Find closest PB within ±8% of target distance
    const match = byDist.find(r => Math.abs(r.distanceM - distM) / distM < 0.08);
    return match ? match.timeSec / (match.distanceM / 1000) : null;
  }

  const hmPace  = paceOf(21097);
  const tenKPace = paceOf(10000);
  const fiveKPace = paceOf(5000);

  let lt2PaceSecPerKm: number | null = null;
  if (hmPace)     lt2PaceSecPerKm = hmPace;                  // HM pace ≈ LT2 directly
  else if (tenKPace) lt2PaceSecPerKm = tenKPace * 1.065;     // 10K + 6.5%
  else if (fiveKPace) lt2PaceSecPerKm = fiveKPace * 1.135;   // 5K + 13.5%

  if (!lt2PaceSecPerKm) {
    // No race data — fall back to standard % of maxHR
    return {
      lt1HR: Math.round(maxHR * 0.78),
      lt2HR: Math.round(maxHR * 0.88),
      lt1PaceSecPerKm: 0,
      lt2PaceSecPerKm: 0,
      source: "default",
    };
  }

  const lt1PaceSecPerKm = lt2PaceSecPerKm * 1.10; // LT1 ≈ 10% slower than LT2

  // Convert pace → HR via regression, or fall back to % of maxHR
  function paceToHR(paceSecPerKm: number): number {
    if (regression) {
      const vMin = (1000 / paceSecPerKm) * 60;
      const vo2AtPace = -4.60 + 0.182258 * vMin + 0.000104 * vMin * vMin;
      const hr = (vo2AtPace - regression.intercept) / regression.slope;
      if (hr > maxHR * 0.65 && hr < maxHR * 0.99) return Math.round(hr);
    }
    return null as unknown as number;
  }

  const lt2HRFromRegression = paceToHR(lt2PaceSecPerKm);
  const lt1HRFromRegression = paceToHR(lt1PaceSecPerKm);

  return {
    lt1HR: lt1HRFromRegression || Math.round(maxHR * 0.78),
    lt2HR: lt2HRFromRegression || Math.round(maxHR * 0.88),
    lt1PaceSecPerKm: Math.round(lt1PaceSecPerKm),
    lt2PaceSecPerKm: Math.round(lt2PaceSecPerKm),
    source: "race-pbs",
  };
}

/**
 * Build HR zones anchored to data-derived LT1/LT2 instead of fixed percentages.
 * Falls back to standard percentages when no race data is available.
 */
export function buildHRZonesFromLT(
  lt: LTBoundaries,
  maxHR: number,
  restHR: number,
): HRZones {
  const lt1 = lt.lt1HR;
  const lt2 = lt.lt2HR;
  return {
    z1: [restHR,    lt1 - 4],
    z2: [lt1 - 4,  lt1],
    z3: [lt1,      lt2],
    z4: [lt2,      Math.min(lt2 + 8, maxHR - 2)],
    z5: [Math.min(lt2 + 8, maxHR - 2), maxHR],
    maxHR,
    restHR,
  };
}

// Classify an average HR value into a zone (1-5). Returns 0 if no HR.
export function classifyHRZone(avgHR: number | null, zones: HRZones): number {
  if (!avgHR) return 0;
  if (avgHR < zones.z1[1]) return 1;
  if (avgHR < zones.z2[1]) return 2;
  if (avgHR < zones.z3[1]) return 3;
  if (avgHR < zones.z4[1]) return 4;
  return 5;
}

// Daniels VDOT pace tables. Returns pace zones in seconds per km.
// Based on Jack Daniels' Running Formula.
export function buildPaceZones(vdot: number): PaceZones {
  // Daniels tables for key paces (sec/km):
  // Easy = 59-74% vdot, Marathon = 75-84%, Threshold = 83-88%, Interval = 95-100%, Rep = 105-110%
  const vo2 = vdot;
  // Use velocity at VDOT to get threshold pace (T pace = ~88% VO2max velocity)
  const vO2maxVelocity = vdotToVelocity(vo2); // m/s

  const easyLow  = 1000 / (vO2maxVelocity * 0.59);
  const easyHigh = 1000 / (vO2maxVelocity * 0.74);
  const marLow   = 1000 / (vO2maxVelocity * 0.75);
  const marHigh  = 1000 / (vO2maxVelocity * 0.84);
  const thrLow   = 1000 / (vO2maxVelocity * 0.83);
  const thrHigh  = 1000 / (vO2maxVelocity * 0.88);
  const intLow   = 1000 / (vO2maxVelocity * 0.95);
  const intHigh  = 1000 / (vO2maxVelocity * 1.00);
  const repLow   = 1000 / (vO2maxVelocity * 1.05);
  const repHigh  = 1000 / (vO2maxVelocity * 1.10);

  return {
    easy:       [easyLow, easyHigh],
    marathon:   [marLow, marHigh],
    threshold:  [thrLow, thrHigh],
    interval:   [intLow, intHigh],
    repetition: [repLow, repHigh],
    vdot,
  };
}

// Convert VDOT to velocity at VO2max (m/s).
// Approximation: VO2 = 0.000104v³ - 0.182258v² + 4.6v - 4.31 (Daniels)
// Invert numerically.
function vdotToVelocity(vdot: number): number {
  // Daniels: VO2 at pace v (m/min) ≈ -4.60 + 0.182258v + 0.000104v²
  // Invert with Newton's method. Good initial guess: VDOT 50 → ~268 m/min.
  // Linear approximation: v ≈ vdot * 5.0 m/min is a safe starting point.
  let v = vdot * 5.0; // m/min — reasonable across VDOT 30-80
  for (let i = 0; i < 30; i++) {
    const f = -4.60 + 0.182258 * v + 0.000104 * v * v - vdot;
    const df = 0.182258 + 2 * 0.000104 * v;
    if (Math.abs(df) < 1e-10) break;
    v -= f / df;
  }
  return v / 60; // m/s
}
