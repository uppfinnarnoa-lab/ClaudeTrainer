export {};
/**
 * Shifts all planned workout dates forward by 1 day.
 * Fixes the timezone bug where toISOString() converted UTC dates
 * and ended up storing the date one day too early.
 *
 * Run ONCE: SEED_EMAIL=uppfinnarnoa@gmail.com npx tsx scripts/shift-workout-dates.ts
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_EMAIL ?? "admin@traininglab.local";
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) { console.error(`User ${email} not found.`); process.exit(1); }

  const workouts = await prisma.plannedWorkout.findMany({
    where: { userId: user.id },
    select: { id: true, date: true },
  });

  let updated = 0;
  for (const w of workouts) {
    const current = new Date(w.date);
    const shifted = new Date(current);
    shifted.setDate(shifted.getDate() + 1);
    await prisma.plannedWorkout.update({
      where: { id: w.id },
      data: { date: shifted },
    });
    updated++;
  }

  console.log(`✓ Shifted ${updated} planned workouts forward by 1 day`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
