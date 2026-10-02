import type { Bomb } from "./types";
import { BOMB_TYPES, WARHEADS, WEAPON_CATEGORIES, type WeaponCategory, type WeaponTag } from "./weapon-tags";

/**
 * A sheet row as the sheet printed it — undoing what an import overruled with
 * the game's figures (`sheet`). What the import matches against, so it never
 * steers by its own last answer, and what the planner compares a plan with.
 */
export function sheetView(bomb: Bomb): Bomb {
  const row: Bomb = { ...bomb, ...bomb.sheet };
  delete row.sheet;
  delete row.damageSource;
  delete row.guidance;
  delete row.category;
  delete row.tags;
  delete row.aliasOf;
  return row;
}

/**
 * Whether a weapon gets a row in the armament chart, and a page, at all.
 *
 * Everything the game's own files catalogue does — an air-to-air missile or
 * a gun pod has figures worth showing even with nothing to do to a base. Not
 * a sheet row standing in for a weapon the game has under the same name
 * (`aliasOf`), which is that weapon's row twice, nor one the game has no file
 * for at all, which has nothing to show.
 */
export const inArmamentChart = (bomb: Pick<Bomb, "damageValue" | "kind" | "source" | "aliasOf">) =>
  !bomb.aliasOf && (bomb.damageValue !== null || bomb.kind === "ROCKET" || bomb.source === "game");

/**
 * A row as the armament chart is handed it: the figures its columns show and
 * nothing more, so the page does not ship every record whole. The extra
 * columns come off the weapon's own file, their labels already in the page's
 * language.
 */
export type ChartRow = Pick<
  Bomb,
  | "id"
  | "chartName"
  | "fullName"
  | "kind"
  | "guidance"
  | "nation"
  | "massKg"
  | "massLabel"
  | "tntKg"
  | "damageValue"
  | "damageSource"
  | "efficiency"
  | "usedByNations"
> & {
  category: WeaponCategory;
  tags: WeaponTag[];
  launchRangeM?: number;
  /** Lock range as the tooltip gives it: a radar's, or an IR seeker's from behind. */
  seekerRangeM?: number;
  machMax?: number;
  maxSpeedMs?: number;
  loadFactorMax?: number;
  /** How long it steers for — a guided weapon's only, not an unguided one's self-destruct time. */
  guidanceTimeS?: number;
  warhead?: string;
  explosive?: string;
  explosiveMassKg?: number;
};

/**
 * The armament chart's tabs: what can hit a base, everything air-to-ground,
 * each category of weapon on its own — nuclear bombs apart from the rest,
 * air-to-air missiles split by seeker, radar and IR — torpedoes on theirs,
 * mines, gun pods and a missile flown by hand together under other, or
 * everything.
 */
export const TABS = [
  "bases",
  "ground",
  "bomb",
  "rocket",
  "agm",
  "nuclear",
  "aamRadar",
  "aamIr",
  "torpedo",
  "other",
  "all",
] as const;
export type ChartTab = (typeof TABS)[number];

/**
 * The tabs as the page lays them out: two views of the whole first — what
 * brings a base down, everything — then the categories, broadest first. A
 * section with several tabs opens on its first, the one gathering the rest.
 */
export const SECTIONS = [
  { id: "bases", kind: "view", tabs: ["bases"] },
  { id: "all", kind: "view", tabs: ["all"] },
  { id: "ground", kind: "category", tabs: ["ground", "bomb", "rocket", "agm", "nuclear"] },
  { id: "air", kind: "category", tabs: ["aamRadar", "aamIr"] },
  { id: "torpedo", kind: "category", tabs: ["torpedo"] },
  { id: "other", kind: "category", tabs: ["other"] },
] as const satisfies readonly { id: string; kind: "view" | "category"; tabs: readonly ChartTab[] }[];
export type ChartSection = (typeof SECTIONS)[number];

/** The section a tab sits in. */
export const sectionOf = (tab: ChartTab): ChartSection =>
  SECTIONS.find((section) => (section.tabs as readonly ChartTab[]).includes(tab))!;

const GROUND: readonly WeaponCategory[] = ["bomb", "rocket", "agm"];

const RADAR_SEEKERS: readonly WeaponTag[] = ["sarh", "arh"];

/**
 * A nuclear weapon, as the game marks one in its name ("☢B61"): carried only by
 * a killstreak's own aircraft, never taken into an ordinary battle.
 */
export const isNuclear = (bomb: Pick<Bomb, "chartName">) => bomb.chartName.startsWith("☢");

/**
 * Whether a row belongs on a tab. "Against bases" is what an ordinary battle
 * can bring to one — so not a nuclear bomb, whose one-per-base would top the
 * list; it has a tab of its own.
 */
export function inTab(row: Pick<ChartRow, "category" | "damageValue" | "chartName" | "tags">, tab: ChartTab): boolean {
  const radar = row.category === "aam" && row.tags.some((tag) => RADAR_SEEKERS.includes(tag));
  const ir = row.category === "aam" && row.tags.includes("ir");
  switch (tab) {
    case "bases":
      return (row.damageValue ?? 0) > 0 && !isNuclear(row);
    case "ground":
      return GROUND.includes(row.category);
    case "bomb":
      return row.category === "bomb" && !isNuclear(row);
    case "nuclear":
      return isNuclear(row);
    case "aamRadar":
      return radar;
    case "aamIr":
      return ir;
    case "other":
      return ["mine", "gun"].includes(row.category) || (row.category === "aam" && !radar && !ir);
    case "all":
      return true;
    default:
      return row.category === tab;
  }
}

/**
 * What makes two weapons alike for "similar weapons": the same category, and
 * steered alike — a guided bomb beside guided bombs, not iron ones; a
 * nuclear bomb beside nuclear ones; an air-to-air missile beside those on its
 * own tab, radar or IR.
 */
export function familyOf(row: Pick<ChartRow, "category" | "damageValue" | "chartName" | "tags">): string {
  const steering =
    row.category === "aam"
      ? ((["aamRadar", "aamIr"] as const).find((tab) => inTab(row, tab)) ?? "other")
      : isNuclear(row)
        ? "nuclear"
        : row.tags.includes("unguided")
        ? "unguided"
        : "guided";
  return `${row.category}:${steering}`;
}

/**
 * One row of chips on a tab: the categories, or a family of tags. "any" for
 * values a weapon has one of (a seeker, a warhead) — a row with any ticked;
 * "all" for what it has besides (IOG, a data link, IRCCM) — every one ticked.
 */
export type FilterGroup = {
  id: "category" | "type" | "guidance" | "aspect" | "features" | "warhead";
  axis: "category" | "tag";
  values: readonly (WeaponCategory | WeaponTag)[];
  mode: "any" | "all";
};

const CATEGORY: FilterGroup = { id: "category", axis: "category", values: WEAPON_CATEGORIES, mode: "any" };
const TYPE: FilterGroup = { id: "type", axis: "tag", values: BOMB_TYPES, mode: "any" };
const GUIDANCE: FilterGroup = {
  id: "guidance",
  axis: "tag",
  values: ["unguided", "laser", "tv", "ir", "gnss", "sarh", "arh", "antiRadiation", "saclos", "beamRiding", "mclos"],
  mode: "any",
};
const RADAR_GUIDANCE: FilterGroup = { id: "guidance", axis: "tag", values: RADAR_SEEKERS, mode: "any" };
const ASPECT: FilterGroup = { id: "aspect", axis: "tag", values: ["rearAspect", "allAspect"], mode: "any" };
const FEATURES: FilterGroup = { id: "features", axis: "tag", values: ["iog", "gnssAid", "datalink", "irccm"], mode: "all" };
const RADAR_FEATURES: FilterGroup = { id: "features", axis: "tag", values: ["iog", "datalink", "gnssAid"], mode: "all" };
const IR_FEATURES: FilterGroup = { id: "features", axis: "tag", values: ["irccm", "iog", "datalink", "gnssAid"], mode: "all" };
const WARHEAD: FilterGroup = { id: "warhead", axis: "tag", values: WARHEADS, mode: "any" };

/** The chip rows each tab offers, in order. A chip shows only for a value that splits the tab's rows. */
export const TAB_GROUPS: Record<ChartTab, readonly FilterGroup[]> = {
  bases: [CATEGORY, GUIDANCE],
  ground: [CATEGORY, GUIDANCE],
  bomb: [TYPE, GUIDANCE, FEATURES],
  rocket: [GUIDANCE, WARHEAD],
  agm: [GUIDANCE, FEATURES, WARHEAD],
  nuclear: [],
  aamRadar: [RADAR_GUIDANCE, RADAR_FEATURES],
  aamIr: [ASPECT, IR_FEATURES],
  torpedo: [],
  other: [CATEGORY],
  all: [CATEGORY, GUIDANCE],
};

/** What a row has of a group's values: its category, or those of its tags the group lists. */
export function groupValues(row: Pick<ChartRow, "category" | "tags">, group: FilterGroup): string[] {
  if (group.axis === "category") return [row.category];
  return row.tags.filter((tag) => group.values.includes(tag));
}

/**
 * What a bomb counts for in the bombing reward: the game pays by its own
 * price (`weaponDamage`), and prices nothing it gives no figure for — so an
 * estimate from its explosion model, however well it predicts what the blast
 * does to a base, adds nothing to the reward multiplier.
 */
export const rewardDamageOf = (bomb: Pick<Bomb, "damageValue" | "damageSource">): number | null =>
  bomb.damageSource === "estimate" ? 0 : bomb.damageValue;
