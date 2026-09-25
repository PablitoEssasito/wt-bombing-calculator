"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { AircraftPlanner } from "@/components/aircraft-planner";
import { AircraftBombIcons } from "@/components/bomb-glyph";
import type { Armament } from "@/domain/loadout";
import type { AircraftEconomy } from "@/domain/reward";
import type { Aircraft, Bomb } from "@/domain/types";
import { useI18n } from "@/i18n/client";
import { urlLiteral, useUrlState } from "@/lib/use-url-state";
import { cn } from "@/lib/utils";

const VIEWS = ["schedule", "build"] as const;

const loadCreator = () => import("@/components/loadout-creator").then((mod) => mod.LoadoutCreator);

/**
 * The creator carries its own drag-and-drop and animation libraries, so it
 * loads only once someone opens it (or points at its tab), and the drop
 * schedule most visitors come for never pays for them.
 */
const LoadoutCreator = dynamic(loadCreator, {
  loading: () => <div className="card h-96 animate-pulse" aria-busy="true" />,
});

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
  displayName,
  bombs,
  sourceUrl,
  splittable,
  armament,
  bombIcons,
  weaponNames,
  economy,
}: {
  plane: Aircraft;
  /** The aircraft's name in the page's language; `plane.name` stays English for analytics. */
  displayName: string;
  bombs: Bomb[];
  sourceUrl: string;
  splittable: boolean;
  armament: Armament | null;
  /** This aircraft's own menu icons, from `bombIconsFor`. */
  bombIcons: Record<string, string>;
  /** English weapon name to the page language's, from `weaponNamesFor`; null in English. */
  weaponNames: Record<string, string> | null;
  /** The game's own earning figures, from `economyFor`; null where none matched. */
  economy: AircraftEconomy | null;
}) {
  const { m } = useI18n();
  const [view, setView] = useUrlState("view", urlLiteral(VIEWS, "schedule"));
  const icons = useMemo(() => new Map(Object.entries(bombIcons)), [bombIcons]);

  if (!armament) {
    return (
      <AircraftBombIcons.Provider value={icons}>
        <AircraftPlanner
          plane={plane}
          displayName={displayName}
          bombs={bombs}
          sourceUrl={sourceUrl}
          splittable={splittable}
          economy={economy}
        />
      </AircraftBombIcons.Provider>
    );
  }

  return (
    <AircraftBombIcons.Provider value={icons}>
      <div className="space-y-6">
        <div role="group" aria-label={m.aircraftPage.viewGroup} className="flex gap-1">
          <ViewTab active={view === "schedule"} onClick={() => setView("schedule")}>
            {m.aircraftPage.schedule}
          </ViewTab>
          <ViewTab
            active={view === "build"}
            onClick={() => setView("build")}
            onPointerEnter={() => void loadCreator()}
            onFocus={() => void loadCreator()}
          >
            {m.aircraftPage.build}
          </ViewTab>
        </div>

        {view === "schedule" ? (
          <AircraftPlanner
            plane={plane}
            displayName={displayName}
            bombs={bombs}
            sourceUrl={sourceUrl}
            splittable={splittable}
            economy={economy}
          />
        ) : (
          <LoadoutCreator
            plane={plane}
            armament={armament}
            bombs={bombs}
            weaponNames={weaponNames}
            economy={economy}
          />
        )}
      </div>
    </AircraftBombIcons.Provider>
  );
}

function ViewTab({
  active,
  onClick,
  onPointerEnter,
  onFocus,
  children,
}: {
  active: boolean;
  onClick: () => void;
  onPointerEnter?: () => void;
  onFocus?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      onFocus={onFocus}
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
