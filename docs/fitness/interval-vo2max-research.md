# VO2max / Race Pace / Pace Zones from Interval Training — Research

> **Purpose**: How to extract fitness signals from training sessions (intervals, tempo, easy),
> not just race results. What models work with avg HR + avg pace + session name only.

---

## 1. The Fundamental Constraint

We have per-activity averages only — no per-second streams. For a "5×4min interval" session:
- Whole-activity avg pace: ~4:10/km (diluted by warm-up + recovery jogs)
- Whole-activity avg HR: ~172 bpm
- True interval pace: ~3:45-3:50/km (unknown without splits)

This makes direct pace extraction unreliable (±8-12% error). The value of interval sessions lies elsewhere: **accumulated training impulse** and **HR-based intensity signal**.

---

## 2. Critical Velocity (CV) — Best Field-Based Model

### What it is
CV (Critical Speed) is the asymptotic pace a runner can sustain indefinitely — it corresponds closely to **LT2** (lactate threshold 2 / VT2). Mathematically:

```
v(t) = CS + D'/t       (hyperbolic model)
```

- `CS` = critical speed (the asymptote, ≈ LT2 pace)
- `D'` = anaerobic reserve capacity (meters above CS before fatigue)
- `t` = duration

Research on 25,000+ Strava athletes showed `R² = 0.9999` for the linear relationship `distance = CS × time + D'`.

### Estimation from race PBs

With PBs at ≥3 distances, fit a linear regression: `distance ~ time`:

```
CS  = slope  (m/s → convert to sec/km)
D'  = intercept (meters)
```

**Practical scaling:**
| PB Distance | → vVO2max | → 5K pace | → 10K pace |
|---|---|---|---|
| CS × 1.00 | LT2 pace | CS × 1.07 | CS × 1.03 |
| CS × 1.04 | vVO2max | | |

**Accuracy:** ±2-4% for CS from ≥3 PBs. vVO2max derived from CS is ±4-6% accurate.

### Implementation for TrainingLab

We already store RaceRecord with `distanceM` + `time`. Fit linear regression across best PBs per distance to get CS.

```typescript
// Linear regression: time = (distanceM - D') / CS
// Equivalently: distanceM = CS * time + D'
function estimateCriticalSpeed(pbs: { distanceM: number; timeSec: number }[]) {
  // Only use pbs with duration 3-30 minutes for best fit
  const valid = pbs.filter(p => p.timeSec >= 180 && p.timeSec <= 1800);
  if (valid.length < 2) return null;
  // WLS: distanceM = CS * timeSec + D'
  // Slope = CS (m/s), intercept = D' (m)
  // Use ordinary LS (equal weights — all PBs are verified)
  const n = valid.length;
  const sumT = valid.reduce((s, p) => s + p.timeSec, 0);
  const sumD = valid.reduce((s, p) => s + p.distanceM, 0);
  const sumT2 = valid.reduce((s, p) => s + p.timeSec ** 2, 0);
  const sumTD = valid.reduce((s, p) => s + p.timeSec * p.distanceM, 0);
  const denom = n * sumT2 - sumT ** 2;
  if (Math.abs(denom) < 1e-6) return null;
  const CS = (n * sumTD - sumT * sumD) / denom; // m/s
  const Dprime = (sumD - CS * sumT) / n;         // meters
  return { csMs: CS, dprimeM: Dprime, csPaceSecPerKm: 1000 / CS };
}
```

**Then use CS to get VDOT:**
```
vVO2max_pace_sec_per_km = csPaceSecPerKm / 1.04   (4% faster than LT2/CS)
VDOT from vVO2max pace via Daniels formula
```

---

## 3. Interval Sessions — What They Tell Us

### What we CAN extract
1. **Session type** (via name keyword matching)
2. **Peak HR effort** (`maxHeartrate` per session)
3. **Session TRIMP** (Bannister formula — accumulated training stimulus)
4. **Approximate intensity** (avg HR as % of maxHR → Z3/Z4/Z5 classification)

### What we CANNOT reliably extract (without splits)
- Exact interval pace
- Time spent at each intensity
- Pace during the hard segments vs. recovery

### Back-calculation method (approximate)
For a well-structured interval session (e.g., 5×4min at 90% HRmax):

```
totalTime = warm(15%) + intervals(25%) + recoveries(25%) + cooldown(15%)
                                                         // rough approximation

intervalAvgHR ≈ (totalHR_budget - warm_cool_budget) / intervalTime
              = (totTime × avgHR - (0.30 × totTime × 0.62 × maxHR)) / (0.50 × totTime)
```

**Error:** ±8–15% on estimated interval pace. Only useful for trend-checking, not precision.

**Recommendation:** Don't use interval sessions for pace-based VDOT. Use them for TRIMP.

---

## 4. Bannister TRIMP — Training Stimulus From Any Session

The gold-standard way to extract fitness signal from sessions of any type:

```
TRIMP = duration_min × ΔHR_ratio × e^(b × ΔHR_ratio)

where:
  ΔHR_ratio = (avgHR - restHR) / (maxHR - restHR)
  b = 1.92 (male), 1.67 (female)
```

**Key property:** An interval session at 92% HRmax for 45 min gives MUCH higher TRIMP than an easy 45-min run at 65% HRmax. This correctly captures the disproportionate stimulus of hard work.

**Comparison to current TSS (Training Stress Score):**

| Metric | Formula | Captures intensity? | Exponential? |
|---|---|---|---|
| TSS (current) | duration × (avgHR/maxHR)² | Partially | No |
| Bannister TRIMP | duration × ΔHR × e^(b×ΔHR) | Yes | Yes |

TRIMP is more sensitive to high-intensity work — a 40-min interval session gives ~2× the TRIMP of an equal-time easy run, accurately reflecting the greater training stimulus.

### Should we switch TSS → TRIMP?
TSS is simpler and well-understood. TRIMP is more physiologically accurate. For the purposes of ATL/CTL/TSB computation, the current TSS approach is acceptable. TRIMP's value is as an **additional model input** for VO2max estimation.

---

## 5. Session Classification from Name + HR

### Keyword patterns for Swedish running sessions

```typescript
const SESSION_TYPES = {
  interval:   /intervall|interval|tisdagsbana|bana\b|\dx\d+|\d+x|fartlek|upprepning/i,
  threshold:  /tröskel|tempo|cruise|LT|lång.?tempo|10km.?tempo|marathon.?tempo/i,
  long_run:   /långpass|lång\b|long.?run|LR\b/i,
  race:       /tävl|lopp|race|mila|stafett|sic\b|parkrun|SM\b|DM\b/i,
  easy:       /lugn|easy|recovery|vila|lätt|aerob/i,
};
```

### HR-based classification (backup/validation)
```
avgHR < 70% maxHR           → Easy/Recovery
70-80% maxHR                → Aerobic base
80-87% maxHR                → Tempo/Threshold  
87-93% maxHR + name=interval → Interval (VO2max)
> 93% maxHR                 → Race or hard rep
```

**Accuracy vs. actual time-in-zone:** ~70–80% (whole-activity avg dilutes peaks).

---

## 6. Implementing a CV-Based Model (Model 6)

### Addition to `estimateVO2max()`

The current 5-model system (VDOT, HR-regression, Uth-Sørensen, Cooper, decay) should add:

**Model 6: Critical Speed from race PBs**
- Input: same `racePBs[]` already passed to the function
- Method: linear regression of `distance ~ time` across 3+ PBs (duration 3–30 min)
- Output: VDOT derived from `vVO2max = CS × 1.04`
- Weight: 0.15 (when race PBs present; 0 otherwise)

The model is independent of model 1 (which uses Daniels formula per distance independently). CS uses the *relationship across distances*, capturing fatigue curves. This provides complementary information.

### Updated weight scheme

| Model | No race PBs | With race PBs |
|---|---|---|
| VDOT from PBs (per-distance Daniels) | 0 | 0.55 |
| Critical Speed from PBs | 0 | 0.15 |
| HR-pace regression | 0.35–0.45 | 0.15–0.20 |
| Uth-Sørensen | 0.10 | 0.05 |
| Cooper | 0.07 | 0.03 |
| Decay bridge | 0.05 | 0.02 |

---

## 7. Issues Found in Current Implementation

### Issue 1: `/ factor` is backwards for training-run VDOT
Current code in `estimateVO2max()`:
```typescript
const factor = isRaceSession ? 1 : (b.m < 8000 ? 0.96 : 0.99);
const v = vdotFromRace(b.m, a.timeSec / factor);
```

`timeSec / 0.96` makes time LONGER (more seconds) → LOWER VDOT.

**Intent is ambiguous.** Could mean:
- "Be conservative: assume the runner did this at 96% effort" → divide gives longer time → lower VDOT ✓ (conservative)
- "Race would be 4% faster" → multiply gives shorter time → higher VDOT (optimistic)

**Verdict:** The conservative interpretation is valid. However, with race PBs at 70% weight, this matters only when no PBs are logged. The magnitude (4%) may be too aggressive — `0.98` (2% conservative) would be more appropriate.

### Issue 2: `cache.ts` regression missing recency weights
`buildHRPaceRegressionParams()` in `updateHRZones()` is called without weights:
```typescript
const regressionRuns = activities.map(a => ({
  avgHR: a.averageHeartrate!,
  avgPaceSecPerKm: ...,
  // ← no weight field
}));
```
This means old activities (from 3 years ago) are treated equally to last week's runs.
**Fix needed**: Add `weight: Math.exp(-daysAgoFrom(a, 'startDate') / 180)`.

### Issue 3: Race PBs not shown in AI coach system prompt
`prompts.ts` shows VO2max + paces but NOT the raw race PB times. The AI doesn't know "user's 5K PB is 18:25" — it only sees "VDOT 57". When a user asks "what's my 5K time?", the AI can't answer precisely.
**Fix needed**: Add race PBs summary to `CoachContext` and system prompt.

### Issue 4: Interval sessions excluded but not used for anything
`looksLikeIntervals` sessions are correctly excluded from HR-pace regression. But they currently contribute zero to VO2max estimation. Their high avgHR is valuable for the TRIMP model.

---

## 8. Recommended Next Steps

Priority order:
1. **Add CS model** (Model 6) — high impact, we have the data in RaceRecord
2. **Fix cache.ts regression recency weights** — ensures LT estimation from race PBs is current
3. **Add race PBs to AI context** — makes AI coach actually useful for race questions
4. **Reduce training-run VDOT factor** from 0.96 → 0.98 (less aggressive penalty)
5. **TRIMP model for VO2max trend** — long-term, requires multi-week correlation

---

## Sources

- [Critical Speed from Strava Data (PMC 2020)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7664951/)
- [Critical Speed Guide for Runners — Running Writings](https://runningwritings.com/2024/01/critical-speed-guide-for-runners.html)
- [Bannister TRIMP formula](https://www.trainingimpulse.com/banisters-trimp-0)
- [VO2max Intervals — Seiler research](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11743937/)
- [LT1/LT2 individual variation — Running Writings](https://runningwritings.com/2025/02/lt1-lt2-heart-rate-individual-variation.html)
- [Critical Power and LT2 relationship](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8220144/)
