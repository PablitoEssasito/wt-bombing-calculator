"use client";

import { Ellipsis, LayoutList, Target } from "lucide-react";
import { useEffect, useRef } from "react";
import { Count } from "@/components/filter-count";
import { BombSilhouette, MissileSilhouette, TorpedoSilhouette } from "@/components/ordnance-icons";
import { SECTIONS, sectionOf, type ChartSection, type ChartTab } from "@/domain/bomb-chart";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

type Subtab = keyof ReturnType<typeof useI18n>["m"]["bombChart"]["subtabs"];

/** What each section holds at a glance: a falling bomb for air-to-ground, a missile for air-to-air, a torpedo for torpedoes. */
const ICONS: Record<ChartSection["id"], React.ComponentType<{ className?: string }>> = {
  bases: (props) => <Target size={15} {...props} />,
  all: (props) => <LayoutList size={15} {...props} />,
  ground: BombSilhouette,
  air: MissileSilhouette,
  torpedo: TorpedoSilhouette,
  other: (props) => <Ellipsis size={15} {...props} />,
};

/**
 * The armament chart's tabs in two tiers. The views of the whole and the
 * categories sit in two joined bars — set apart from the filter chips below,
 * which narrow what a tab shows rather than pick it. A section with several
 * tabs lists them beneath as a lighter row, each with how many it holds.
 */
export function SectionTabs({
  tab,
  counts,
  onSelect,
}: {
  tab: ChartTab;
  /** How many rows each tab holds, before any filter. */
  counts: Record<ChartTab, number>;
  onSelect: (tab: ChartTab) => void;
}) {
  const { m } = useI18n();
  const current = sectionOf(tab);
  const strip = useRef<HTMLDivElement>(null);

  // A phone shows only part of a long row: bring the chosen tab into it, as a
  // link straight to the last one would otherwise open on a row without it.
  useEffect(() => {
    const row = strip.current;
    const active = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !active) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < row.scrollLeft) row.scrollLeft = left;
    else if (right > row.scrollLeft + row.clientWidth) row.scrollLeft = right - row.clientWidth;
  }, [tab]);

  const bar = (kind: ChartSection["kind"]) => (
    <div className="grid grid-flow-col auto-cols-fr gap-1 rounded-xl border border-line bg-surface p-1 sm:inline-grid sm:auto-cols-auto">
      {SECTIONS.filter((section) => section.kind === kind).map((section) => {
        const active = section.id === current.id;
        const Icon = ICONS[section.id];
        return (
          <button
            key={section.id}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) onSelect(section.tabs[0]);
            }}
            className={cn(
              // On a phone the icon sits over the word, so four categories fit a row.
              "flex flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 py-1.5 text-sm whitespace-nowrap transition-colors sm:flex-row sm:gap-1.5 sm:px-3",
              active ? "bg-accent-dim font-medium text-accent" : "text-ink-dim hover:bg-surface-2 hover:text-ink",
            )}
          >
            {/* One height for the round icons and the flat silhouettes, so the words line up. */}
            <span className="flex h-4 shrink-0 items-center">
              <Icon />
            </span>
            <span className="sm:hidden">{m.bombChart.sectionsShort[section.id]}</span>
            <span className="hidden sm:inline">{m.bombChart.sections[section.id]}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div role="group" aria-label={m.bombChart.show} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
        {bar("view")}
        {bar("category")}
      </div>
      {current.tabs.length > 1 ? (
        // The baseline drawn inside, so a row scrolled sideways on a phone keeps it.
        <div
          ref={strip}
          className="relative flex gap-5 overflow-x-auto [scrollbar-width:none] shadow-[inset_0_-1px_0_var(--color-line)]"
        >
          {current.tabs.map((each) => {
            const active = each === tab;
            return (
              <button
                key={each}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (!active) onSelect(each);
                }}
                className={cn(
                  "shrink-0 border-b-2 pb-2 pt-1 text-sm whitespace-nowrap transition-colors",
                  active ? "border-accent font-medium text-ink" : "border-transparent text-ink-dim hover:text-ink",
                )}
              >
                {m.bombChart.subtabs[each as Subtab]} <Count>{counts[each]}</Count>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
