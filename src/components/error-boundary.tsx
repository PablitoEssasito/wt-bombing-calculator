"use client";

import { Component, type ReactNode } from "react";
import { describeError, track } from "@/lib/analytics";

type Props = { children: ReactNode };
type State = { broke: boolean };

/**
 * A render-time error otherwise unmounts the whole tree under this point and
 * leaves a blank page — this swaps in a plain "something broke" message
 * instead, and reports the same `exception` event ErrorTracking sends for
 * everything else, so a crash here still shows up somewhere.
 *
 * Class component because React still has no hook equivalent of
 * getDerivedStateFromError/componentDidCatch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { broke: false };

  static getDerivedStateFromError() {
    return { broke: true };
  }

  componentDidCatch(error: Error) {
    track("exception", { description: describeError(error), fatal: true });
  }

  render() {
    if (this.state.broke) {
      return (
        <div className="mx-auto max-w-2xl px-4 py-16 text-center space-y-2">
          <p className="text-lg font-semibold">Something broke on this page.</p>
          <p className="text-ink-dim text-sm">Reloading usually fixes it.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
