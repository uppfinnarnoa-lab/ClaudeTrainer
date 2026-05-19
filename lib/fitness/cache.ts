/**
 * Fitness metrics cache — two separate update paths:
 *
 * AUTO (after every Strava sync):
 *   updateVO2maxAndPaces() — VO2max, VDOT, pace zones
 *   These use broad data and update continuously.
 *
 * MANUAL (button press only):
 *   updateHRZones() — maxHR, restHR, thresholdHR, HR zones
 *   HR zones should only change when explicitly recalibrated.
 */

import { prisma } from "@/lib/db/prisma";
import { buildHRZones, buildHRZonesFromLT, buildPaceZones, estimateMaxHR, estimateMaxHRFromThreshold, estimateMaxHRFromRaces, estimateLTFromRaces } from "./zones";
import { estimateVO2max, buildHRPaceRegressionParams, type RacePB } from "./vo2max";
import { subDays } from "date-fns";

type Act = {
  sportType: string; name: string; distance: number; movingTime: number;
  averageHeartrate: number | null; maxHeartrate: number | null;
  averageSpeed: number | null; isRace: boolean; bestEfforts: unknown;
};

async function loadActivities(userId: string) {
  return prisma.activity.findMany({
    where: { userId, startDate: { gte: subDays(new Date(), 5 * 365) } },
    select: {
      sportType: true, name: true, distance: true, movingTime: true,
      averageHeartrate: true, maxHeartrate: true,
      averageSpeed: true, isRace: true, bestEfforts: true,
    },
  });
}

async function loadRacePBs(userId: string): Promise<RacePB[]> {
  const records = await prisma.raceRecord.findMany({
    where: { userId, date: { gte: subDays(new Date(), 5 * 365) } },
    select: { distanceM: true, time: true, date: true },
    orderBy: { time: "asc" },
  });
  const bestPerDist = new Map<number, RacePB>();
  for (const r of records) {
    const d = Math.round(r.distanceM);
    if (!bestPerDist.has(d) || bestPerDist.get(d)!.timeSec > r.time) {
      bestPerDist.set(d, { distanceM: r.distanceM, timeSec: r.time, date: r.date });
    }
  }
  return [...bestPerDist.values()];
}

// ── AUTO path: VO2max + paces (runs after every sync) ─────────────────────
export async function updateVO2maxAndPaces(userId: string) {
  const [profile, activities, garminRecent, existingCache, racePBs] = await Promise.all([
    prisma.athleteProfile.findUnique({ where: { userId } }),
    loadActivities(userId),
    prisma.garminDailySummary.findMany({
      where: { userId, date: { gte: subDays(new Date(), 7) } },
      orderBy: { date: "asc" }, select: { restingHR: true },
    }),
    prisma.fitnessCache.findUnique({ where: { userId } }),
    loadRacePBs(userId),
  ]);

  // Use stored HR zones if they exist (don't recompute on auto-update)
  const maxHR   = profile?.maxHeartRate    ?? existingCache?.maxHR    ?? 190;
  const restHR  = profile?.restingHeartRate ?? garminRecent.at(-1)?.restingHR ?? existingCache?.restHR ?? 50;

  const vo2maxResult = estimateVO2max(
    (activities as Act[]).map(a => ({
      distanceM: a.distance, timeSec: a.movingTime,
      avgHR: a.averageHeartrate, isRace: a.isRace,
      sportType: a.sportType, name: a.name, bestEfforts: a.bestEfforts,
    })),
    maxHR, restHR, racePBs,
  );

  const paceZones = buildPaceZones(vo2maxResult.vdot);

  // Keep existing HR zones if they exist — only update VO2max + paces
  const existingZones = (existingCache?.zones as object | null) ?? buildHRZonesJson(maxHR, restHR);

  await prisma.fitnessCache.upsert({
    where: { userId },
    create: {
      userId,
      vo2max:     vo2maxResult.value,
      vdot:       vo2maxResult.vdot,
      confidence: vo2maxResult.confidence,
      method:     vo2maxResult.method,
      maxHR, restHR,
      thresholdHR: existingCache?.thresholdHR ?? Math.round(maxHR * 0.88),
      zones: existingZones,
      paces: pacesJson(paceZones),
    },
    update: {
      vo2max:     vo2maxResult.value,
      vdot:       vo2maxResult.vdot,
      confidence: vo2maxResult.confidence,
      method:     vo2maxResult.method,
      // DO NOT update maxHR/restHR/thresholdHR/zones here — only on button press
      paces: pacesJson(paceZones),
    },
  });

  return { vo2max: vo2maxResult.value, vdot: vo2maxResult.vdot };
}

// ── MANUAL path: HR zones (button press only) ─────────────────────────────
export async function updateHRZones(userId: string) {
  const [profile, activities, garminRecent] = await Promise.all([
    prisma.athleteProfile.findUnique({ where: { userId } }),
    loadActivities(userId),
    prisma.garminDailySummary.findMany({
      where: { userId, date: { gte: subDays(new Date(), 7) } },
      orderBy: { date: "asc" }, select: { restingHR: true },
    }),
  ]);

  const maxHRs = (activities as Act[]).flatMap(a => a.maxHeartrate ? [a.maxHeartrate] : []);
  const observedMax = maxHRs.length > 0 ? Math.max(...maxHRs) : 200;
  const raceMaxHRs = (activities as Act[])
    .filter(a => a.isRace || /tävl|race|lopp|mila|stafett|sic\b|parkrun/i.test(a.name ?? ""))
    .flatMap(a => a.maxHeartrate ? [a.maxHeartrate] : []);
  const thresholdHRs = (activities as Act[])
    .filter(a => a.averageHeartrate && a.averageHeartrate > observedMax * 0.82
      && a.sportType.toLowerCase().includes("run"))
    .map(a => a.averageHeartrate!);

  const maxHR = profile?.maxHeartRate
    ?? estimateMaxHRFromRaces(raceMaxHRs)
    ?? estimateMaxHRFromThreshold(thresholdHRs)
    ?? estimateMaxHR(maxHRs);
  const restHR = profile?.restingHeartRate
    ?? garminRecent.at(-1)?.restingHR
    ?? 50;

  const racePBs = await loadRacePBs(userId);

  // Build HR-pace regression params for pace→HR conversion in LT estimation
  const regressionRuns = (activities as Act[])
    .filter(a => a.averageHeartrate && a.distance >= 3000 && a.movingTime > 0
      && /run|trail/i.test(a.sportType)
      && !/intervall|interval|fartlek|tisdagsbana|bana\b/i.test(a.name ?? ""))
    .map(a => ({
      avgHR: a.averageHeartrate!,
      avgPaceSecPerKm: a.movingTime / (a.distance / 1000),
    }));
  const regression = buildHRPaceRegressionParams(regressionRuns, maxHR);

  // Estimate LT1/LT2 from race PBs + regression for data-driven zones
  const lt = estimateLTFromRaces(racePBs, maxHR, restHR, regression);
  const hrZones = lt.source === "race-pbs"
    ? buildHRZonesFromLT(lt, maxHR, restHR)
    : buildHRZones(maxHR, restHR);
  const thresholdHR = Math.round((hrZones.z4[0] + hrZones.z4[1]) / 2);

  const zonesJson = {
    z1: hrZones.z1, z2: hrZones.z2, z3: hrZones.z3, z4: hrZones.z4, z5: hrZones.z5,
  };

  // Also recompute VO2max with the updated maxHR
  const vo2maxResult = estimateVO2max(
    (activities as Act[]).map(a => ({
      distanceM: a.distance, timeSec: a.movingTime,
      avgHR: a.averageHeartrate, isRace: a.isRace,
      sportType: a.sportType, name: a.name, bestEfforts: a.bestEfforts,
    })),
    maxHR, restHR, racePBs,
  );
  const paceZones = buildPaceZones(vo2maxResult.vdot);

  await prisma.fitnessCache.upsert({
    where: { userId },
    create: {
      userId, maxHR, restHR, thresholdHR, zones: zonesJson,
      vo2max: vo2maxResult.value, vdot: vo2maxResult.vdot,
      confidence: vo2maxResult.confidence, method: vo2maxResult.method,
      paces: pacesJson(paceZones),
    },
    update: { maxHR, restHR, thresholdHR, zones: zonesJson,
      vo2max: vo2maxResult.value, vdot: vo2maxResult.vdot,
      confidence: vo2maxResult.confidence, method: vo2maxResult.method,
      paces: pacesJson(paceZones),
    },
  });

  // Persist maxHR + restHR to AthleteProfile so stats page picks them up
  await prisma.athleteProfile.upsert({
    where: { userId },
    create: { userId, maxHeartRate: maxHR, restingHeartRate: restHR },
    update: { maxHeartRate: maxHR, restingHeartRate: restHR },
  });

  return { maxHR, restHR, thresholdHR, zones: zonesJson, vo2max: vo2maxResult.value, vdot: vo2maxResult.vdot };
}

// ── Backwards-compat wrapper (called by calibrate route) ──────────────────
export async function computeAndCacheFitness(userId: string) {
  return updateHRZones(userId);
}

export async function getFitnessCache(userId: string) {
  return prisma.fitnessCache.findUnique({ where: { userId } });
}

// ── Helpers ───────────────────────────────────────────────────────────────
function buildHRZonesJson(maxHR: number, restHR: number) {
  const z = buildHRZones(maxHR, restHR);
  return { z1: z.z1, z2: z.z2, z3: z.z3, z4: z.z4, z5: z.z5 };
}

function pacesJson(p: ReturnType<typeof buildPaceZones>) {
  return { easy: p.easy, marathon: p.marathon, threshold: p.threshold, interval: p.interval, repetition: p.repetition };
}
