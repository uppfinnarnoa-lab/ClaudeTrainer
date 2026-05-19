import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

const sectionSchema = z.object({
  order: z.number().int(),
  name: z.string().min(1).max(80),
  durationType: z.enum(["time", "distance", "open"]),
  duration: z.number().int().positive().optional().nullable(),
  distance: z.number().positive().optional().nullable(),
  repetitions: z.number().int().min(1).optional().nullable(),
  zoneType: z.enum(["hr_zone", "pace_zone", "power_zone", "rpe"]).optional().nullable(),
  targetZone: z.number().int().min(1).max(5).optional().nullable(),
  targetPaceLow: z.number().positive().optional().nullable(),
  targetPaceHigh: z.number().positive().optional().nullable(),
  targetHRLow: z.number().int().optional().nullable(),
  targetHRHigh: z.number().int().optional().nullable(),
  targetRPE: z.number().int().min(1).max(10).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

const updateSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  sportId:     z.string().cuid().optional(),
  typeId:      z.string().cuid().optional().nullable(),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  sections:    z.array(sectionSchema).max(20).optional(),
});

async function owned(id: string, userId: string) {
  const t = await prisma.workoutTemplate.findUnique({ where: { id } });
  return t?.userId === userId ? t : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!await owned(id, session.user.id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const { sections, ...templateData } = parsed.data;

  // Update template fields
  if (Object.keys(templateData).length > 0) {
    await prisma.workoutTemplate.update({ where: { id }, data: templateData });
  }

  // Replace sections if provided
  if (sections !== undefined) {
    await prisma.workoutSection.deleteMany({ where: { templateId: id } });
    if (sections.length > 0) {
      await prisma.workoutSection.createMany({
        data: sections.map(s => ({ ...s, templateId: id })),
      });
    }
  }

  const updated = await prisma.workoutTemplate.findUnique({
    where: { id },
    include: { sections: { orderBy: { order: "asc" } }, sport: true, type: true },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!await owned(id, session.user.id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.workoutTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
