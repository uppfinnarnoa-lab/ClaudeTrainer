export default function StatsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-7 w-32 bg-surface-2 rounded-lg" />
        <div className="h-4 w-40 bg-surface-2 rounded mt-2" />
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-border pb-px">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-20 bg-surface-2 rounded-lg" />
        ))}
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-surface-2" />
        ))}
      </div>

      {/* Weekly volume chart */}
      <div className="h-64 rounded-xl bg-surface-2" />

      {/* Training load chart */}
      <div className="h-64 rounded-xl bg-surface-2" />
    </div>
  );
}
