import Link from "next/link";

/**
 * Next's own 404 fallback renders unstyled and light-themed — a real jolt
 * against a page meant to be opened one-handed in a dark room (see the "dark
 * only" note in globals.css). This one just borrows the rest of the site's
 * own palette and layout instead.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 text-center space-y-4">
      <p className="text-accent text-sm font-medium tracking-wide uppercase">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
      <p className="text-ink-dim">
        No aircraft, bomb or page lives at that address.
      </p>
      <Link
        href="/"
        className="inline-block card px-4 py-2 text-sm text-ink-dim hover:text-ink hover:border-line-bright transition-colors"
      >
        ← Back to all aircraft
      </Link>
    </div>
  );
}
