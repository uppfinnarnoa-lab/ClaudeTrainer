# TrainingLab — Master Planning Document

> **Status:** 2026-05-20  
> **Purpose:** Research synthesis, bug audit, implementation plans for the next major iteration.  
> This document must be read before implementing any of the features below.

---

## Table of Contents

1. [VO2max / Race Prediction / Pace Zones — Research Synthesis](#1-vo2max--race-prediction--pace-zones--research-synthesis)
2. [HR Zone Estimation from Large Datasets — Research](#2-hr-zone-estimation-from-large-datasets--research)
3. [Additional Analytics from Strava Data](#3-additional-analytics-from-strava-data)
4. [File & Folder Structure Reorganisation](#4-file--folder-structure-reorganisation)
5. [Full Bug Audit](#5-full-bug-audit)
6. [Implementation Plans](#6-implementation-plans)
   - 6A. PB Logging Rebuild (manual-only)
   - 6B. AI Zone Estimation (real prompt → values)
   - 6C. HR Zone Model from Large Dataset
   - 6D. Splits Visualisation Fix

---

## 1. VO2max / Race Prediction / Pace Zones — Research Synthesis

### 1.1 The Core Problem

With 2 500+ activities but no per-second streams and no lab data, the fundamental challenge is:

- `splitsMetric` and `bestEfforts` are **NULL** in the DB for paginated Strava activities. Only individually-fetched activities have them.
- Whole-activity avg pace for interval sessions (Tisdagsbana) is **diluted by warm-up/cool-down**, making it look slower than actual race pace.
- This means auto-detected VDOT from activities alone will persistently underestimate by 5–10 points.

**The correct architecture**: Race Records (manual PBs) anchor VDOT at full weight. The HR-pace regression from all activities provides a secondary cross-check. HR-based models (Uth-Sørensen, Cooper) provide a plausibility floor only.

### 1.2 VO2max Estimation — What the Research Says

#### Model 1: Jack Daniels VDOT (from race records)
- **Formula**: VO₂ = (−4.60 + 0.182258·v + 0.000104·v²) / %VO₂max_at_duration
- **Error**: ±2–3 ml/kg/min when input is a genuine race effort at the correct distance
- **Best inputs**: 5K or 10K race times (15–40 min duration fits the model optimally)
- **Bias**: Derived from elite-runner data. Sub-elite runners with poor running economy may see slight overestimation.
- **Key rule**: Only use `isRace=true` or race-keyword activities, OR stored RaceRecord entries.

#### Model 2: Firstbeat/Garmin HR-pace regression
- **Method**: Linear regression of (avgHR, VO₂_at_pace) across ALL submaximal runs. Extrapolate to maxHR.
- **Validated on**: 2 690 real training runs, 79 runners, 6–9 months. MAPE ≈ 5%.
- **Critical insight**: The regression uses the **SLOPE** of VO₂ vs HR — this slope is stable across training states. What changes with fitness is the **intercept** (same HR → faster pace → higher VO₂ at that HR).
- **Why it underestimates with current implementation**: Interval sessions with warm-up/cooldown show a HIGH avgHR but a SLOW whole-activity avg pace (dilution). This flattens the slope and drags the extrapolation down.
- **Fix**: Exclude activities with names matching interval keywords (tisdagsbana, intervall, fartlek, etc.) from the regression input. Only use continuous steady-state efforts.
- **Recency weighting**: Apply exponential weights (half-life 180 days) to the regression — weighted least squares. Recent fitness should dominate.

#### Model 3: Uth-Sørensen (VO₂max = 15.3 × HRmax/HRrest)
- **Error**: ±15–20%, tends to overestimate.
- **Use**: Plausibility check only. Weight: 0.05.

#### Model 4: Åstrand-Ryhming single-effort submaximal
- **Same as Firstbeat extrapolation but with one data point** — less reliable.
- Not currently used separately; subsumed by Model 2.

#### Recommended Weight Distribution (large dataset, race PBs present)
| Model | Current | Recommended |
|---|---|---|
| VDOT from race PBs | ~0.50 (mixed with activities) | **0.70** |
| HR-pace regression (fixed) | 0.20 | **0.20** |
| Uth-Sørensen | 0.15 | **0.05** |
| Cooper | 0.10 | **0.03** |
| Decay bridge | 0.05 | **0.02** |

When NO race PBs exist: drop VDOT weight to 0.40, raise HR-regression to 0.35.

#### Key Implementation Fix for HR-pace regression

```typescript
// EXCLUDE interval sessions — avg pace is diluted by warm-up/recovery
function looksLikeIntervals(name: string): boolean {
  return /intervall|interval|fartlek|tisdagsbana|bana|x\s*\d|\d+\s*x|rep/i.test(name ?? "");
}

// WEIGHTED least squares (recency-weighted)
// Each run point: (HR_i, VO2_i, w_i = exp(-daysAgo_i / 180))
// Standard WLS formula replaces Σ with Σw·(...)
```

### 1.3 Race Time Prediction — What the Research Says

#### Riegel Formula (1977)
```
T₂ = T₁ × (D₂/D₁)^1.06
```
- Exponent 1.06 = empirically fitted fatigue parameter
- Beginners: use 1.08 (slower degradation per extra distance)
- Advanced runners: use 1.04
- **Accuracy**: ±1–2 min for 5K→10K, ±5–15 min for 5K→marathon
- **Weakness**: Marathon predictions from 5K are too optimistic if long-run training is lacking
- **Implementation**: Already have VDOT prediction; add Riegel as a parallel estimate and show both

#### Daniels VDOT prediction
- More accurate for trained runners with matching endurance base
- Better for shorter distances (5K↔10K↔HM)
- Both methods should be shown; user picks which to trust

#### TSB adjustment (form on race day)
```
adj = clamp(-TSB × 0.0005, -0.04, +0.08)
T_adjusted = T_base × (1 + adj)
```
- TSB = +10 → ~0.5% faster
- TSB = −15 → ~0.75% slower

### 1.4 Pace Zones — What the Research Says

#### Current approach (Daniels E/M/T/I/R)
- Zones derived from vVO2max velocity as percentages
- Well-validated, widely used
- The math is correct; the zones are only as good as the VDOT input

#### What to add: LT1/LT2-anchored zones

Research consensus on LT percentages:
- **LT1** (aerobic threshold, 2 mmol/L lactate): **69–80% VO₂max velocity** for trained runners
  - Pace: approximately **10K_pace + 60–90 sec/km**
  - HR: approximately **75–80% HRmax**
- **LT2** (anaerobic threshold, 4 mmol/L lactate): **82–90% VO₂max velocity**
  - Pace: approximately **10K_pace + 15–25 sec/km** (≈ half-marathon pace)
  - HR: approximately **85–91% HRmax**

From race performance data (simpler):
```
LT2_pace_sec_per_km = 10K_pace + 15      (from 10K time)
LT2_pace_sec_per_km = 5K_pace + 40       (from 5K time)
LT1_pace_sec_per_km = LT2_pace + 45      (approx)
```

#### Seiler's 3-zone model (for polarized training check)
- Zone 1: < LT1 (easy, aerobic)
- Zone 2: LT1 → LT2 (tempo, "grey zone", avoid spending too much time here)
- Zone 3: > LT2 (high intensity, intervals)
- Optimal distribution for endurance athletes: **~80% Zone 1, ~5% Zone 2, ~15% Zone 3**

#### What to compute and display
1. Daniels E/M/T/I/R (current — keep)
2. LT1 and LT2 pace from race PBs (add)
3. Seiler zone time distribution from recent activities (add as a new Stats section)

---

## 2. HR Zone Estimation from Large Datasets — Research

### 2.1 The Fundamental Problem with % of maxHR

- LT1 ranges **69–94% HRmax** across the population
- LT2 ranges **80–98% HRmax** across the population
- Fixed percentages (e.g., "LT2 = 88% maxHR") are wrong for ~20% of athletes
- The current implementation uses fixed 78% (LT1) and 88% (LT2) — reasonable default, not personalised

### 2.2 Better: Derive LT1/LT2 from Race Paces

With race PBs, we can compute threshold pace directly:
```
LT2_pace = HM_race_pace          (if available — most direct)
LT2_pace = 10K_pace × 1.065     (scaling factor from research)
LT2_pace = 5K_pace × 1.135      (less reliable for marathon-type runners)

LT1_pace = LT2_pace × 1.10      (approx 10% slower than LT2)
```

Then convert pace → HR using the HR-pace regression we already have:
```
HR_at_pace = (VO2_at_pace - intercept) / slope
```
This gives **personalised** LT1/LT2 heart rates, not fixed percentages.

### 2.3 Better: Deflection Point from Large Dataset

With 2 500 activities, we can analyse the HR-pace slope across intensity bands:
1. Bucket all activities by avg pace (e.g., every 15 sec/km)
2. Plot median avgHR per bucket
3. Find where the slope changes (inflection = LT2 estimate)

This is a data-driven version of the Conconi test. With enough data points per bucket, it's statistically stable.

### 2.4 Validation: Smartwatch LT Accuracy (2025 Research)
From Frontiers in Physiology (2025):
- LTHR estimation by smartwatches: **6–7% error** (±10–11 bpm)
- LT pace estimation: **12–26% error** (much worse!)
- **Conclusion**: Trust the HR boundary, not the pace boundary from device estimates

### 2.5 Recommended Zone Algorithm (new model)

```
Step 1: Get best available race PBs (HM > 10K > 5K)
Step 2: Compute LT2_pace from race PBs using scaling factors
Step 3: Compute LT1_pace = LT2_pace × 1.10
Step 4: Convert pace → HR using stored HR-pace regression (from large dataset)
Step 5: If regression unavailable, fall back to LT2 = 88% maxHR, LT1 = 78% maxHR
Step 6: Build non-uniform zones around LT1 and LT2
```

Zone boundaries (non-uniform, physiologically anchored):
```
Z1 (Recovery):   restHR  → LT1_HR - 8 bpm
Z2 (Aerobic):    LT1_HR - 8 → LT1_HR
Z3 (Tempo):      LT1_HR → LT2_HR
Z4 (Threshold):  LT2_HR → LT2_HR + 7 bpm
Z5 (VO2max):     LT2_HR + 7 → maxHR
```

### 2.6 AI Zone Estimation — What It Should Do

Currently the AI button just computes algorithmic zones and asks the AI to comment. **This is wrong.** The AI should:

1. Receive a detailed prompt with all available data: race PBs, recent hard sessions (HR + pace), training history, 90-day activity log
2. Use its reasoning to estimate LT1 and LT2 (heart rate AND pace)
3. Return structured JSON with zone boundaries
4. The app parses the JSON and updates the DB

**Prompt design:**
```
You are estimating heart rate training zones for an endurance runner.

Available data:
- Race PBs: [5K: 18:25, 10K: 38:45, HM: 1:27:30]
- Max HR observed: 190 bpm (in races)
- Resting HR: 48 bpm
- Recent hard sessions (last 90 days):
  [list of sessions with avgHR and avg pace]

Estimate:
1. LT1 (aerobic threshold): HR and pace
2. LT2 (anaerobic threshold): HR and pace
3. Max HR (best estimate)

Return ONLY valid JSON:
{
  "lt1_hr": 155, "lt1_pace_sec_per_km": 285,
  "lt2_hr": 168, "lt2_pace_sec_per_km": 255,
  "max_hr": 190,
  "reasoning": "..."
}
```

---

## 3. Additional Analytics from Strava Data

All of these can be computed from the existing data. Priority ranked high/medium/low.

### Priority: High (immediate value, easy to compute)

| Metric | How to Compute | Display |
|---|---|---|
| **Aerobic efficiency (EF)** | avg_pace_km_per_min / avgHR, tracked per Z2 run | Line chart over time — rising = getting fitter |
| **ACWR (Acute:Chronic Workload Ratio)** | 7-day load / 28-day rolling avg load | Gauge (0.8–1.3 = green zone) |
| **Training monotony** | mean(daily_load) / stddev(daily_load) per week | Weekly card, red if >1.5 |
| **HR for same pace trend** | Filter all runs in pace band ±15s/km, plot avgHR vs date | Declining HR = fitness |
| **Year-over-year volume heatmap** | Month × Year grid of km totals | Calendar heatmap |
| **Run distribution by weekday** | Group by weekday, count & distance | Bar chart |
| **Longest active streak** | Consecutive days with ≥1 activity | Single stat card |
| **Seiler 80/20 check** | % time in each of 3 zones vs ideal 80/20 | Donut + recommendation |

### Priority: Medium (valuable, slightly more complex)

| Metric | How to Compute | Display |
|---|---|---|
| **PR progression by year** | Best time per distance per calendar year | Multi-line chart |
| **Ramp rate (weekly volume change)** | (this_week - last_week) / last_week × 100 | Warning badge if >10% |
| **Pace distribution histogram** | Bin all run paces in 30s/km buckets | Histogram |
| **Grade-adjusted pace (GAP)** | pace × (1 + elevation_per_km × 0.033) | Show on activity page |
| **Training density** | Activities per week by sport type, 12-month trend | Stacked area chart |
| **Injury gap detector** | Gaps >7 days in running = highlight on calendar | Calendar overlay |
| **Distance specialty profile** | pace_degradation = marathon_pace / 5K_pace | "Sprinter vs endurance" label |

### Priority: Low (nice to have)

| Metric | How to Compute | Display |
|---|---|---|
| **Best race months** | Avg race time by month, normalized to VDOT | Bar chart |
| **Career mileage milestone** | Running total of all km, lifetime | Stat on dashboard |
| **Multi-sport aerobic equivalence** | Skiing km × 0.7 + Running km = aerobic km | On dashboard |
| **Foster training strain** | Weekly total TSS × monotony | Line chart |

---

## 4. File & Folder Structure Reorganisation

### Current State (problems)
```
CLAUDE.md                    ← root level (correct, keep)
FIXES_PLAN.md                ← root level (move to docs/planning/)
IMPLEMENTATION_PLAN.md       ← root level (move to docs/planning/)
README.md                    ← root level (keep)
TESTING_GUIDE.md             ← root level (move to docs/guides/)
GlobalDoc/                   ← non-standard name, merge into docs/
  architecture.md
  documentation-rules.md
  integrations.md
  workflows.md
docs/
  GEMINI_SETUP.md            ← move to docs/integrations/ai-setup.md
  api/
    auth.md, coach.md, planner.md, races.md, strava.md
  schemas/
    ai-context.md
scripts/                     ← many one-off scripts, need cleanup
```

### Target State
```
CLAUDE.md                    ← keep at root (Claude Code requires it)
README.md                    ← keep at root
docs/
  planning/
    MASTER_PLAN.md           ← this file
    IMPLEMENTATION_PLAN.md   ← moved from root
    FIXES_PLAN.md            ← moved from root
    bug-audit-2026-05.md     ← new (see section 5)
  guides/
    workflows.md             ← moved from GlobalDoc/
    testing.md               ← moved from TESTING_GUIDE.md
    documentation-rules.md  ← moved from GlobalDoc/
  architecture/
    overview.md              ← moved from GlobalDoc/architecture.md
    file-structure.md        ← new: describes lib/, app/, components/
  integrations/
    strava.md                ← merged: GlobalDoc/integrations.md + docs/api/strava.md
    garmin.md                ← new
    ai-setup.md              ← moved from docs/GEMINI_SETUP.md
  api/
    auth.md, coach.md, planner.md, races.md  ← keep, update
  schemas/
    ai-context.md            ← keep
  fitness/
    vo2max-model.md          ← new: research + implementation notes
    hr-zones-model.md        ← new: zone estimation research
    analytics-roadmap.md     ← new: metrics to build (section 3 above)
```

---

## 5. Full Bug Audit

### BUG-01: AI coach returns no response (critical)
**Symptom**: User sends message, gets no reply or spinner spins forever.  
**Root cause candidates** (in order of likelihood):
1. **API key missing or wrong**: `aiSettings.geminiApiKey` is encrypted — if `AUTH_SECRET` changed, `safeDecrypt()` returns `null`. The check `if (!apiKey)` returns 400, but the ChatInterface only shows "Error: ..." for SSE error events, not for non-OK responses without a body.
   - **Fix**: In `ChatInterface.tsx` line 59–70: `if (!res.ok || !res.body)` correctly catches this, but the error message parsing `await res.json()` might fail if the response body was already consumed or is not JSON. Add `.catch(() => ({ error: "Request failed" }))`.
   - Actually looking at the code again — line 60: `const err = await res.json().catch(() => ({ error: "Request failed" }))` — this IS protected. But `err.error === "budget_exceeded"` and `err.error === "no_api_key"` are checked. If it's a different error, `errMsg = "Unknown error"`.
   
2. **SSE parsing bug**: The streaming parser splits on `"\n\n"` and processes lines starting with `"data: "`. If the server sends a chunk that doesn't split cleanly at `\n\n` boundaries (partial chunks from the reader), lines can get corrupted. Specifically `buffer.split("\n\n")` and `buffer = lines.pop() ?? ""` could drop the last partial event.
   - Actually this pattern is correct — it keeps the partial event in `buffer` for the next read. No bug here.

3. **Gemini model name wrong**: Line 139 uses `"gemini-2.0-flash"`. If Gemini has deprecated this model or requires a different name, the API call fails silently inside the SSE stream, and the error is caught by the `catch(err)` at line 163 and sent as `{ error: msg }`. The ChatInterface displays this as `"Error: <message>"`.
   - **Check**: Is `gemini-2.0-flash` still the correct model ID?
   - The correct model ID as of 2026 is `gemini-2.0-flash` — but verify this against the Google AI API docs. Some regions require `gemini-2.0-flash-001`.

4. **Provider defaulting to Gemini when Claude was expected**: Line 35: `const provider = aiSettings?.provider ?? "gemini"`. If `aiSettings` is null (no settings row), provider defaults to Gemini. If user configured Claude but `aiSettings` isn't loaded, wrong provider → no key → 400.

5. **Context builder timing out**: `buildCoachContext()` loads 5 years of activities + planned workouts. If this is slow and Vercel/Node has a timeout, the request could die mid-stream. On self-hosted Apache this is less likely.

**Immediate fixes needed**:
- Add explicit error logging in the stream start (server-side) to surface the actual error
- Verify Gemini model name in `route.ts` line 139
- Test with minimal prompt to isolate whether it's auth, model, or streaming

---

### BUG-02: VO2max inconsistency between Statistics page and "Estimate Zones" button

**Root cause**: Three separate code paths compute VO2max, each with different inputs:

| Path | File | Race PBs? | maxHR source |
|---|---|---|---|
| Stats page render | `stats/page.tsx` | ✅ yes (after our fix) | Profile → race-based → threshold → percentile |
| "Estimate zones" button | `cache.ts` → `updateHRZones()` | ✅ yes (after our fix) | Profile → threshold → percentile (no race-based!) |
| AI Coach context | `context-builder.ts` | ❌ NO | Profile → percentile only |

**Fixes needed**:
1. `context-builder.ts:78` — `estimateVO2max()` called without `racePBs`. Add race PBs query here.
2. `cache.ts:updateHRZones()` — maxHR estimation uses `estimateMaxHRFromThreshold()` but NOT `estimateMaxHRFromRaces()`. The stats page uses races as highest priority. Make consistent.
3. Align maxHR estimation priority everywhere: `profile.maxHeartRate > race-based > threshold > percentile`.

---

### BUG-03: AI "Estimate zones" button doesn't use AI to set zone values

**Current behaviour**: `calibrate/route.ts` with `mode=ai` runs the algorithmic estimation, then sends a 300-token prompt asking AI for a 2–3 sentence comment. The comment is shown to the user but zone values are NOT changed by AI.  
**Expected behaviour**: AI analyses data and returns specific zone boundaries; app applies them.

**Fix**: Complete redesign of the AI calibration flow (see §6B).

---

### BUG-04: Race Records — "Import from Strava" creates records that distort PB tracking

**Current behaviour**: The `PUT /api/races` endpoint imports ALL `isRace=true` running activities from Strava, including orienteering races and trail runs with non-standard distances.  
**Expected behaviour**: No automatic import at all. User manually logs PBs.

**Fix**: Remove `PUT` handler from `app/api/races/route.ts`, remove "Import from Strava" button from `races-client.tsx`. Replace with manual-only flow (see §6A).

---

### BUG-05: Splits chart missing on many activities

**Symptom**: Activity detail page may not show splits chart for older activities.  
**Root cause**: `splitsMetric` is NULL in DB for activities fetched via Strava paginated sync (`/athlete/activities`). Only activities fetched individually via `/activities/{id}` contain splits.  
**Effect**: `SplitsChart` receives empty `splits` prop and returns null.  
**Fix**: The splits chart component is correct. The data pipeline needs to batch-fetch individual activities to populate `splitsMetric`. Until then, show a message "Sync individual activity to see splits" rather than silently showing nothing. (Long-term fix: see §6D.)

---

### BUG-06: Dashboard ATL/CTL/TSB computation is wrong

In `dashboard/page.tsx` lines 69–76:
```typescript
for (const a of recentActivities) {
  const key = format(new Date(), "yyyy-MM-dd"); // BUG: always uses TODAY
  ...
  tssMap.set(format(new Date(), "yyyy-MM-dd"), ...); // BUG: accumulates ALL TSS on today
}
```
Every activity's TSS is assigned to TODAY's date, not the activity's actual date. The TSS map ends up with one entry (today) containing the sum of all recent activities' TSS. `buildLoadCurve()` then produces a single spike on today.  
**Fix**: Use `format(a.startDate, "yyyy-MM-dd")` not `format(new Date(), "yyyy-MM-dd")`.

---

### BUG-07: Race prediction shows only VDOT-based times, no Riegel

The stats page shows only Daniels VDOT predictions. For marathon predictions from 5K, VDOT can be 10+ minutes off.  
**Fix**: Add Riegel formula predictions alongside VDOT; show both with a note on which is more reliable for each distance.

---

### BUG-08: `context-builder.ts` — `estimateVO2max()` called without `splitsMetric` or `startDate`

Line 79–83:
```typescript
const vo2maxResult = estimateVO2max(
  (activities as Act[]).map(a => ({
    distanceM: a.distance, timeSec: a.movingTime,
    avgHR: a.averageHeartrate, isRace: a.isRace, sportType: a.sportType,
  })),
  maxHR, restHR, // no racePBs!
);
```
Missing: `name` (needed for `looksLikeRace()`), `startDate` (needed for recency weighting), `racePBs`.  
**Fix**: Add these fields and fetch race PBs.

---

### BUG-09: `stats/page.tsx` — activities window is only 730 days (2 years)

VO2max estimation should look at 5 years (as done in `cache.ts`). Using only 2 years may miss old-but-relevant race PBs or limit the regression data.  
**Fix**: Extend to `subDays(new Date(), 5 * 365)`, same as `cache.ts`.

---

### BUG-10: Edit button missing from race records

User can delete a record but cannot edit time, date, or event name after creating it.  
**Fix**: Add Edit modal (same structure as Add modal, pre-populated).

---

## 6. Implementation Plans

---

### 6A. PB Logging Rebuild — Manual Only

**Philosophy**: The user decides what counts as a PB. No automatic imports. Clean slate.

**New schema fields** (no schema change needed — existing fields are sufficient):
- `distance`: string label (e.g., "5K", "Midnattsloppet 10K")
- `distanceM`: float (exact meters)
- `time`: int (seconds)
- `date`: Date
- `eventName`: string (race name)
- `stravaActivityId`: optional link to an activity (for jumping to it)
- `notes`: optional
- `isManual`: always true going forward

**UI changes** (`races-client.tsx`):
1. Remove "Import from Strava" button
2. Remove `importFromStrava()` function
3. Keep "Add manually" button as primary action
4. Add "Edit" button (pencil icon) per row — opens pre-filled modal
5. Add `stravaActivityId` picker: when adding/editing a record, show a searchable dropdown of activities from ±3 days of the race date. User can link the record to a specific activity for context.
6. Add "Custom distance" support (already partially implemented)
7. Keep the distance filter sidebar and PB chart

**Add/Edit modal enhancements**:
- Add activity linking: "Link to Strava activity" — fetches activities within ±3 days of selected date, shows a dropdown
- Better time input: prevent submitting if hh/mm/ss are all empty

**API changes** (`app/api/races/route.ts`):
1. Remove `PUT` handler entirely
2. Add `PATCH /api/races/[id]` endpoint (currently only has DELETE)
3. Add field validation that `distanceM > 0` and `time > 60` (sanity checks)

**Distances to track** (predefined + custom):
```
400m, 800m, 1000m, 1500m, Mile (1609m), 2000m, 3000m, 5K, 10K, 15K, Half Marathon, Marathon
+ Custom (user defines label + meters)
```

**Timeline visualisation**: Keep existing Recharts LineChart. Add:
- Dots coloured by whether it was a PB at time of running (gold = PB, grey = not)
- Hover shows event name, link to activity if linked

---

### 6B. AI Zone Estimation — Real Prompt → Zone Values

**New flow**:
1. User clicks "AI estimate" button
2. App calls `POST /api/coach/calibrate?mode=ai`
3. Server runs algorithmic estimation first (for baseline numbers)
4. Server builds a detailed prompt including:
   - All race PBs (from RaceRecord)
   - 30 most recent hard sessions (avgHR > 75% maxHR) in last 90 days
   - Observed maxHR (highest in races)
   - Resting HR (from Garmin or profile)
   - Algorithmic estimates as "initial suggestion to validate or correct"
5. AI returns **structured JSON** with zone boundaries
6. Server validates JSON (range checks: HR must be 100–210, zones must be ascending)
7. Server applies the zones to FitnessCache and AthleteProfile
8. Returns updated zones + AI reasoning text

**Prompt template** (in `lib/ai/prompts.ts`):
```
You are a sports scientist estimating heart rate training zones for a runner.

Athlete data:
- Race PBs: {5K: 18:25 (2025-04-15), 10K: 38:45 (2024-10-20), HM: 1:27:30 (2024-09-01)}
- Observed max HR: 192 bpm (in 5K race 2025-04-15)
- Resting HR: 47 bpm (7-day average)
- Age: 28, Sex: male
- Training volume: avg 65 km/week (last 12 weeks)

Recent hard sessions (last 90 days, avgHR > 75% maxHR):
[list of up to 20 sessions with: date, type, distance, avgHR, avgPace]

Algorithm's initial estimates (validate or correct these):
- LT1 HR: 151 bpm  LT1 pace: 4:52/km
- LT2 HR: 166 bpm  LT2 pace: 4:18/km
- Max HR: 192 bpm

Using the physiological evidence above, estimate the 5 training zones.
LT1 is the aerobic threshold (~2 mmol/L lactate, first ventilatory threshold).
LT2 is the anaerobic threshold (~4 mmol/L lactate, second ventilatory threshold).

Return ONLY this JSON (no other text):
{
  "max_hr": 192,
  "lt1_hr": 151,
  "lt2_hr": 166,
  "zones": {
    "z1": [restHR, lt1_hr - 8],
    "z2": [lt1_hr - 8, lt1_hr],
    "z3": [lt1_hr, lt2_hr],
    "z4": [lt2_hr, lt2_hr + 7],
    "z5": [lt2_hr + 7, max_hr]
  },
  "reasoning": "2-3 sentence explanation"
}
```

**Server-side validation**:
```typescript
function validateZoneJson(json: unknown): ZoneEstimate | null {
  // Must have: max_hr (140–220), lt1_hr, lt2_hr, zones (z1–z5)
  // Each zone must be [lo, hi] with lo < hi
  // lt1_hr < lt2_hr < max_hr
  // All values must be physiologically plausible
}
```

---

### 6C. HR Zone Model — Data-Driven from Large Dataset

**New `estimateZonesFromData()` function** in `lib/fitness/zones.ts`:

```typescript
export function estimateZonesFromData(
  activities: ActivitySample[],
  racePBs: RacePB[],
  maxHR: number,
  restHR: number,
): { lt1HR: number; lt2HR: number; lt1Pace: number; lt2Pace: number } {

  // Step 1: Compute LT2 from best available race PB
  // Priority: HM > 10K > 5K
  const lt2Pace = computeLT2PaceFromPBs(racePBs);

  // Step 2: Compute LT1 pace (≈ LT2 + 45–60 sec/km for trained runners)
  const lt1Pace = lt2Pace ? lt2Pace + 50 : null;

  // Step 3: Convert pace → HR using regression
  const regression = buildHRPaceRegression(activities, maxHR);
  const lt2HR = regression && lt2Pace
    ? paceToHR(lt2Pace, regression)
    : Math.round(maxHR * 0.88); // fallback
  const lt1HR = regression && lt1Pace
    ? paceToHR(lt1Pace, regression)
    : Math.round(maxHR * 0.78); // fallback

  return { lt1HR, lt2HR, lt1Pace: lt1Pace ?? 0, lt2Pace: lt2Pace ?? 0 };
}
```

**`computeLT2PaceFromPBs()`**:
```
HM PB → LT2 pace = HM_pace (direct)
10K PB → LT2 pace = 10K_pace × 1.065
5K PB  → LT2 pace = 5K_pace × 1.135
```

**`buildHRPaceRegression()`**:
- Filter activities: HR in 65–92% maxHR, distance ≥ 4km, exclude interval keywords
- Apply exponential recency weighting (180-day half-life)
- Weighted least squares: VO2 = a·HR + b
- Returns { slope, intercept }

**`paceToHR()`**:
- VO2 at LT2 pace = Daniels formula at that speed
- HR = (VO2 - intercept) / slope

---

### 6D. Splits Visualisation Fix

**Current state**: `SplitsChart` component exists and is correct. Problem is data.

**Two-part fix**:

**Part 1 — Data pipeline**: When a user opens an activity detail page (`app/(dashboard)/activities/[id]/page.tsx`), if `splitsMetric` is NULL:
- Trigger a background fetch of the individual Strava activity via `/api/activities/[id]/streams`
- Store the result in the DB (update `splitsMetric`)
- Show a loading indicator while fetching

**Part 2 — UI fix for wide bars / small gap**:

The user's requirement: "breda staplar, ytterst litet mellanrum, bredden representerar tid, höjden representerar tempo, skalor dynamiska."

Current `splits-chart.tsx` uses `gap: "1px"` between bars. The bar heights use a `30 + (maxPace - pace) / paceRange * 70` formula — this is correct (faster = taller). The width is `moving_time / totalTime * 100%` — correct.

Issues to fix in the chart:
1. Remove the static `chartWidth = 600` reference (unused but confusing)
2. Make `chartHeight` responsive (currently fixed 80px — too small for reading)
3. Ensure the dynamic scale uses the ACTUAL min/max pace of THIS activity, not a global scale
4. Add pace labels on Y axis (leftmost bar shows pace, not just on hover)
5. Average pace dashed line is computed as `30 + 35 = 65%` height — this is the midpoint of the scale, but only correct if avgPace is exactly at the midpoint of min/max. Fix to compute actual position.

**Fixed avg-pace line height**:
```typescript
// Current (wrong if avgPace != midpoint):
style={{ bottom: 6 + chartHeight * (30 + 35) / 100 }}

// Correct:
const avgHeightPct = 30 + ((maxPace - avgSecPerKm) / paceRange) * 70;
style={{ bottom: 6 + chartHeight * (avgHeightPct / 100) }}
```

---

## 7. Commit Strategy

All changes above should be committed in separate, focused PRs/commits:

1. `fix: bug-06 dashboard TSS date assignment` (one-liner, immediate)
2. `fix: bug-08 context-builder missing name/date/racePBs in VO2max` (small)
3. `fix: bug-02 align maxHR estimation priority across all paths` (medium)
4. `feat: 6A races manual-only PB logging with edit + activity link` (large)
5. `feat: 6B AI zone estimation returns structured zone values` (medium)
6. `feat: 6C data-driven LT1/LT2 from race PBs + regression` (medium)
7. `fix: 6D splits chart avg-pace line + height fix` (small)
8. `docs: reorganise MD files into docs/ subdirectory` (rename only)
