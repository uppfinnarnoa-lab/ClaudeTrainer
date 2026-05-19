import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { startOfWeek, startOfMonth, startOfYear, subDays } from "date-fns";

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatKm(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(0)} km` : `${Math.round(meters)} m`;
}

function formatHours(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function periodStats(userId: string, since: Date) {
  const sinceStr = localDateStr(since);
  const rows = await prisma.activity.aggregate({
    where: {
      userId,
      startDateLocal: { gte: new Date(sinceStr) },
    },
    _sum: { distance: true, movingTime: true },
    _count: true,
  });
  return {
    km: rows._sum.distance ?? 0,
    sec: rows._sum.movingTime ?? 0,
    count: rows._count,
  };
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const now = new Date();
  const weekStart  = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  const yearStart  = startOfYear(now);

  const [activityCount, stravaAccount, weekData, monthData, ytdData] = await Promise.all([
    prisma.activity.count({ where: { userId } }),
    prisma.stravaAccount.findUnique({
      where: { userId },
      select: { totalSynced: true, lastSyncAt: true },
    }),
    periodStats(userId, weekStart),
    periodStats(userId, monthStart),
    periodStats(userId, yearStart),
  ]);

  const hasActivities = activityCount > 0;

  const cards = [
    {
      label: "Activities synced",
      value: activityCount.toLocaleString(),
      sub: stravaAccount ? `${stravaAccount.totalSynced.toLocaleString()} total` : "Connect Strava in Settings",
    },
    {
      label: "This week",
      value: hasActivities ? formatKm(weekData.km) : "—",
      sub: hasActivities ? `${formatHours(weekData.sec)} · ${weekData.count} sessions` : "Sync Strava to see data",
    },
    {
      label: "This month",
      value: hasActivities ? formatKm(monthData.km) : "—",
      sub: hasActivities ? `${formatHours(monthData.sec)} · ${monthData.count} sessions` : "Sync Strava to see data",
    },
    {
      label: "Year to date",
      value: hasActivities ? formatKm(ytdData.km) : "—",
      sub: hasActivities ? `${formatHours(ytdData.sec)} · ${ytdData.count} sessions` : "Sync Strava to see data",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary">Dashboard</h1>
        <p className="text-sm text-muted mt-1">
          Welcome back, {session.user.name ?? session.user.email}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl bg-surface border border-border p-5 shadow-sm">
            <p className="text-xs font-medium text-muted uppercase tracking-wide">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold font-mono text-primary">{card.value}</p>
            <p className="text-xs text-muted mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {!stravaAccount ? (
        <div className="rounded-2xl bg-surface border border-border p-6">
          <h2 className="text-base font-semibold text-primary mb-2">Get started</h2>
          <p className="text-sm text-muted">
            Connect your Strava account in{" "}
            <a href="/settings" className="text-accent hover:underline font-medium">Settings</a>{" "}
            to start syncing your training history.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { href: "/stats",    label: "Statistics",        desc: "VO2max, training load, zones" },
            { href: "/planner",  label: "Training Planner",  desc: "Calendar, templates, blocks" },
            { href: "/coach",    label: "AI Coach",          desc: "Chat with your personal trainer" },
          ].map((item) => (
            <a key={item.href} href={item.href}
              className="rounded-xl bg-surface border border-border p-5 hover:border-accent/40 transition-colors group">
              <p className="font-semibold text-primary group-hover:text-accent transition-colors">{item.label}</p>
              <p className="text-sm text-muted mt-1">{item.desc}</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
