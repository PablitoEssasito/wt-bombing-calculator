import type { Armament, SlotOption, Store, StoreKind } from "./loadout";

/**
 * The shipped hardpoint data (src/data/armament.json), written short because
 * it is the largest file there.
 *
 * `files` names each store once and everything else points at it by index; a
 * choice hanging one store once is written as a bare index rather than a pair.
 */
export type CompactArmament = {
  files: string[];
  stores: {
    n: string | null;
    s: string | null;
    kg: number | null;
    k: string;
    b?: [string, number];
    h?: number;
    i?: string;
  }[];
  units: Record<
    string,
    {
      max: number | null;
      left: number | null;
      right: number | null;
      diff: number | null;
      slots: { i: number; o: { n: string; w: number | [number, number][]; i?: string; m?: number }[] }[];
      bans: [number, string, number, string][];
      reqs: [number, string, number, string][];
    }
  >;
};

/**
 * One game unit's hardpoints, expanded into what src/domain/loadout.ts works
 * with — for the site's loadout creator and for the import, which holds the
 * sheet's plans to the same hardpoints. Null for a unit with none: an aircraft
 * that mounts fixed setups instead. `damageOf` prices a store by its file.
 */
export function decodeArmament(
  source: CompactArmament,
  unitId: string,
  damageOf: (file: string) => number | null,
): Armament | null {
  const unit = source.units[unitId];
  if (!unit) return null;

  const storeAt = (index: number): Store => {
    const raw = source.stores[index];
    return {
      name: raw.n ?? source.files[index],
      short: raw.s,
      massKg: raw.kg,
      kind: raw.k as StoreKind,
      bomb: raw.b ? { id: raw.b[0], count: raw.b[1] } : null,
      holds: raw.h ?? 1,
      iconType: raw.i ?? null,
      damage: damageOf(source.files[index]),
    };
  };

  const optionOf = (option: { n: string; w: number | [number, number][]; i?: string; m?: number }): SlotOption => ({
    name: option.n,
    stores:
      typeof option.w === "number"
        ? [{ store: storeAt(option.w), count: 1 }]
        : option.w.map(([index, count]) => ({ store: storeAt(index), count })),
    iconType: option.i ?? null,
    machLimit: option.m ?? null,
  });

  return {
    maxLoadKg: unit.max,
    perWingKg: unit.left,
    disbalanceKg: unit.diff,
    hardpoints: unit.slots.map((slot) => ({ index: slot.i, options: slot.o.map(optionOf) })),
    exclusions: unit.bans.map(([slot, option, otherSlot, otherOption]) => ({
      slot,
      option,
      otherSlot,
      otherOption,
    })),
    dependencies: unit.reqs.map(([slot, option, needsSlot, needsOption]) => ({
      slot,
      option,
      needsSlot,
      needsOption,
    })),
  };
}
