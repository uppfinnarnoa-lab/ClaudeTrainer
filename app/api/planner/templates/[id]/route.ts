import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const template = await prisma.workoutTemplate.findUnique({ where: { id } });
  if (!template || template.userId !== session.user.id)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.workoutTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
