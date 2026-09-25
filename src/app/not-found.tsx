import Link from "next/link";
import { BombMark } from "@/components/bomb-mark";
import { messagesFor } from "@/i18n/messages";

/**
 * Next's own 404 fallback renders unstyled and light-themed — a real jolt
 * against a page meant to be opened one-handed in a dark room (see the "dark
 * only" note in globals.css). This one just borrows the rest of the site's
 * own palette instead.
 *
 * Deliberately bare — just the mark and the way home, no site header: this
 * file sits at the root, and Next carries it in every page's own payload, so
 * anything it renders is paid for on all ~2 000 pages. A static export has one
 * 404.html for every missing address, whatever its language, so it speaks
 * English, the language every address falls back to.
 */
export default function NotFound() {
  const m = messagesFor("en").notFound;
  return (
    <main className="flex-1 mx-auto max-w-6xl px-4 py-24 text-center space-y-4">
      <Link href="/" aria-label="BombingCalc" className="inline-block">
        <BombMark size={40} className="text-accent" />
      </Link>
      <p className="text-accent text-sm font-medium tracking-wide uppercase">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">{m.heading}</h1>
      <p className="text-ink-dim">{m.text}</p>
      <Link
        href="/"
        className="inline-block card px-4 py-2 text-sm text-ink-dim hover:text-ink hover:border-line-bright transition-colors"
      >
        {m.back}
      </Link>
    </main>
  );
}
