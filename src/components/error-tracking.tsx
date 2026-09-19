"use client";

import { useEffect } from "react";
import { describeError, track } from "@/lib/analytics";

/**
 * No error-tracking service is wired into this site — GA4 is the one place
 * analytics lives (see analytics.ts), and stays that way. `exception` is
 * GA4's own recommended event name/param shape, so a real error at least
 * shows up as a count against a page, even without a stack trace or
 * dedup/alerting a dedicated tool would give.
 *
 * Catches what React's own render cycle doesn't: errors thrown outside a
 * component render (event handlers, timers) and rejected promises nothing
 * ever caught. Render-time errors are ErrorBoundary's job instead — by the
 * time one reaches here, React has already unmounted the tree.
 */
export function ErrorTracking() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      track("exception", { description: describeError(event.error ?? event.message), fatal: false });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      track("exception", { description: describeError(event.reason), fatal: false });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
