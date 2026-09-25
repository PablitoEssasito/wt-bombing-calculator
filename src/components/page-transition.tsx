import { ViewTransition } from "react";

/** Navigation kinds a <Link transitionTypes> can name — styled in globals.css. */
const KINDS = {
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  "nav-fade": "nav-fade",
  default: "none",
};

/**
 * A page's content, animated in and out by the kind of navigation that
 * brought it: deeper (into an aircraft), back, or across to another section.
 * Untyped navigations — the browser's own back button — just swap. It wraps
 * each page rather than the layout, which persists and so never enters.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter={KINDS} exit={KINDS} default="none">
      {children}
    </ViewTransition>
  );
}
