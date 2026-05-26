export default function StatsLoading() {
  return (
    <div className="space-y-2 animate-pulse">
      <div>
        <div className="h-7 w-32 rounded-lg bg-surface-2" />
        <div className="h-4 w-40 rounded-lg bg-surface-2 mt-2" />
      </div>

      {/* Tab bar skeleton */}
      <div className="flex gap-1 pt-1">
        {[80, 64, 52, 60, 56].map((w, i) => (
          <div key={i} className="h-8 rounded-xl bg-surface-2" style={{ width: w }} />
        ))}
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl bg-surface border border-border p-4 space-y-2">
            <div className="h-3 w-20 rounded bg-surface-2" />
            <div className="h-7 w-16 rounded bg-surface-2" />
            <div className="h-3 w-24 rounded bg-surface-2" />
          </div>
        ))}
      </div>

      {/* Big chart area */}
      <div className="rounded-2xl bg-surface border border-border p-5 space-y-3">
        <div className="h-4 w-32 rounded bg-surface-2" />
        <div className="h-44 rounded-xl bg-surface-2" />
      </div>

      {/* Second chart + metrics row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface border border-border p-5 space-y-3">
          <div className="h-4 w-28 rounded bg-surface-2" />
          <div className="h-36 rounded-xl bg-surface-2" />
        </div>
        <div className="rounded-2xl bg-surface border border-border p-5 space-y-3">
          <div className="h-4 w-24 rounded bg-surface-2" />
          <div className="h-36 rounded-xl bg-surface-2" />
        </div>
      </div>
    </div>
  );
}
