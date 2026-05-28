
# Bucket Estimator & Decoupling — Improvement Research

> **Status:** 2026-05-28 — Items A–C, E–H implemented. Item D under investigation.
> **Model files:** `lib/fitness/zones.ts` → `estimateZonesFromStatisticalAnalysis()`,
> `lib/fitness/decoupling.ts` → `estimateLT1FromDecoupling()`

---

## Current Algorithm Summary

### Bucket Estimator (`estimateZonesFromStatisticalAnalysis`)
1. Input: activity averages + lap splits; filter HR 52–96% maxHR, ≥800m, ≥3min, grade <12%
2. Grade-Adjusted Pace via Minetti (2002) polynomial
3. Temperature weight: >30°C skip, 25–30°C ×0.35, 20–25°C ×0.75, else ×1.0
4. Recency weight: 90-day half-life (180-day fallback if <40 runs in last 90 days)
5. Zone-proximity weight: ×1.5 if HR 62–85% maxHR; ×0.75 outside
6. **Race-activity weight: ×3** (item G — max-effort anchor for fast end of curve)
7. Fixed 15 s/km bins; require ≥15 runs/bucket (raised from 10)
8. **80th-percentile HR per bucket** (item A — was weighted median)
9. Pool-adjacent-violators for monotonicity
10. Exhaustive piecewise linear search with **reciprocal-density bucket weights** (item B)
11. R² ≥ 0.62; physiological sanity checks; ≥6 monotone buckets required

### maxHR estimation (`estimateMaxHRFromRaces`)
- **+5 bpm margin added** (item C) — race-peak HR is typically 5 bpm below true HRmax

### Aerobic Decoupling (`estimateLT1FromDecoupling`)
1. Input: activities with per-km splits; **≥55 min, ≥8.5km** (item H, raised from 45 min/7km)
2. Temperature filter: >28°C skip; 22–28°C ×0.4; 18–22°C ×0.7; pace CV <10%
3. Per activity: **skip first 2 laps** (item F, was 1) for warm-up + HR stabilisation
4. HR/GAP ratio drift: (second-half / first-half) − 1
5. **Drift threshold: 3.5%** (item E, was 5%) — Oliveira 2021: at-LT1 drift over 40 min ≈ 4%
6. Group into 5-bpm HR buckets; find highest bucket where median drift ≤ 3.5% → LT1

---

## Root Causes — Status After Implementations

The three root causes identified have been addressed:

| Cause | Description | Fix applied |
|-------|-------------|-------------|
| 1 — Volume imbalance in regression | Easy runs dominate; breakpoints pulled toward dense easy zone | A (80th pct), B (reciprocal weight), G (race ×3) |
| 2 — Underestimated maxHR cascades into zone boundaries | Training-data maxHR is 5–10 bpm below true HRmax | C (+5 bpm correction) |
| 3 — Decoupling threshold too permissive | Natural at-LT1 drift is ~4%, leaving only 1% margin at old 5% threshold | E (3.5%), F (skip 2 laps), H (55 min) |

---

## Remaining Investigation: Item D — Tanaka formula as maxHR floor

### What
When `dateOfBirth` is set in `AthleteProfile`, compute the Tanaka formula:
`HRmax = 208 − 0.7 × age`. Use it as a **lower floor** for the data-derived maxHR estimate:
if the data-derived estimate is more than 8 bpm below Tanaka, blend toward the formula.

**Not a replacement** — as a floor/safety net only.

### Why it was not implemented alongside C
Item C (+5 bpm to race-HR estimate) already addresses the structural underestimation for athletes
with race data. Item D adds value only in two specific situations:
- Athlete has **no race data at all** (no isRace-flagged activities, no race PBs)
- All races are paced conservatively (e.g. only marathons, never short efforts)

In these cases the chain `estimateMaxHRFromRaces → statisticalMax → estimateMaxHRFromThreshold
→ estimateMaxHR` must be relied on exclusively. Each step in that chain under-estimates for
the same structural reason (training maxima are below true HRmax).

### Deep Analysis

**How good is the Tanaka formula?**

Tanaka et al. (2001, *JACC* 37(1):153–156) derived `208 − 0.7 × age` from a meta-analysis of
351 studies (n=18,712 subjects). Scharhag-Rosenberger et al. (2023, PMC10146295, n=5,311
CPET-measured endurance athletes) found:
- Tanaka RMSE: 9.2 bpm (best of all tested age formulas)
- 95% prediction interval: ±18 bpm — meaning for any individual athlete, true HRmax is
  anywhere from 208−0.7×age − 18 to 208−0.7×age + 18 bpm
- 61.5% of estimates underestimate true HRmax (directionally correct, but imprecise)
- Performance for **endurance athletes specifically**: slightly better than the general
  population because endurance training attenuates the age-related HRmax decline (Tanaka's
  original sample was ~40% endurance-trained)

**The central problem: individual variation is enormous**

The ±18 bpm 95% CI means that for a 35-year-old athlete:
- Tanaka predicts: 208 − 0.7 × 35 = **183.5 bpm**
- True HRmax could be anywhere from **165 to 201 bpm** (95% range)

If this athlete's true HRmax is 175 bpm (bottom quartile — real for some endurance athletes),
and we floor at Tanaka − 8 = 175.5, we would round up to 176 and be essentially correct.
But if their true HRmax is 165, we would floor at 175.5 and overcorrect by **10 bpm**,
pushing all zone boundaries upward incorrectly.

This is the core risk: a formula with ±18 bpm individual error used as a "safety floor" can
introduce errors as large as the errors it is trying to prevent.

**When does the floor actually help vs. hurt?**

The floor activates when: `data_estimate < Tanaka − 8`.

For the floor to *help*: the data underestimates AND Tanaka is closer to truth.
For the floor to *hurt*: the data is accurate AND Tanaka overcorrects (athlete is in bottom
quartile of HRmax distribution).

Given that ~40% of athletes have true HRmax below Tanaka mean, the floor would hurt
approximately 40% × P(data_estimate is actually correct) of the time. If data is correct
60% of the time for athletes with no race data, the floor would hurt ~24% and help ~36%.
This is not a reliable enough improvement.

**Why not use Tanaka as a cross-validation signal instead of a floor?**

A more conservative use: flag to the user (in the UI) when the data-estimated maxHR deviates
more than 10 bpm from Tanaka. Display: "Estimated maxHR (168 bpm) is notably below the
age-formula estimate (183 bpm). If you've never done an all-out race effort, consider
manual calibration." This surfaces the discrepancy without silently adjusting values.

**Interaction with Item C**

For athletes with ≥2 race HR readings, item C already corrects the underestimate by +5 bpm.
The typical residual after item C should be 0–3 bpm (within normal noise). Applying Tanaka
on top of item C could introduce a second correction on already-corrected data, potentially
overcorrecting. The floor should only apply when item C returned null (no race data).

**Verdict**

Item D is **low-value as a silent automatic floor** because:
1. Individual HRmax variation (±18 bpm) exceeds the correction benefit for many athletes
2. Item C already handles the primary use case (athletes with race data)
3. For athletes with no race data, the formula is no more reliable than the training-data
   estimate — both are indirect proxies with multi-bpm noise

**Recommended implementation (if pursued):** Surface the Tanaka discrepancy as a UI hint
in the settings page (next to the maxHR field), not as an automated correction. Show:
"Age-formula estimate: 183 bpm" alongside the calibration result. This gives the user
information to decide whether to manually override, without silently inflating zones.

No code change needed — this is a UI-level informational addition, not an algorithm change.

---

## Literature References

- Oliveira et al. (2021) "From Incremental Test to Continuous Running at Fixed Lactate Thresholds" — PMC10611166. Mean HR drift at LT1 = +4.0% over 40 min.
- Scharhag-Rosenberger et al. (2023) "Validity of Maximal HR Prediction Models among Runners and Cyclists" — PMC10146295. n=5,311 CPET. Tanaka RMSE 9.2 bpm; 95% CI ±18 bpm.
- Tanaka et al. (2001) "Age-Predicted Maximal Heart Rate Revisited" — *JACC* 37(1). Formula: 208 − 0.7 × age from meta-analysis n=18,712.
- PMC11829848 (Coquart et al.) — VT1 in high-trained males: 80.8 ± 4.8% HRmax.
- Muggeo (2003) "Estimating regression models with unknown breakpoints" — *Stat Med* 22:3055. Piecewise regression sensitivity to imbalanced data.
- Steininger et al. (2021) "Density-based weighting for imbalanced regression" — *Springer ML*. Theoretical basis for reciprocal-density weighting (item B).
- Seiler & Kjerland (2006) "Quantifying training intensity distribution in elite endurance athletes" — *SJMSS* 16(1). 75–85% of sessions at sub-LT1 intensity.
