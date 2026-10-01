import type { BombKind, WeaponStats } from "./types";

/**
 * What the armament pages sort a weapon under, and the tags they filter it by —
 * every one read off the game's own file, the way its weapon tooltip reads it
 * (`gui/scripts/weaponry/weaponryinfo.nut`). Nothing here is guessed from a
 * name: imaging IR, cluster and glide bombs are not tagged because the game's
 * files never say so.
 */

export const WEAPON_CATEGORIES = ["bomb", "rocket", "agm", "aam", "torpedo", "mine", "gun"] as const;
export type WeaponCategory = (typeof WEAPON_CATEGORIES)[number];

export const WEAPON_TAGS = [
  // What a bomb is.
  "gp",
  "ap",
  "sap",
  "drag",
  "incendiary",
  "nuclear",
  // What steers it.
  "unguided",
  "laser",
  "tv",
  "ir",
  "gnss",
  "sarh",
  "arh",
  "antiRadiation",
  "saclos",
  "beamRiding",
  "mclos",
  // An IR seeker's aspect.
  "rearAspect",
  "allAspect",
  // What it has besides.
  "iog",
  "gnssAid",
  "datalink",
  "irccm",
  // A rocket's or missile's warhead ("ap" is shared with the bomb's).
  "he",
  "heat",
  "tandem",
  "aphe",
  "multidart",
  "smoke",
] as const;
export type WeaponTag = (typeof WEAPON_TAGS)[number];

/** What a bomb is — one of these to every bomb. */
export const BOMB_TYPES = ["gp", "ap", "sap", "drag", "incendiary", "nuclear"] as const satisfies readonly WeaponTag[];

/** A rocket's or missile's warhead, as the tooltip names it. */
export const WARHEADS = ["he", "heat", "tandem", "aphe", "ap", "multidart", "smoke"] as const satisfies readonly WeaponTag[];

/** What `tagsOf` reads of one round of the game's. */
export type RoundFacts = {
  /** The tooltip's own sort — a guided bomb is a bomb here. */
  category: WeaponCategory | "guidedBomb";
  stats: Pick<WeaponStats, "guidance" | "aiming" | "allAspect" | "irccm" | "warhead" | "nuclearYieldKt">;
  incendiary: boolean;
  drag: boolean;
  armourPiercing: "ap" | "sap" | null;
};

/** The seeker at the head of a guidance key ("laser+IOG+GNSS"). */
const SEEKERS: Record<string, WeaponTag> = {
  laser: "laser",
  tv: "tv",
  ir: "ir",
  sns: "gnss",
  SARH: "sarh",
  ARH: "arh",
  PRH: "antiRadiation",
  saclos: "saclos",
  beamRiding: "beamRiding",
  mclos: "mclos",
};

/** What follows the seeker in a guidance key. */
const AIDS: Record<string, WeaponTag> = { IOG: "iog", GNSS: "gnssAid", DL: "datalink" };

/** How a weapon flown by wire or radio is flown (`WeaponStats.aiming`). */
const AIMING: Record<NonNullable<WeaponStats["aiming"]>, WeaponTag> = {
  manual: "mclos",
  semiautomatic: "saclos",
  beamRiding: "beamRiding",
};

/** The category a round's own sort files it under. */
export const categoryOfRound = (category: RoundFacts["category"]): WeaponCategory =>
  category === "guidedBomb" ? "bomb" : category;

/** Every tag a round earns, in the order the filters list them. */
export function tagsOf(round: RoundFacts): WeaponTag[] {
  const { stats } = round;
  const category = categoryOfRound(round.category);
  if (category === "torpedo" || category === "mine" || category === "gun") return [];
  const tags: WeaponTag[] = [];

  if (category === "bomb") {
    if (stats.nuclearYieldKt) tags.push("nuclear");
    else if (round.incendiary) tags.push("incendiary");
    else if (round.drag) tags.push("drag");
    else tags.push(round.armourPiercing ?? "gp");
  }

  const [seeker, ...aids] = stats.guidance?.split("+") ?? [];
  if (stats.aiming) tags.push(AIMING[stats.aiming]);
  else if (seeker === undefined) tags.push("unguided");
  else if (SEEKERS[seeker]) tags.push(SEEKERS[seeker]);

  if (stats.allAspect !== undefined) tags.push(stats.allAspect ? "allAspect" : "rearAspect");
  for (const aid of aids) if (AIDS[aid]) tags.push(AIDS[aid]);
  if (stats.irccm) tags.push("irccm");
  if (stats.warhead) tags.push(stats.warhead);
  return tags;
}

/** A sheet row the game has no file for: its category by the sheet's kind. */
export function categoryOfKind(kind: BombKind): WeaponCategory {
  switch (kind) {
    case "ROCKET":
      return "rocket";
    case "AGM":
      return "agm";
    case "AAM":
      return "aam";
    case "TORPEDO":
      return "torpedo";
    case "MINE":
      return "mine";
    case "GUN":
      return "gun";
    default:
      return "bomb";
  }
}

const TAGS_OF_KIND: Partial<Record<BombKind, WeaponTag[]>> = {
  GP: ["gp", "unguided"],
  AP: ["ap", "unguided"],
  DRAG: ["drag", "unguided"],
  INC: ["incendiary", "unguided"],
  LAS: ["laser"],
  TV: ["tv"],
  IR: ["ir"],
  GNSS: ["gnss"],
  RC: ["mclos"],
  ROCKET: ["unguided"],
};

/** …and its tags, as far as the sheet's kind says anything at all. */
export const tagsOfKind = (kind: BombKind): WeaponTag[] => TAGS_OF_KIND[kind] ?? [];
