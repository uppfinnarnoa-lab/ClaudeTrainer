"use client";

import { Component, type ReactNode } from "react";

interface State { error: Error | null }

export class StatsErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-red-500 bg-red-500/10 p-6 space-y-2">
          <p className="font-semibold text-red-400">Stats hydration error — kopiera detta och rapportera:</p>
          <pre className="text-xs text-red-300 whitespace-pre-wrap break-all">{this.state.error.message}</pre>
          <pre className="text-xs text-red-200 whitespace-pre-wrap break-all">{this.state.error.stack?.slice(0, 500)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
