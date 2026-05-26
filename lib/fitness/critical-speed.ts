export interface CriticalSpeedResult {
  csMetersPerSec: number;
  wPrimeMeters: number;
  rSquared: number;
  effortsUsed: number;
}

export function estimateCriticalSpeed(
  bestEfforts: Array<{ distance: number; elapsed_time: number }>
): CriticalSpeedResult | null {
  // Filter to efforts in the 200m–10km range, require at least 3 points
  const usable = bestEfforts.filter(e => e.distance >= 200 && e.distance <= 10000 && e.elapsed_time > 0);
  if (usable.length < 3) return null;

  // Linear regression: time/distance = CS_inv + W'/distance
  // i.e. y = a + b*x  where  y = time/distance, x = 1/distance
  // CS = 1/a (intercept is inverted), W' = b/a
  // Rearranged: y = (W') * x + CS_inv  =>  slope=W', intercept=CS_inv
  const n = usable.length;
  const xs = usable.map(e => 1 / e.distance);
  const ys = usable.map(e => e.elapsed_time / e.distance);

  const sumX  = xs.reduce((a, x) => a + x, 0);
  const sumY  = ys.reduce((a, y) => a + y, 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);

  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-12) return null;

  const slope     = (n * sumXY - sumX * sumY) / denom;  // W' in meters
  const intercept = (sumY - slope * sumX) / n;           // 1/CS in s/m

  if (intercept <= 0) return null;

  const csMs     = 1 / intercept;
  const wPrime   = slope;

  // R²
  const yMean = sumY / n;
  const ssTot = ys.reduce((a, y) => a + (y - yMean) ** 2, 0);
  const ssRes = ys.reduce((a, y, i) => a + (y - (slope * xs[i] + intercept)) ** 2, 0);
  const rSq   = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  if (csMs <= 0 || wPrime <= 0) return null;

  return {
    csMetersPerSec: csMs,
    wPrimeMeters:   wPrime,
    rSquared:       rSq,
    effortsUsed:    n,
  };
}
