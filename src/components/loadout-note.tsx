"use client";

import { stanceOf } from "@/domain/recommend";
import type { LoadoutOption } from "@/domain/types";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

const TONE = {
  star: "border-accent/40 bg-accent-dim",
  "!": "border-warn/30 bg-warn/5",
  "?": "border-line bg-surface-2",
  none: "border-line bg-surface-2",
  discouraged: "border-danger/40 bg-danger/5",
} as const;

/**
 * A note attached to a loadout — a caveat, a warning, or a recommendation.
 *
 * These live in the spreadsheet's cell comments, so an import without an API key
 * has the marker but not the text (`null`) — hence the fallback; an empty note
 * is one the import read and found nothing in, so just the heading shows. A note that argues
 * against the loadout is styled as a warning whatever marker it carries, because
 * the marker is not a reliable signal of that on its own: the worst refusals are
 * filed under "?" or under no marker at all.
 */
export function LoadoutNote({ option, sourceUrl }: { option: LoadoutOption; sourceUrl: string }) {
  const { m, isDefault } = useI18n();
  const discouraged = stanceOf(option) === "discouraged";
  const marker = option.noteMarker;

  return (
    <aside
      className={cn(
        "rounded-lg border px-3 py-2.5 text-sm space-y-1",
        discouraged ? TONE.discouraged : TONE[marker ?? "none"],
      )}
    >
      <p
        className={cn(
          "text-xs uppercase tracking-wider",
          discouraged ? "text-danger" : "text-ink-faint",
        )}
      >
        {discouraged ? m.notes.notRecommended : m.notes.headings[marker ?? "none"]}
        {/* The sheet's own words stay in English; say so outside English. */}
        {option.note && !isDefault ? (
          <span
            title={m.common.sourceLanguageTitle}
            className="ml-2 rounded border border-line px-1 normal-case tracking-normal text-ink-faint"
          >
            {m.common.sourceLanguage}
          </span>
        ) : null}
      </p>
      {option.note ? (
        <p lang="en" className="text-ink-dim whitespace-pre-line leading-relaxed">
          {option.note}
        </p>
      ) : option.note === null && marker ? (
        <p className="text-ink-dim">
          {m.notes.fallbacks[marker]}{" "}
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-accent"
          >
            {m.notes.seeSheet}
          </a>
          {m.notes.forWhatItSays}
        </p>
      ) : null}
    </aside>
  );
}
