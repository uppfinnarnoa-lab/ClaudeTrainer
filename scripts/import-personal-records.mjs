// Run: node scripts/import-personal-records.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const USER_ID = "cmpcfsjn80000ru2wao5zjl4j";

const t = (mm, ss) => mm * 60 + ss;

const records = [
  { distance: "400m",  distanceM: 400,   time: t(1,6),   date: "2024-06-01", notes: "Datum okänt — kolumn märkt '2024'" },
  { distance: "1K",    distanceM: 1000,  time: t(3,19),  date: "2025-05-20" },
  { distance: "Mile",  distanceM: 1609,  time: t(5,55),  date: "2021-09-30" },
  { distance: "Mile",  distanceM: 1609,  time: t(5,37),  date: "2025-05-20" },
  { distance: "2K",    distanceM: 2000,  time: t(7,5),   date: "2025-05-20" },
  { distance: "3K",    distanceM: 3000,  time: t(11,9),  date: "2021-09-30" },
  { distance: "3K",    distanceM: 3000,  time: t(11,7),  date: "2025-05-20" },
  { distance: "3K",    distanceM: 3000,  time: t(11,0),  date: "2026-03-13" },
  { distance: "3K",    distanceM: 3000,  time: t(10,48), date: "2026-04-26" },
  { distance: "5K",    distanceM: 5000,  time: t(18,34), date: "2025-05-20" },
  { distance: "5K",    distanceM: 5000,  time: t(18,28), date: "2026-03-13" },
  { distance: "5K",    distanceM: 5000,  time: t(18,15), date: "2026-04-26" },
  { distance: "10K",   distanceM: 10000, time: t(43,3),  date: "2026-03-20" },
  { distance: "10K",   distanceM: 10000, time: t(42,5),  date: "2026-03-23" },
  { distance: "10K",   distanceM: 10000, time: t(38,41), date: "2026-04-26" },
];

const existing = await prisma.raceRecord.findMany({
  where: { userId: USER_ID },
  select: { distanceM: true, date: true },
});
const existingSet = new Set(
  existing.map(r => `${Math.round(r.distanceM)}_${r.date.toISOString().slice(0,10)}`)
);

let imported = 0, skipped = 0;

for (const r of records) {
  const key = `${Math.round(r.distanceM)}_${r.date}`;
  if (existingSet.has(key)) {
    const mm = Math.floor(r.time/60), ss = r.time%60;
    console.log(`SKIP  ${r.distance} ${r.date} ${mm}:${String(ss).padStart(2,"0")}`);
    skipped++;
    continue;
  }
  await prisma.raceRecord.create({
    data: {
      userId: USER_ID,
      distance: r.distance,
      distanceM: r.distanceM,
      time: r.time,
      date: new Date(r.date),
      isManual: true,
      notes: r.notes ?? null,
    },
  });
  const mm = Math.floor(r.time/60), ss = r.time%60;
  console.log(`OK    ${r.distance} ${r.date} ${mm}:${String(ss).padStart(2,"0")}`);
  imported++;
}

console.log(`\nDone: ${imported} imported, ${skipped} skipped`);
await prisma.$disconnect();
