"use client";

import React from "react";

type Props = {
  missionTitle: string;
  children: React.ReactNode;
};

type State = {
  error: Error | null;
};

/** Keeps a throw in route map / lifecycle / manifest panels from breaking approval actions. */
export class PendingMissionDetailsBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error("[Fleet Hub] Pending mission details failed to render:", error);
  }

  componentDidUpdate(prevProps: Props): void {
    if (prevProps.missionTitle !== this.props.missionTitle && this.state.error) {
      this.setState({ error: null });
    }
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
          <p className="font-medium">Could not load full mission details</p>
          <p className="mt-1 text-xs text-amber-900/90">
            Use Approve, Revise &amp; resubmit, or Reject above — you do not need the details panel to decide.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
