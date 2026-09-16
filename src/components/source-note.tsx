import type { LoadoutOption } from "@/domain/types";
import { NOTE_HEADINGS, NOTE_FALLBACKS } from "@/lib/labels";
import { cn } from "@/lib/utils";

const TONE: Record<NonNullable<LoadoutOption["noteMarker"]>, string> = {
  star: "border-accent/40 bg-accent-dim",
  "!": "border-warn/30 bg-warn/5",
  "?": "border-line bg-surface-2",
};

/**
 * A note the author of the source sheet left on a loadout.
 *
 * These live in Google Sheets cell comments, so an import without an API key has
 * the marker but not the text — hence the fallback.
 */
export function SourceNote({
  marker,
  note,
  sourceUrl,
}: {
  marker: NonNullable<LoadoutOption["noteMarker"]>;
  note: string | null;
  sourceUrl: string;
}) {
  return (
    <aside className={cn("rounded-lg border px-3 py-2.5 text-sm space-y-1", TONE[marker])}>
      <p className="text-xs uppercase tracking-wider text-ink-faint">{NOTE_HEADINGS[marker]}</p>
      {note ? (
        <p className="text-ink-dim whitespace-pre-line leading-relaxed">{note}</p>
      ) : (
        <p className="text-ink-dim">
          {NOTE_FALLBACKS[marker]}{" "}
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-accent"
          >
            Check the source sheet
          </a>{" "}
          for what it says.
        </p>
      )}
    </aside>
  );
}
