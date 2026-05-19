export {};
/**
 * Extracts sub-distance PBs from longer race activities.
 * E.g. best 5K split from a 10K race, first 5K of a half marathon, etc.
 *
 * Only saves to classic distances. If the best 5K segment during a 10K
 * is faster than any standalone 5K result, it creates a new RaceRecord.
 *
 * Run: SEED_EMAIL=uppfinnarnoa@gmail.com npx tsx scripts/extract-subdistance-pbs.ts
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const CLASSIC_DISTANCES = [
  { label: "800m",          m: 800 },
  { label: "1500m",         m: 1500 },
  { label: "Mile",          m: 1609 },
  { label: "3K",            m: 3000 },
  { label: "5K",            m: 5000 },
  { label: "10K",           m: 10000 },
  { label: "15K",           m: 15000 },
  { label: "Half Marathon", m: 21097 },
  { label: "Marathon",      m: 42195 },
];

interface Split {
  distance: number;
  moving_time: number;
  average_speed: number;
  split: number;
}

function bestNkmTime(splits: Split[], targetM: number): { timeSec: number; startKm: number } | null {
  // Number of full km splits needed
  const n = Math.round(targetM / 1000);
  const valid = splits.filter(s => s.moving_time > 0 && s.distance > 500);
  if (valid.length < n) return null;

  let best: { timeSec: number; startKm: number } | null = null;
  for (let i = 0; i <= valid.length - n; i++) {
    const seg = valid.slice(i, i + n);
    const totalDist = seg.reduce((s, x) => s + x.distance, 0);
    const totalTime = seg.reduce((s, x) => s + x.moving_time, 0);
    if (totalDist < targetM * 0.9 || totalTime <= 0) continue;
    // Scale time to exact target distance
    const scaledTime = Math.round(totalTime * (targetM / totalDist));
    if (!best || scaledTime < best.timeSec) {
      best = { timeSec: scaledTime, startKm: i };
    }
  }
  return best;
}

async function main() {
  const email = process.env.SEED_EMAIL ?? "admin@traininglab.local";
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) { console.error(`User ${email} not found.`); process.exit(1); }

  // Fetch all running activities with splits (sorted desc by distance so big races first)
  const activities = await prisma.activity.findMany({
    where: {
      userId: user.id,
      sportType: { in: ["Run", "TrailRun", "VirtualRun"] },
      splitsMetric: { not: null },
    },
    orderBy: { distance: "desc" },
    select: {
      id: true, stravaId: true, name: true, distance: true,
      movingTime: true, startDate: true, splitsMetric: true, isRace: true,
    },
  });

  console.log(`Processing ${activities.length} activities for sub-distance PBs...`);

  let created = 0, updated = 0;

  for (const activity of activities) {
    if (!activity.splitsMetric || !Array.isArray(activity.splitsMetric)) continue;
    const splits = activity.splitsMetric as Split[];
    const actDistKm = activity.distance / 1000;

    for (const dist of CLASSIC_DISTANCES) {
      // Only extract sub-distances strictly shorter than the activity
      if (dist.m >= activity.distance * 0.98) continue;
      // Don't try to extract a 3K from a 4K run — needs reasonable margin
      if (dist.m > activity.distance * 0.85) continue;

      const result = bestNkmTime(splits, dist.m);
      if (!result) continue;

      const { timeSec } = result;
      const secPerKm = timeSec / (dist.m / 1000);

      // Sanity: pace must be between 2:00/km and 8:00/km
      if (secPerKm < 120 || secPerKm > 480) continue;

      // Check if this beats existing PB for this distance
      const existing = await prisma.raceRecord.findFirst({
        where: { userId: user.id, distance: dist.label },
        orderBy: { time: "asc" },
      });

      if (!existing || timeSec < existing.time) {
        // New PB! Create record. Source note: "from <activity name>"
        const source = `Best ${dist.label} split in ${activity.name}`;
        await prisma.raceRecord.create({
          data: {
            userId: user.id,
            distance: dist.label,
            distanceM: dist.m,
            time: timeSec,
            date: activity.startDate,
            eventName: source,
            stravaActivityId: String(activity.stravaId),
            isManual: false,
          },
        });
        console.log(`  NEW PB: ${dist.label} ${Math.floor(timeSec/60)}:${String(timeSec%60).padStart(2,'0')} from "${activity.name}" (${actDistKm.toFixed(1)}km)`);
        created++;
      }
    }
  }

  console.log(`\n✓ Created ${created} sub-distance PB records, updated ${updated}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
