import type { Metadata } from "next";
import Link from "next/link";
import { localePath, type Locale } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { withBasePath } from "@/lib/base-path";
import { pagedBombs } from "@/lib/dataset";
import { canonicalOf } from "@/lib/site";

/**
 * The bomb chart's old addresses, now the armament chart's. A static export
 * has no server to answer with a 308, and `permanentRedirect` bakes its
 * redirect only into the page's script payload — so each old page is a stub
 * that sends the browser on itself, script or no script, points search
 * engines at the new page and keeps itself out of their index.
 */
export function movedMetadata(locale: Locale, to: string): Metadata {
  return {
    ...canonicalOf(to, locale),
    robots: { index: false, follow: true },
  };
}

export function MovedPage({ locale, to }: { locale: Locale; to: string }) {
  const m = messagesFor(locale).moved;
  const target = localePath(locale, to);
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center space-y-3">
      {/* React hoists this into <head>; a plain meta tag carries no base path of its own. */}
      <meta httpEquiv="refresh" content={`0;url=${withBasePath(target)}`} />
      <p className="text-ink-dim">{m.text}</p>
      <Link href={target} className="text-accent underline underline-offset-4">
        {m.link}
      </Link>
    </div>
  );
}

/** Every weapon that had a page under /bombs/: the sheet's rows — the game's own came with the armament chart. */
export function movedBombIds(): string[] {
  return pagedBombs.filter((bomb) => bomb.source !== "game").map((bomb) => bomb.id);
}
