import { prisma } from "@/lib/db/prisma";
import { stravaFetch } from "./client";

const PER_WINDOW     = 170;       // under Strava 200 req/15-min limit
const WINDOW_MS      = 15 * 60_000;
const BETWEEN_REQ_MS = 350;

export type BackfillEvent =
  | { type: "start";       total: number }
  | { type: "progress";    done: number; total: number; errors: number }
  | { type: "rate_limit";  done: number; total: number; errors: number; waitMs: number }
  | { type: "daily_limit"; done: number; total: number; errors: number }
  | { type: "done";        done: number; total: number; errors: number };

export interface BackfillResult {
  done: number;
  total: number;
  errors: number;
  stoppedAt: "complete" | "daily_limit";
}

/**
 * Fetch individual Strava activity detail for every activity not yet fully
 * fetched (splitDetailFetched = false). Respects the 15-minute rate-limit
 * window and stops on daily limit. Safe to re-run — resumes from where it
 * left off.
 *
 * @param onProgress  Optional callback for streaming progress (used by SSE endpoint).
 */
export async function runHistoricalBackfill(
  userId: string,
  onProgress?: (event: BackfillEvent) => void,
): Promise<BackfillResult> {
  const pending = await prisma.activity.findMany({
    where:   { userId, splitDetailFetched: false },
    orderBy: { startDate: "asc" },
    select:  { id: true, stravaId: true, name: true },
  });

  const total = pending.length;
  onProgress?.({ type: "start", total });

  let done = 0, errors = 0;
  let windowStart  = Date.now();
  let windowCount  = 0;

  for (const act of pending) {
    if (windowCount >= PER_WINDOW) {
      const elapsed = Date.now() - windowStart;
      const waitMs  = Math.max(0, WINDOW_MS - elapsed + 5_000);
      onProgress?.({ type: "rate_limit", done, total, errors, waitMs });
      await new Promise(r => setTimeout(r, waitMs));
      windowStart = Date.now();
      windowCount = 0;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const full: any = await stravaFetch(userId, `/activities/${act.stravaId}`);

      await prisma.activity.update({
        where: { id: act.id },
        data: {
          name:                 full.name                   ?? undefined,
          description:          full.description            ?? null,
          averageHeartrate:     full.average_heartrate      ?? null,
          maxHeartrate:         full.max_heartrate          ?? null,
          averageSpeed:         full.average_speed          ?? undefined,
          averageCadence:       full.average_cadence        ?? null,
          averageWatts:         full.average_watts          ?? null,
          weightedAverageWatts: full.weighted_average_watts ?? null,
          totalElevationGain:   full.total_elevation_gain   ?? undefined,
          mapPolyline:          full.map?.summary_polyline  ?? null,
          workoutType:          full.workout_type           ?? null,
          isRace:               full.workout_type === 1,
          sufferScore:          full.suffer_score           ?? null,
          perceivedExertion:    full.perceived_exertion     ?? null,
          splitsMetric:         full.splits_metric          || undefined,
          bestEfforts:          full.best_efforts           || undefined,
          laps:                 full.laps                   || undefined,
          splitDetailFetched:   true,
        },
      });

      done++;
      windowCount++;
      if (done % 10 === 0 || done === total) {
        onProgress?.({ type: "progress", done, total, errors });
      }

      await new Promise(r => setTimeout(r, BETWEEN_REQ_MS));
    } catch (e) {
      if (e instanceof Error && e.message === "STRAVA_RATE_LIMIT") {
        onProgress?.({ type: "daily_limit", done, total, errors });
        return { done, total, errors, stoppedAt: "daily_limit" };
      }
      errors++;
      windowCount++;
      console.error(`[backfill] ${act.stravaId} (${act.name}):`, e);
      await new Promise(r => setTimeout(r, 1_000));
    }
  }

  onProgress?.({ type: "done", done, total, errors });
  return { done, total, errors, stoppedAt: "complete" };
}
