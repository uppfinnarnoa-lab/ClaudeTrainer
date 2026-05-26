import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { stravaFetch } from "@/lib/strava/client";

const CACHE_SECONDS = 60 * 60 * 24 * 7; // streams cached 7 days (static historical data)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify ownership
  const activity = await prisma.activity.findUnique({
    where: { id },
    select: { userId: true, stravaId: true },
  });
  if (!activity || activity.userId !== session.user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Fetch from Strava streams API
  // Keys: time, distance, latlng, altitude, heartrate, cadence, velocity_smooth
  try {
    const data = await stravaFetch(
      session.user.id,
      `/activities/${activity.stravaId}/streams`,
      {
        keys: "time,distance,heartrate,velocity_smooth,altitude,cadence",
        key_by_type: "true",
      },
    );

    return NextResponse.json(data, {
      headers: { "Cache-Control": `private, max-age=${CACHE_SECONDS}` },
    });
  } catch (e) {
    console.error("Streams fetch failed:", e);
    return NextResponse.json({ error: "streams_unavailable" }, { status: 503 });
  }
}
