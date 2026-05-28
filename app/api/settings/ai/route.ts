import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { encryptIfNeeded } from "@/lib/encrypt";
import { z } from "zod";

const schema = z.object({
  provider:              z.enum(["claude", "gemini", "nvidia"]),
  claudeApiKey:          z.string().optional(),
  geminiApiKey:          z.string().optional(),
  nvidiaApiKey:          z.string().optional(),
  nvidiaModel:           z.string().optional(),
  monthlyBudgetUsd:      z.number().min(0).max(1000),
  geminiMonthlyBudgetUsd: z.number().min(0).max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { provider, claudeApiKey, geminiApiKey, nvidiaApiKey, nvidiaModel, monthlyBudgetUsd, geminiMonthlyBudgetUsd } = parsed.data;

  const data = {
    provider,
    ...(claudeApiKey ? { claudeApiKey: encryptIfNeeded(claudeApiKey)! } : {}),
    ...(geminiApiKey ? { geminiApiKey: encryptIfNeeded(geminiApiKey)! } : {}),
    ...(nvidiaApiKey ? { nvidiaApiKey: encryptIfNeeded(nvidiaApiKey)! } : {}),
    ...(nvidiaModel  ? { nvidiaModel } : {}),
    monthlyBudgetUsd,
    ...(geminiMonthlyBudgetUsd !== undefined ? { geminiMonthlyBudgetUsd } : {}),
  };

  await prisma.aISettings.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...data },
    update: data,
  });

  return NextResponse.json({ ok: true });
}
