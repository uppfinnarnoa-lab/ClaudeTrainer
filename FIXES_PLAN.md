# TrainingLab — Fixes & Improvements Plan

> Prioritized implementation backlog based on current app state (2026-05-19).

---

## 1. Dashboard broken — stats show "—" despite 2,810 synced activities

**Symptom:** "This week / This month / Year to date" cards all show `—` and "Sync Strava to see data" even though Activities Synced = 2,810.

**Root cause (suspected):** The `app/(dashboard)/dashboard/page.tsx` queries use `prisma.activity.count({ where: { userId } })` for the total (works), but `prisma.activity.findMany({ where: { userId, startDate: { gte: weekStart } } })` for period stats. The `startDate` field may be stored in UTC midnight, which in Sweden (UTC+2) shifts the date — same timezone bug as the planner. The `startOfWeek()` in `date-fns` also defaults to Sunday — needs `{ weekStartsOn: 1 }`.

**Fix:**
- Audit `dashboard/page.tsx` date comparisons — use `startOfWeek(now, { weekStartsOn: 1 })` consistently
- Ensure `startDate` comparisons account for UTC offset (compare date strings, not Date objects directly)
- Add console logging to verify counts during development
- Replace "—" with actual aggregated data

**Files:** `app/(dashboard)/dashboard/page.tsx`

---

## 2. Activity detail page — full Strava-style view

**Current state:** Activity list at `/activities` shows cards. Clicking does nothing.

**Desired:** Click any activity → `/activities/[id]` with full detail:
- **Header:** Name, date, sport badge, race flag if applicable
- **Stats bar:** Distance, moving time, pace/speed, elevation gain, calories
- **Description/Notes:** Full Strava description text (already stored in DB)
- **HR metrics:** Avg HR, max HR, HR zone distribution chart (pie or bar)
- **Pace chart:** Per-km/lap pace as bar chart, with HR overlay
- **GPS map:** Render polyline on a map (use Leaflet.js — free, no API key needed)
- **Splits table:** Per-km splits with pace, HR, elevation
- **Best efforts:** Strava-reported PRs for this activity (stored in `bestEfforts` JSON)
- **Weather badge:** Temp + conditions if available
- **Laps:** If the activity has laps (intervals), show them in a table

**New files:**
- `app/(dashboard)/activities/[id]/page.tsx` — server component, fetches full activity
- `app/(dashboard)/activities/[id]/activity-detail.tsx` — client component for charts/map
- `components/charts/PaceChart.tsx` — per-km pace bar chart
- `components/charts/MapView.tsx` — Leaflet polyline map (lazy-loaded, client-only)

**New dependency:** `leaflet` + `react-leaflet` for the map

**Fetch strategy:** Basic activity fields already in DB. Activity streams (per-second GPS/HR/pace) are fetched on-demand from Strava API and cached on first load.

---

## 3. Weekly volume chart — sport filter (All / Running only)

**Current state:** Chart shows all sports stacked. No filter.

**Desired:** Toggle buttons above the chart:
- **All sports** (default) — stacked bars as now
- **Running only** — single colour bar, higher detail
- **Custom** — multi-select sport chips

**Fix:** Add `sportFilter` state to `StatsClient`. Pass filtered `weeklyVolumes` to `WeeklyVolumeChart`.

**Files:** `app/(dashboard)/stats/stats-client.tsx`, `components/charts/WeeklyVolumeChart.tsx`

---

## 4. VO2max / pace zones / HR zones — accuracy improvements

**Current state:** VO2max = 48.6 estimated from VDOT formula. CTL = 26 TSS (very low — indicates TSS computation is underestimating). Easy pace 5:18–6:39/km.

**Issues identified:**
1. **CTL too low (26 TSS):** TRIMP formula likely underestimates because `restHR` defaults to 50 and `maxHR` is estimated. Without an athlete profile (weight, max HR from Garmin), the HR-ratio is wrong.
2. **VO2max pipeline:** Currently uses 3 methods weighted equally. Race-based VDOT should dominate heavily if recent race data exists.
3. **Pace zones:** Derived from VDOT. If VDOT is accurate (48.6), threshold pace of 4:28–4:44 is roughly correct for a 48.6 athlete. But the zones may need the user to confirm/override.

**Confirmed bug — VDOT dramatically underestimated (48.6 vs real ~57–58):**

User runs sub-18:30 on 5K repeatedly in 2025–2026. VDOT 48.6 corresponds to ~20:00 5K. Gap = ~10 VDOT units = massive.

**Root cause:** `estimateVO2max()` filters races as:
```typescript
.filter(a => a.isRace && a.sportType.toLowerCase().includes("run") && a.distanceM >= 1500)
```
`isRace` is only `true` when Strava `workout_type === 1` (explicitly marked as race). Most fast efforts (Tisdagsbana, parkrun, time trials) are logged as normal runs → `isRace = false` → missed entirely.

**Correct VDOT for sub-18:30 5K:**
- 18:00 → VDOT ≈ 57.8 (threshold pace ~3:55/km, easy ~5:00–5:50/km)
- 18:30 → VDOT ≈ 56.2 (threshold pace ~4:00/km, easy ~5:05–5:58/km)

**Fixes required:**
1. **Best-effort extraction:** Use Strava's `best_efforts` JSON stored per activity — this contains per-distance PRs (1km, 5km, 10km etc.) regardless of race flag. Find the fastest 5K best effort from last 12 months → use for VDOT.
2. **Remove `isRace` filter for VDOT:** Look at all runs ≥ 4.5 km and find the one with the best pace-effort ratio (shortest time for distance 4.5–7 km = 5K proxy).
3. **Description keyword scan:** Activities with "lopp", "tävling", "TT", "time trial", "parkrun", "5k" in name treated as race efforts.
4. **Manual VDOT override:** Add a field in Settings → Athlete Profile: "My recent 5K PB" (time input) → compute VDOT from that directly → overrides all auto-estimates.
5. **Fallback to submaximal regression:** If VDOT from best efforts < 50 but submaximal HR method gives > 55, flag discrepancy and prompt user to enter race time.

**Fixes:**
- Prompt user to fill in Athlete Profile (max HR, resting HR, weight, recent 5K PB)
- Add "Calibration" section in Settings with current vs expected estimates
- Allow manual override of: max HR, VDOT/VO2max, threshold pace
- Store overrides in `AthleteProfile` and use in all fitness calculations
- Increase VDOT race-method weight to 0.85 and broaden race detection

**Files:** `lib/fitness/vo2max.ts`, `lib/fitness/training-load.ts`, `lib/fitness/zones.ts`, `prisma/schema.prisma` (add `recentFiveKTimeSec` to AthleteProfile)

---

## 5. AI-powered HR zone re-estimation

**Desired:** A button "Re-estimate zones with AI" in the Statistics → Zones tab (and Settings → Athlete Profile). When clicked:
1. Sends last 5 years of activities + current profile to AI coach
2. AI analyzes HR distribution, compares against known race efforts, estimates lactate threshold HR and max HR
3. AI returns structured JSON: `{ maxHR: 194, restHR: 42, thresholdHR: 175, zones: [z1, z2, z3, z4, z5] }`
4. User sees the AI's reasoning + suggested zones
5. User clicks "Apply" → saved to `AthleteProfile`
6. All stats pages re-compute with new zones (CTL, HR zone distribution, pace zones, VO2max all update)

**Implementation:**
- New API route: `POST /api/coach/calibrate` — runs AI calibration and returns structured zone estimates
- New component: `ZoneCalibrationPanel` — shows current vs AI-estimated zones, apply button
- AI prompt: structured analysis of max observed HR, HR at known race paces, HR drift over long runs (aerobic decoupling)
- After applying: clear stats cache, trigger re-computation

**Files:** `app/api/coach/calibrate/route.ts`, `components/stats/ZoneCalibrationPanel.tsx`

---

## 6. Continuous VO2max / race pace auto-update

**Current state:** VO2max is computed fresh on every stats page load (expensive). No caching or triggered updates.

**Desired:** VO2max, training paces, and race predictions update:
1. **After each Strava sync** — check if new activities improve best efforts → recompute if so
2. **Stored in DB** — not recomputed on every page load
3. **Displayed with "last updated" timestamp** — user knows when estimate was last refreshed

**Implementation:**
- Add `FitnessCache` model to schema: `{ userId, vo2max, vdot, confidence, method, maxHR, restHR, zones, computedAt }`
- After Strava sync, compare new best efforts vs stored → trigger recompute if improved
- Stats page reads from `FitnessCache` (fast) with a "Refresh estimates" button for manual trigger
- Cron job: recompute weekly even if no new sync

**Schema addition:**
```prisma
model FitnessCache {
  id          String   @id @default(cuid())
  userId      String   @unique
  vo2max      Float
  vdot        Float
  confidence  String
  method      String
  maxHR       Int
  restHR      Int
  thresholdHR Int?
  zones       Json     // { z1: [lo,hi], z2: [lo,hi], ... }
  computedAt  DateTime @updatedAt
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

**Files:** `prisma/schema.prisma`, `lib/fitness/cache.ts`, `lib/strava/sync.ts`

---

## Priority order

| # | Feature | Effort | Impact |
|---|---|---|---|
| 1 | Dashboard bug fix | Low | High — visible immediately |
| 2 | Activity detail page | Medium | High — core feature |
| 3 | Fitness cache + auto-update | Medium | High — accuracy + performance |
| 4 | VO2max / zone accuracy | Medium | High — all estimates depend on this |
| 5 | AI zone calibration | Medium | High — unique feature |
| 6 | Weekly volume sport filter | Low | Medium |

---

## 7. HR zone + max HR estimation — broad data method

**Key insight from user:** Max HR cannot reliably be taken from a single highest observed value — HR can be artificially capped by stable pacing or sensor issues. Instead, derive it statistically from **many threshold-type efforts** where more consistent HR data exists.

**Revised estimation algorithm:**

### Step 1 — Find lactate threshold HR (most data-rich)
- Filter activities: `workoutType = "workout"` OR name matches threshold keywords (tröskel, tempo, LT, 4x10, 5x4, lång tröskel, etc.)
- For each such activity: take average HR during the main effort (exclude warm-up/cool-down using HR < 75% of session max)
- Compute **95th percentile** of HR across all threshold efforts → this is threshold HR estimate
- This is more robust than any single max value

### Step 2 — Derive max HR from threshold HR
- `maxHR = thresholdHR / 0.88` (threshold is typically 85–91% of max; use 88% as midpoint)
- Cross-check: take 98th percentile of ALL `maxHeartrate` values across activities → use whichever is higher

### Step 3 — Refine with race data
- All activities marked `isRace=true` OR matching race name keywords
- Take HR in final 20% of each race → typically at/near lactate ceiling
- Use 95th percentile of these values as another estimate of threshold HR
- Weighted average: threshold from workouts (60%) + threshold from races (40%)

### Step 4 — Compute all zones from threshold HR (not max HR)
Using lactate threshold as anchor is more accurate than Karvonen (which requires precise restHR):
- Z1 Recovery: < 80% threshold HR
- Z2 Aerobic:  80–90% threshold HR
- Z3 Tempo:    90–100% threshold HR
- Z4 Threshold: 100–107% threshold HR
- Z5 VO2max:   > 107% threshold HR

### Step 5 — Pace zones — same broad-data approach
- Don't rely only on races: use ALL runs with HR in Z4 range → derive threshold pace from those efforts
- Find 5th percentile pace among all Z4-HR efforts → this is the lower bound of threshold pace
- Build full pace zone table from threshold pace (Daniels method)
- Race times: use `bestEfforts` JSON + all `isRace=true` activities + name-keyword races → find best for each distance → compute VDOT → cross-check

### What the "Estimate HR zones" button does
1. Runs all 5 steps above on last 5 years of data
2. Shows the user: estimated thresholdHR, maxHR, all 5 zones, with confidence score and data points used
3. User can adjust any value before saving
4. Saves to `AthleteProfile` → all stats recompute immediately

### What auto-updates continuously (no button needed)
- VDOT / VO2max — after every sync, if new best effort found
- Race time predictions — derived from VDOT, auto-updates
- Pace zones — derived from VDOT, auto-updates

**Files:** `app/api/coach/calibrate/route.ts`, `lib/fitness/zones.ts`, `lib/fitness/vo2max.ts`

---

## 8. Chat token tracking bug

**Symptom (reported by user):** Token saving in the coach chat appears to not be working correctly.

**Suspected causes to investigate:**
1. `tokensUsed` field on `Message` model stores `inputTokens + outputTokens` but the coach route may be computing this incorrectly when cache hits occur (cache-read tokens shouldn't count as full input tokens for cost)
2. `estimatedCostUsd` may be `null` / `0` instead of the actual computed cost
3. The `AISettings.currentMonthSpendUsd` increment may be failing silently (Prisma upsert creates a new record if `userId` doesn't match)
4. The streaming SSE parsing on the client may drop the final `done` event before the cost data is saved

**Fix approach:**
- Add logging in `app/api/coach/chat/route.ts` to verify token counts are non-zero after each response
- Check that `estimateCost()` returns > 0 for Claude (requires `inputTokens > 0`)
- Verify `AISettings.upsert` succeeds — `where: { userId }` should match existing row
- On client: confirm the `done` event is received and `cost` is parsed before updating UI

**Files:** `app/api/coach/chat/route.ts`, `lib/ai/client.ts`, `components/coach/ChatInterface.tsx`

---

## Priority order (updated)

| # | Feature | Effort | Impact |
|---|---|---|---|
| 1 | **Dashboard bug fix** | Low | High — visible immediately |
| 2 | **VDOT fix** — use `bestEfforts` + broader race detection | Medium | Critical — all estimates wrong |
| 3 | **Max HR auto-estimation** — from activity data, no manual entry | Low | High — fixes CTL/zones/TSS |
| 4 | **Activity detail page** | Medium | High — core missing feature |
| 5 | **Fitness cache + auto-update after sync** | Medium | High — performance |
| 6 | **AI zone calibration button** | Medium | High — unique feature |
| 7 | **Weekly volume sport filter** | Low | Medium |

---

## Notes on current estimates

- **VO2max 48.6 is WRONG.** User runs sub-18:30 on 5K → real VDOT ≈ 57. Root cause: race detection only uses `isRace=true` (Strava `workout_type=1`). Most fast efforts are logged as normal runs. Fix: use `bestEfforts` JSON stored per activity.
- **CTL 26 is WRONG.** Should be 60–90+ for this training volume. Root cause: default `maxHR=190, restHR=50`. With corrected values CTL will jump significantly.
- **Pace zones follow VDOT.** Once VDOT corrects to ~57: threshold ~3:57–4:06/km, easy ~4:58–5:44/km. Currently showing threshold 4:28–4:44 and easy 5:18–6:39 — both ~60–90 sec/km too slow.

*Last updated: 2026-05-19*
