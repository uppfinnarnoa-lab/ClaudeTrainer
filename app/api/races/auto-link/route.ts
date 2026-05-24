import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { subDays, addDays } from "date-fns";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.id;

  type UnlinkedRow = { id: string; date: Date; distanceM: number };
  type ActivityRow = { stravaId: bigint; startDate: Date; distance: number };
  // Load all unlinked race records
  const unlinked = (await prisma.raceRecord.findMany({
    where: { userId, stravaActivityId: null },
    select: { id: true, date: true, distanceM: true },
  })) as UnlinkedRow[];

  if (unlinked.length === 0) return NextResponse.json({ linked: 0, updates: [] });

  // Load activities within the date range of unlinked records
  const dates = unlinked.map(r => r.date);
  const minDate = subDays(new Date(Math.min(...dates.map(d => d.getTime()))), 1);
  const maxDate = addDays(new Date(Math.max(...dates.map(d => d.getTime()))), 1);

  const activities = (await prisma.activity.findMany({
    where: { userId, startDate: { gte: minDate, lte: maxDate } },
    select: { stravaId: true, startDate: true, distance: true },
  })) as ActivityRow[];

  const updates: { id: string; stravaActivityId: string }[] = [];

  for (const record of unlinked) {
    const recDate = record.date;
    const lo = subDays(recDate, 1).getTime();
    const hi = addDays(recDate, 1).getTime();

    const candidates = activities.filter(a => {
      const t = a.startDate.getTime();
      if (t < lo || t > hi) return false;
      // Distance within ±20%
      const ratio = a.distance / record.distanceM;
      return ratio >= 0.8 && ratio <= 1.2;
    });

    if (candidates.length === 1) {
      const stravaActivityId = candidates[0].stravaId.toString();
      await prisma.raceRecord.update({
        where: { id: record.id },
        data: { stravaActivityId },
      });
      updates.push({ id: record.id, stravaActivityId });
    }
  }

  return NextResponse.json({ linked: updates.length, updates });
}
