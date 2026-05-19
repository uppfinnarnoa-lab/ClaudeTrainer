import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { addDays, subDays } from "date-fns";

// GET /api/races/activities-near?date=2024-10-20
// Returns running activities within ±3 days of the given date for linking
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const dateStr = req.nextUrl.searchParams.get("date");
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr))
    return NextResponse.json({ error: "invalid date" }, { status: 400 });

  const center = new Date(dateStr);
  const activities = await prisma.activity.findMany({
    where: {
      userId: session.user.id,
      sportType: { in: ["Run", "TrailRun", "VirtualRun"] },
      startDate: { gte: subDays(center, 3), lte: addDays(center, 3) },
    },
    orderBy: { startDate: "asc" },
    select: { stravaId: true, name: true, startDate: true, distance: true, movingTime: true },
    take: 10,
  });

  type A = { stravaId: bigint; name: string; startDate: Date; distance: number; movingTime: number };
  return NextResponse.json((activities as A[]).map(a => ({
    stravaId: String(a.stravaId),
    name: a.name,
    date: a.startDate.toISOString().slice(0, 10),
    distanceKm: Math.round(a.distance / 100) / 10,
    movingTime: a.movingTime,
  })));
}
