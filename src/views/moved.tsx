import type { Metadata } from "next";
import Link from "next/link";
import { localePath, type Locale } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { withBasePath } from "@/lib/base-path";
import { bombs, bombsById, pagedBombs } from "@/lib/dataset";
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

/**
 * Every weapon that had a page under /bombs/: the sheet's rows with a figure
 * to show — the game's own rows came with the armament chart.
 */
export function movedBombIds(): string[] {
  return bombs
    .filter(
      (bomb) =>
        bomb.source !== "game" &&
        (bomb.damageValue !== null || bomb.sheet?.damageValue != null || bomb.kind === "ROCKET"),
    )
    .map((bomb) => bomb.id);
}

/**
 * Where an old bomb page lives now: its own page, the page of the weapon the
 * game has it as (`aliasOf`), or the chart where it has none.
 */
export function movedTarget(id: string): string {
  const bomb = bombsById.get(id);
  if (bomb && pagedBombs.includes(bomb)) return `/armament/${id}/`;
  if (bomb?.aliasOf) return `/armament/${bomb.aliasOf}/`;
  return "/armament/";
}
