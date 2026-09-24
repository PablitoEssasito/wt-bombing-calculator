"use client";

import { useMemo } from "react";
import { AircraftPlanner } from "@/components/aircraft-planner";
import { AircraftBombIcons } from "@/components/bomb-glyph";
import { LoadoutCreator } from "@/components/loadout-creator";
import type { Armament } from "@/domain/loadout";
import type { Aircraft, Bomb } from "@/domain/types";
import { urlLiteral, useUrlState } from "@/lib/use-url-state";
import { cn } from "@/lib/utils";

const VIEWS = ["schedule", "build"] as const;

/**
 * Switches between the curated drop schedule and the loadout creator.
 *
 * The two read the sheet differently on purpose: the schedule is the sheet's
 * own hand-tuned answer, and the creator lets you compose anything the game
 * itself would let you hang, priced the same way. Kept as separate tools
 * rather than one merged view — the sheet's numbers stay exactly as written,
 * with nothing implying the custom builder second-guesses them.
 *
 * Only offered when there is something to build: an aircraft with no
 * hardpoint data (a fixed-setup bomber, or one the wiki match missed) gets the
 * schedule alone, with no tab bar at all.
 */
export function AircraftView({
  plane,
  bombs,
  sourceUrl,
  splittable,
  armament,
  bombIcons,
}: {
  plane: Aircraft;
  bombs: Bomb[];
  sourceUrl: string;
  splittable: boolean;
  armament: Armament | null;
  /** This aircraft's own menu icons, from `bombIconsFor`. */
  bombIcons: Record<string, string>;
}) {
  const [view, setView] = useUrlState("view", urlLiteral(VIEWS, "schedule"));
  const icons = useMemo(() => new Map(Object.entries(bombIcons)), [bombIcons]);

  if (!armament) {
    return (
      <AircraftBombIcons.Provider value={icons}>
        <AircraftPlanner plane={plane} bombs={bombs} sourceUrl={sourceUrl} splittable={splittable} />
      </AircraftBombIcons.Provider>
    );
  }

  return (
    <AircraftBombIcons.Provider value={icons}>
      <div className="space-y-6">
        <div role="group" aria-label="View" className="flex gap-1">
          <ViewTab active={view === "schedule"} onClick={() => setView("schedule")}>
            Drop schedule
          </ViewTab>
          <ViewTab active={view === "build"} onClick={() => setView("build")}>
            Build a loadout
          </ViewTab>
        </div>

        {view === "schedule" ? (
          <AircraftPlanner plane={plane} bombs={bombs} sourceUrl={sourceUrl} splittable={splittable} />
        ) : (
          <LoadoutCreator plane={plane} armament={armament} bombs={bombs} />
        )}
      </div>
    </AircraftBombIcons.Provider>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "px-3 py-1.5 rounded-full text-sm border transition-colors",
        active
          ? "border-accent text-accent bg-accent-dim"
          : "border-line text-ink-dim hover:text-ink hover:border-line-bright",
      )}
    >
      {children}
    </button>
  );
}
