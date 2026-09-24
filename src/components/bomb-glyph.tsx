"use client";

import Image from "next/image";
import { createContext, useContext } from "react";
import { bombIconsById, bombIconUrl } from "@/lib/assets";
import { cn } from "@/lib/utils";

type BombLike = { id: string; chartName: string; fullName: string };

/** The size class used when nothing in the datamine could be matched to this bomb. */
const DEFAULT_ICON = "bombs_middle";

/**
 * How one aircraft's own loadout menu draws its bombs, where that differs from
 * the site-wide pick — the game draws the same bomb a size apart from one
 * aircraft to the next (see bombIconsFor). Empty anywhere but an aircraft page.
 */
export const AircraftBombIcons = createContext<Map<string, string>>(new Map());

/**
 * War Thunder's own weapon-selector icon for a bomb.
 *
 * Every bomb in the dataset resolves to one — the icon the loadout menu draws
 * it with, else its data file's matched by mass and kind (see
 * scripts/bomb-icons) — so there is no
 * drawn-from-scratch fallback here: the game already draws its icons at a size
 * and colour that read as small/large and GP/guided/incendiary at a glance,
 * which is exactly the cue a generated shape would only approximate.
 */
export function BombIcon({ bomb, size = 28 }: { bomb: BombLike; size?: number }) {
  const iconType = useContext(AircraftBombIcons).get(bomb.id) ?? bombIconsById[bomb.id] ?? DEFAULT_ICON;
  return (
    <Image
      src={bombIconUrl(iconType)}
      alt=""
      width={size}
      height={size}
      className="shrink-0"
    />
  );
}

/** Beyond this the icons stop being countable and start being wallpaper. */
const MAX_ICONS = 12;

/**
 * One icon per bomb carried, repeated by count.
 *
 * Drawing them individually is the point: eight small bombs beside one big one
 * shows why the small ones win a base, which a line of text never manages.
 */
export function BombRow({
  bomb,
  count,
  size = 28,
  max = MAX_ICONS,
}: {
  bomb: BombLike;
  count: number;
  size?: number;
  max?: number;
}) {
  const shown = Math.min(count, max);

  return (
    <div className="flex items-center gap-1 flex-wrap" title={bomb.fullName}>
      {Array.from({ length: shown }, (_, i) => (
        <BombIcon key={i} bomb={bomb} size={size} />
      ))}
      {count > shown ? (
        <span
          className={cn("nums text-ink-faint self-center pl-1", size < 24 ? "text-xs" : "text-sm")}
        >
          +{count - shown}
        </span>
      ) : null}
    </div>
  );
}
