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
export function estimateMaxHR(activityMaxHRs: number[]): number {
  if (activityMaxHRs.length === 0) return 190;
  // Filter out obvious sensor spikes (> 220 or < 100)
  const clean = activityMaxHRs.filter(h => h >= 100 && h <= 220);
  if (clean.length === 0) return 190;
  // 98th percentile to avoid outlier spikes
  const sorted = [...clean].sort((a, b) => a - b);
  const p98idx = Math.floor(sorted.length * 0.98);
  const p98 = sorted[Math.min(p98idx, sorted.length - 1)];
  // Add 3 bpm margin: max HR is rarely reached in monitored training
  return Math.round(p98 + 3);
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

// Build HR zones from max HR. Using 5-zone model based on % of max HR.
export function buildHRZones(maxHR: number, restHR: number = 45): HRZones {
  const hrr = maxHR - restHR; // heart rate reserve
  // Karvonen method: target_hr = rest_hr + %HRR × hrr
  const z = (pct: number) => Math.round(restHR + pct * hrr);
  return {
    z1: [z(0.50), z(0.60)],
    z2: [z(0.60), z(0.70)],
    z3: [z(0.70), z(0.80)],
    z4: [z(0.80), z(0.90)],
    z5: [z(0.90), maxHR],
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
