import type { ChartRow } from "@/domain/bomb-chart";
import type { Bomb, WeaponStats } from "@/domain/types";

/** One weapon as the comparison gets it — see `/armament-data.json`. */
export type CompareRow = Pick<
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
> &
  Pick<ChartRow, "category" | "tags">;

/** Every paged weapon and its figures, fetched once by the comparison rather than shipped with every page. */
export type CompareData = { rows: CompareRow[]; stats: Record<string, WeaponStats> };

/** At most this many side by side: past it the columns stop fitting even a wide screen. */
export const MAX_COMPARED = 6;

/**
 * A weapon's figures in the groups, words and units the game's own weapon
 * tooltip uses (`weaponryinfo.nut`), so the pages read like the hangar does.
 * Pure, and free of the data files: the weapon page runs it on the server, the
 * comparison in the browser, each handing in its own way to word things.
 */

export type FigureGroup = "guidance" | "flight" | "warhead" | "blast";

export type FigureLine = {
  /** Which figure this is, the same for every weapon — what the comparison lines rows up by. */
  key: string;
  label: string;
  value: string;
  /** The number behind `value`, where there is one to compare. */
  raw: number | null;
  /** Which way is better, where one plainly is — more reach, more speed, more explosive. */
  better?: "higher";
};

export type FigureWords = {
  /** The game's own label for a lang key, e.g. "missile/launchRange" → "Launch range". */
  label: (key: string) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  groups: Record<FigureGroup, string>;
  fireRate: string;
  nuclearYield: string;
  /** What the tooltip writes beside a feature a weapon has, such as IRCCM. */
  yes: string;
};

export function figureGroups(stats: WeaponStats, words: FigureWords): { key: FigureGroup; title: string; lines: FigureLine[] }[] {
  const { label } = words;
  const n = (value: number, digits = 0) => words.number(value, { maximumFractionDigits: digits });
  const distance = (meters: number) => (meters >= 1000 ? `${n(meters / 1000, 1)} km` : `${n(meters, 1)} m`);
  const guided = Boolean(stats.guidance ?? stats.aiming);

  const lines: Record<FigureGroup, FigureLine[]> = { guidance: [], flight: [], warhead: [], blast: [] };
  const add = (
    group: FigureGroup,
    key: string,
    labelKey: string,
    raw: number | string | undefined,
    show: (value: never) => string,
    better?: "higher",
  ) => {
    if (raw === undefined) return;
    lines[group].push({
      key,
      label: label(labelKey),
      value: show(raw as never),
      raw: typeof raw === "number" ? raw : null,
      ...(better ? { better } : {}),
    });
  };

  add("guidance", "guidance", "missile/guidance", stats.guidance, (key: string) => label(`missile/guidance/${key}`));
  add("guidance", "aiming", "missile/guidance", stats.aiming, (key: string) => label(`missile/aiming/${key}`));
  if (stats.allAspect !== undefined) {
    lines.guidance.push({
      key: "aspect",
      label: label("missile/aspect"),
      value: label(stats.allAspect ? "missile/aspect/allAspect" : "missile/aspect/rearAspect"),
      raw: null,
    });
  }
  add("guidance", "seekerRangeM", "missile/seekerRange", stats.seekerRangeM, distance, "higher");
  add("guidance", "seekerRangeRearM", "missile/seekerRange/rearAspect", stats.seekerRangeRearM, distance, "higher");
  add("guidance", "seekerRangeAllM", "missile/seekerRange/allAspect", stats.seekerRangeAllM, distance, "higher");
  if (stats.irccm) lines.guidance.push({ key: "irccm", label: label("missile/irccm"), value: words.yes, raw: null });
  add("guidance", "launchRangeM", "missile/launchRange", stats.launchRangeM, distance, "higher");
  add("guidance", "guaranteedRangeM", "guaranteedRange", stats.guaranteedRangeM, distance);
  add("guidance", "operatedDistM", "firingRange", stats.operatedDistM, distance, "higher");
  add(
    "guidance",
    guided ? "guidanceTimeS" : "selfDestructS",
    guided ? "missile/timeGuidance" : "missile/timeSelfdestruction",
    stats.timeLifeS,
    (s: number) => `${n(s, 1)} s`,
    guided ? "higher" : undefined,
  );

  if (stats.machMax !== undefined) {
    // Mach to one decimal, as the tooltip writes it; for ranking, the same m/s scale as the rest.
    lines.flight.push({
      key: "speed",
      label: label("rocket/maxSpeed"),
      value: `${words.number(stats.machMax, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`,
      raw: stats.machMax * 343,
      better: "higher",
    });
  } else {
    add("flight", "speed", "rocket/maxSpeed", stats.maxSpeedMs, (v: number) => `${n(v)} m/s`, "higher");
  }
  add("flight", "loadFactorMax", "missile/loadFactorMax", stats.loadFactorMax, (g: number) => `${n(g)} G`, "higher");
  add("flight", "speedInWaterMs", "torpedo/maxSpeedInWater", stats.speedInWaterMs, (v: number) => `${n(v * 3.6)} km/h`, "higher");
  add("flight", "distToLiveM", "torpedo/distanceToLive", stats.distToLiveM, distance, "higher");
  add("flight", "diveDepthM", "bullet_properties/diveDepth", stats.diveDepthM, (v: number) => `${n(v, 1)} m`);
  if (stats.dropSpeedRange) {
    const [min, max] = stats.dropSpeedRange;
    lines.flight.push({
      key: "dropSpeedRange",
      label: label("weapons/drop_speed_range_text"),
      value: `${n(min * 3.6)}–${n(max * 3.6)} km/h`,
      raw: null,
    });
  }
  if (stats.dropHeightRange) {
    const [min, max] = stats.dropHeightRange;
    lines.flight.push({
      key: "dropHeightRange",
      label: label("weapons/drop_height_range_text"),
      value: `${n(min)}–${n(max)} m`,
      raw: null,
    });
  }
  add(
    "flight",
    "armDistanceM",
    stats.speedInWaterMs !== undefined ? "torpedo/armingDistance" : "missile/armingDistance",
    stats.armDistanceM,
    (v: number) => `${n(v)} m`,
  );
  add("flight", "proximityFuseM", "bullet_properties/proximityFuze/triggerRadius", stats.proximityFuseM, (v: number) => `${n(v, 1)} m`);

  add("warhead", "caliberMm", "bullet_properties/caliber", stats.caliberMm, (v: number) => `${n(v, 1)} mm`);
  if (stats.fireRate !== undefined) {
    lines.warhead.push({ key: "fireRate", label: words.fireRate, value: n(stats.fireRate), raw: stats.fireRate, better: "higher" });
  }
  add("warhead", "warhead", "rocket/warhead", stats.warhead, (key: string) => label(`rocket/warhead/${key}`));
  add("warhead", "explosiveType", "bullet_properties/explosiveType", stats.explosiveType, (key: string) => label(`explosiveType/${key}`));
  add("warhead", "explosiveMassKg", "bullet_properties/explosiveMass", stats.explosiveMassKg, (v: number) => `${n(v, 2)} kg`, "higher");
  add("warhead", "tntKg", "bullet_properties/explosiveMassInTNTEquivalent", stats.tntKg, (v: number) => `${n(v, 2)} kg`, "higher");
  add("warhead", "penetrationMm", "bullet_properties/armorPiercing", stats.penetrationMm, (v: number) => `${n(v)} mm`, "higher");
  if (stats.nuclearYieldKt !== undefined) {
    lines.warhead.push({
      key: "nuclearYieldKt",
      label: words.nuclearYield,
      value: `${n(stats.nuclearYieldKt)} kt`,
      raw: stats.nuclearYieldKt,
      better: "higher",
    });
  }

  add("blast", "blastPenetrationMm", "bombProperties/maxArmorPenetration", stats.blastPenetrationMm, (v: number) => `${n(v)} mm`, "higher");
  add("blast", "destroyRadiusArmoredM", "bombProperties/destroyRadiusArmored", stats.destroyRadiusArmoredM, (v: number) => `${n(v, 1)} m`, "higher");
  add("blast", "destroyRadiusUnarmoredM", "bombProperties/destroyRadiusNotArmored", stats.destroyRadiusUnarmoredM, (v: number) => `${n(v, 1)} m`, "higher");

  return (Object.keys(lines) as FigureGroup[])
    .map((key) => ({ key, title: words.groups[key], lines: lines[key] }))
    .filter((group) => group.lines.length > 0);
}

/** Every game lang key a weapon's figures can be labelled by — what a page hands the browser for them. */
export const FIGURE_LABEL_PREFIXES = [
  "missile/",
  "rocket/",
  "torpedo/",
  "weapons/drop_",
  "bullet_properties/",
  "bombProperties/",
  "explosiveType/",
  "guaranteedRange",
  "firingRange",
];
