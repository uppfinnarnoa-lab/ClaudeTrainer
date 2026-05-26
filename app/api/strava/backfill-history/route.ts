import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { runHistoricalBackfill } from "@/lib/strava/backfill";

/** GET — current backfill progress */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const [total, done] = await Promise.all([
    prisma.activity.count({ where: { userId } }),
    prisma.activity.count({ where: { userId, splitDetailFetched: true } }),
  ]);

  return NextResponse.json({ total, done, remaining: total - done });
}

/** POST — SSE stream: fetch individual detail for every unfetched activity */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const encoder = new TextEncoder();
  const send = (data: object) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runHistoricalBackfill(userId, event => {
          controller.enqueue(send(event));
        });
        controller.close();
      } catch (e) {
        controller.enqueue(send({ type: "error", message: String(e) }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
