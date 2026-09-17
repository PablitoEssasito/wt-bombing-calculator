import { stanceOf } from "@/domain/recommend";
import type { LoadoutOption } from "@/domain/types";
import { NOTE_HEADINGS, NOTE_FALLBACKS } from "@/lib/labels";
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
 * has the marker but not the text — hence the fallback. A note that argues
 * against the loadout is styled as a warning whatever marker it carries, because
 * the marker is not a reliable signal of that on its own: the worst refusals are
 * filed under "?" or under no marker at all.
 */
export function LoadoutNote({ option, sourceUrl }: { option: LoadoutOption; sourceUrl: string }) {
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
        {discouraged ? "Not recommended" : NOTE_HEADINGS[marker ?? "none"]}
      </p>
      {option.note ? (
        <p className="text-ink-dim whitespace-pre-line leading-relaxed">{option.note}</p>
      ) : marker ? (
        <p className="text-ink-dim">
          {NOTE_FALLBACKS[marker]}{" "}
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-accent"
          >
            See the sheet
          </a>{" "}
          for what it says.
        </p>
      ) : null}
    </aside>
  );
}
