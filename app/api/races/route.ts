import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

const schema = z.object({
  distance:         z.string().min(1).max(60),
  distanceM:        z.number().positive(),
  time:             z.number().int().min(30),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  eventName:        z.string().max(120).optional().nullable(),
  stravaActivityId: z.string().optional().nullable(),
  notes:            z.string().max(500).optional().nullable(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const records = await prisma.raceRecord.findMany({
    where: { userId: session.user.id },
    orderBy: [{ distanceM: "asc" }, { date: "desc" }],
  });

  return NextResponse.json(records);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const record = await prisma.raceRecord.create({
    data: {
      ...parsed.data,
      date: new Date(parsed.data.date),
      userId: session.user.id,
      isManual: true,
    },
  });

  return NextResponse.json(record, { status: 201 });
}
