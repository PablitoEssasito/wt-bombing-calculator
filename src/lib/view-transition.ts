import { flushSync } from "react-dom";

/** Transitions in flight; the marker comes off only once the last one ends. */
let active = 0;

/**
 * Runs a state change inside a view transition, so what it rearranges glides
 * instead of jumping.
 *
 * URL-backed state (useUrlState) updates synchronously, which React's own
 * <ViewTransition> never animates, hence the browser API directly. While it
 * runs, `html[data-vt]` gives every `.vt-item` a name (see globals.css), so
 * only those take part. Without the API, or under reduced motion, the change
 * simply happens.
 */
export function withViewTransition(update: () => void) {
  if (
    typeof document.startViewTransition !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }
  const root = document.documentElement;
  active++;
  root.dataset.vt = "";
  const transition = document.startViewTransition(() => flushSync(update));
  transition.finished.finally(() => {
    if (--active === 0) delete root.dataset.vt;
  });
}
