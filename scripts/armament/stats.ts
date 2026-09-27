import { readCurve, type Curve } from "../../src/domain/base-damage";
import type { WeaponStats } from "../../src/domain/types";

/**
 * A weapon's own figures, read off its file the way the game's weapon tooltip
 * reads them (`gui/scripts/weaponry/weaponryinfo.nut`, the block that fills
 * `item` from `itemBlk`, and `dmgmodel.nut` for the explosion), so what the
 * armament pages show is what the hangar shows.
 */

/** What the tooltip treats a store as, which decides the figures it shows. */
export type Category = "bomb" | "guidedBomb" | "rocket" | "agm" | "aam" | "torpedo" | "mine" | "gun";

/** explosive.blk, as far as it is read here. */
export type Explosives = {
  types: Record<string, { strengthEquivalent?: number; brisanceEquivalent?: number }>;
  splash: { penetration: Curve; innerRadius: Curve; outerRadius: Curve };
  /** In the game's own order: the first whose `fillingRatio` a store is under decides. */
  shatters: { fillingRatio: number; radius: Curve }[];
  /** Armour thickness a destruction radius is quoted against; the game's default is 50 mm. */
  destructionArmor: number;
  /** Nuclear yield (kt) → damage to a bombing base, `yieldToExplosionParameters`. */
  nuclearDamage: Curve;
};

type Blk = Record<string, unknown>;
const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const block = (value: unknown): Blk | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Blk) : undefined;
const point = (value: unknown): [number, number] | undefined =>
  Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === "number")
    ? (value as [number, number])
    : undefined;

/** A p2 block as the JSON datamine writes it: `{ p0: [x, y], … }`, a repeated key as an array of pairs. */
export function curveOf(value: unknown): Curve {
  const blk = block(value);
  if (!blk) return [];
  return Object.values(blk).flatMap((entry) => {
    const single = point(entry);
    if (single) return [single];
    return Array.isArray(entry) ? entry.flatMap((e) => (point(e) ? [point(e)!] : [])) : [];
  });
}

/** Reads the parts of explosive.blkx the tooltip uses. */
export function explosivesOf(blk: Blk): Explosives {
  const splash = block(blk.explosiveTypeToSplashParams) ?? {};
  const shatters = block(blk.explosiveTypeToShattersParams) ?? {};
  const yields = block(blk.yieldToExplosionParameters) ?? {};
  return {
    types: (block(blk.explosiveTypes) ?? {}) as Explosives["types"],
    splash: {
      penetration: curveOf(splash.explosiveMassToPenetration),
      innerRadius: curveOf(splash.explosiveMassToInnerRadius),
      outerRadius: curveOf(splash.explosiveMassToOuterRadius),
    },
    shatters: Object.values(shatters).flatMap((entry) => {
      const b = block(entry);
      return b ? [{ fillingRatio: num(b.fillingRatio) ?? 0, radius: curveOf(b.explosiveMassToRadius) }] : [];
    }),
    destructionArmor: num(blk.penetrationToCalcDestructionRadius) ?? 50,
    nuclearDamage: Object.values(yields).flatMap((entry) => {
      const b = block(entry);
      const kt = num(b?.yield);
      const damage = num(b?.damage);
      return kt !== undefined && damage !== undefined ? [[kt, damage] as [number, number]] : [];
    }),
  };
}

/** The round itself inside a weapon file: a bomb, a rocket, a torpedo, a gun's first bullet. */
export function payloadOf(body: Blk): Blk | undefined {
  return block(body.bomb) ?? block(body.rocket) ?? block(body.torpedo) ?? block([body.bullet].flat()[0]);
}

/** TNT equivalent the way the game works it out (`getTntEquivalentDmg`). */
export function tntOf(payload: Blk | undefined, explosives: Explosives): number | undefined {
  const type = payload?.explosiveType;
  const mass = num(payload?.explosiveMass);
  if (typeof type !== "string" || !mass) return undefined;
  const strength = explosives.types[type]?.strengthEquivalent;
  return strength === undefined ? undefined : mass * strength;
}

/**
 * The guidance key the game looks its label up by (`missile/guidance/<key>`):
 * the seeker, then `+IOG` for inertial navigation, `+GNSS` where that drifts
 * not at all, `+DL` for a data link — "tv+IOG+GNSS" for the KD-88.
 */
export function guidanceOf(payload: Blk): string | undefined {
  let key = typeof payload.guidanceType === "string" ? payload.guidanceType : undefined;
  const guidance = block(payload.guidance);
  if (!guidance) return key;

  if (block(guidance.lineOfSightAutopilot) && guidance.beamRider) key = "beamRiding";
  const seeker = block(guidance.opticalSeeker) ?? block(guidance.opticalFlowSeeker);
  if (seeker) key = (seeker.targetSignatureType ?? "infraRed") === "optic" ? "tv" : "ir";
  const radar = block(guidance.radarSeeker);
  if (radar) {
    const active = radar.active ?? true;
    const semiActive = radar.semiActive ?? !(radar.active ?? false);
    key = active ? (semiActive ? "SARH" : "ARH") : "PRH";
  }
  if (key && guidance.inertialNavigation) {
    const inertial = block(guidance.inertialGuidance);
    key += "+IOG";
    if (guidance.inertialNavigationDriftSpeed === 0 || inertial?.inertialNavigationDriftSpeed === 0) key += "+GNSS";
    if (guidance.datalink != null || inertial?.datalink != null) key += "+DL";
  }
  return key;
}

/** What the tooltip calls a rocket's or missile's warhead. */
function warheadOf(payload: Blk): WeaponStats["warhead"] {
  const kinetic = payload.armorpower != null || payload.penetrationBySpeed === true;
  if (payload.strikingPart != null) return "multidart";
  if (payload.smokeShell === true) return "smoke";
  if (block(payload.cumulativeDamage)?.armorPower != null) {
    return block(payload.kineticDamage)?.damageType === "tandemPrecharge" ? "tandem" : "heat";
  }
  if (payload.explosiveType != null) return kinetic ? "aphe" : "he";
  return kinetic ? "ap" : undefined;
}

/** Armour penetration and destruction radii of a bomb's blast (`getDestructionInfoTexts`). */
function destructionOf(payload: Blk, explosives: Explosives): Partial<WeaponStats> {
  const type = payload.explosiveType;
  const mass = num(payload.explosiveMass);
  if (typeof type !== "string" || !mass || !explosives.types[type]) return {};
  const tnt = mass * (explosives.types[type].strengthEquivalent ?? 0);
  const out: Partial<WeaponStats> = {};
  if (tnt) {
    const penetration = readCurve(explosives.splash.penetration, tnt);
    const inner = readCurve(explosives.splash.innerRadius, tnt);
    const outer = readCurve(explosives.splash.outerRadius, tnt);
    if (penetration) out.blastPenetrationMm = penetration;
    const armor = explosives.destructionArmor;
    if (penetration >= armor) out.destroyRadiusArmoredM = inner + ((outer - inner) * (penetration - armor)) / penetration;
  }
  const bodyMass = num(payload.mass);
  const filling = bodyMass ? mass / bodyMass : 1;
  const brisance = mass * (explosives.types[type].brisanceEquivalent ?? 0);
  if (brisance) {
    const shatters = explosives.shatters.find((s) => filling <= s.fillingRatio);
    const radius = shatters ? readCurve(shatters.radius, brisance) : 0;
    if (radius > 0) out.destroyRadiusUnarmoredM = radius;
  }
  return out;
}

/** Everything the tooltip shows for one round, in the game's own units (kg, m, m/s, s). */
export function statsOf(body: Blk, category: Category, explosives: Explosives): WeaponStats {
  const payload = payloadOf(body) ?? {};
  const stats: WeaponStats = {};
  const set = <K extends keyof WeaponStats>(key: K, value: WeaponStats[K] | undefined) => {
    if (value !== undefined && value !== 0) stats[key] = value;
  };

  set("massKg", num(block(body.payload)?.mass) ?? num(payload.mass));
  set("massLbs", num(block(body.payload)?.mass_lbs) ?? num(payload.mass_lbs));
  if (category === "gun") {
    const caliber = num(payload.caliber);
    set("caliberMm", caliber ? Math.round(caliber * 1000 * 10) / 10 : undefined);
    const shotFreq = num(body.shotFreq);
    set("fireRate", shotFreq ? Math.round(shotFreq * 60) : undefined);
    return stats;
  }

  if (["rocket", "agm", "aam", "guidedBomb"].includes(category)) {
    set("machMax", num(payload.machMax));
    if (!stats.machMax) set("maxSpeedMs", num(payload.maxSpeed) || num(payload.endSpeed));
    set("guaranteedRangeM", num(payload.guaranteedRange));
    if (payload.hasProximityFuse) set("proximityFuseM", num(block(payload.proximityFuse)?.radius));

    if (payload.operated === true) {
      stats.aiming = payload.autoAiming ? (payload.isBeamRider ? "beamRiding" : "semiautomatic") : "manual";
    } else {
      set("guidance", guidanceOf(payload));
    }
    set("launchRangeM", num(payload.rangeMax));
    set("timeLifeS", num(payload.timeLife));

    const seeker = block(block(payload.guidance)?.opticalSeeker);
    const rear = num(seeker?.rangeBand0) ?? 0;
    const all = num(seeker?.rangeBand1) ?? 0;
    if (category === "aam" && seeker) {
      set("seekerRangeRearM", rear);
      set("seekerRangeAllM", all);
      if (rear > 0 || all > 0) stats.allAspect = all >= 1000;
    } else if (category === "agm" && seeker?.groundVehiclesAsTarget && (rear > 0 || all > 0)) {
      set("seekerRangeM", Math.min(rear, all));
    }
    const radar = block(block(payload.guidance)?.radarSeeker);
    set("seekerRangeM", num(block(radar?.receiver)?.range));
    if (category === "aam") set("loadFactorMax", num(payload.loadFactorMax));
    if (category === "agm") set("operatedDistM", num(payload.operatedDist));
    if (category === "agm" || category === "rocket") set("warhead", warheadOf(payload));
  }

  if (category === "torpedo") {
    set("speedInWaterMs", num(payload.maxSpeedInWater));
    set("distToLiveM", num(payload.distToLive));
    set("diveDepthM", num(payload.diveDepth));
    const speed = point(payload.dropSpeedRange);
    if (speed && (speed[0] || speed[1])) stats.dropSpeedRange = speed;
    const height = point(payload.dropHeightRange);
    if (height && (height[0] || height[1])) stats.dropHeightRange = height;
  }
  if (category !== "bomb" && category !== "mine") set("armDistanceM", num(payload.armDistance));
  set("penetrationMm", num(block(payload.cumulativeDamage)?.armorPower));

  const yieldKt = num(payload.yield);
  if (yieldKt) {
    stats.nuclearYieldKt = yieldKt;
    return stats;
  }
  if (typeof payload.explosiveType === "string") {
    stats.explosiveType = payload.explosiveType;
    set("explosiveMassKg", num(payload.explosiveMass));
    // The tooltip leaves the TNT figure out for a fire bomb, and for TNT itself.
    if (payload.fireDamage == null && payload.explosiveType !== "tnt") set("tntKg", tntOf(payload, explosives));
    if ((category === "bomb" || category === "guidedBomb") && payload.fireDamage == null) {
      Object.assign(stats, destructionOf(payload, explosives));
    }
  }
  return stats;
}
