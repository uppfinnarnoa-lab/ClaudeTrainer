import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [activityCount, stravaAccount] = await Promise.all([
    prisma.activity.count({ where: { userId } }),
    prisma.stravaAccount.findUnique({
      where: { userId },
      select: { totalSynced: true, lastSyncAt: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary">Dashboard</h1>
        <p className="text-sm text-muted mt-1">
          Welcome back, {session.user.name ?? session.user.email}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Activities synced",
            value: activityCount.toLocaleString(),
            sub: stravaAccount ? `${stravaAccount.totalSynced.toLocaleString()} total` : "Connect Strava in Settings",
          },
          { label: "This week", value: "—", sub: "Sync Strava to see data" },
          { label: "This month", value: "—", sub: "Sync Strava to see data" },
          { label: "Year to date", value: "—", sub: "Sync Strava to see data" },
        ].map((card) => (
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
            { href: "/stats",    label: "Statistics",       desc: "VO2max, training load, zones" },
            { href: "/planner",  label: "Training Planner", desc: "Calendar, templates, blocks" },
            { href: "/coach",    label: "AI Coach",         desc: "Chat with your personal trainer" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-xl bg-surface border border-border p-5 hover:border-accent/40 transition-colors group"
            >
              <p className="font-semibold text-primary group-hover:text-accent transition-colors">{item.label}</p>
              <p className="text-sm text-muted mt-1">{item.desc}</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
