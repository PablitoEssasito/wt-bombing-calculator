import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import aircraftData from "../../data/aircraft.json";
import armamentData from "../../data/armament.json";
import statsData from "../../data/armament-stats.json";
import modelData from "../../data/base-damage-model.json";
import bombIconData from "../../data/bomb-icons.json";
import bombData from "../../data/bombs.json";
import carrierData from "../../data/carriers.json";
import otherCarrierData from "../../data/other-carriers.json";
import { zoneDamage, type BaseDamageModel } from "../../domain/base-damage";
import { presetIcons, type PresetIcon } from "../../domain/preset-icons";
import type { Aircraft, Bomb, WeaponStats } from "../../domain/types";

/**
 * The data files are written by separate imports (`npm run data` runs them in
 * order), and each reads what the one before it wrote. Run one without the
 * rest and the files quietly disagree — the guided bombs once went on being
 * drawn as plain ones because bomb-icons.json predated a change to
 * armament.json. These pin the files to each other.
 */

const bombs = bombData as Bomb[];
const ids = new Set(bombs.map((bomb) => bomb.id));

type CompactArmament = {
  stores: { b?: [string, number] }[];
  units: Record<string, { slots: { o: { i?: string; w: number | [number, number][] }[] }[] }>;
};
const armament = armamentData as unknown as CompactArmament;

describe("every file names only the armament table's rows", () => {
  it("the loadout creator's stores", () => {
    const named = armament.stores.flatMap((store) => (store.b ? [store.b[0]] : []));
    expect(named.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("the sheet's loadouts", () => {
    const named = (aircraftData as Aircraft[]).flatMap((plane) =>
      plane.options.flatMap((option) =>
        option.schedules.flatMap((schedule) => schedule.bases.flatMap((base) => base.items.map((item) => item.bombId))),
      ),
    );
    expect(named.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("the carriers, the weapon figures and the icons", () => {
    for (const file of [carrierData, otherCarrierData, statsData, bombIconData]) {
      expect(Object.keys(file).filter((id) => !ids.has(id))).toEqual([]);
    }
  });
});

describe("bomb-icons.json", () => {
  it("draws each bomb as the loadout menus in armament.json vote — imported after it, not before", () => {
    const presets: PresetIcon[] = Object.values(armament.units).flatMap((unit) =>
      unit.slots.flatMap((slot) =>
        slot.o.flatMap((option) => {
          if (!option.i) return [];
          const refs = typeof option.w === "number" ? [option.w] : option.w.map(([index]) => index);
          const bombIds = refs.map((index) => armament.stores[index]?.b?.[0]);
          return bombIds.every((id): id is string => id !== undefined) ? [{ iconType: option.i, bombIds }] : [];
        }),
      ),
    );
    // Every icon the import could have picked has been downloaded.
    const known = new Set(
      readdirSync(path.join(process.cwd(), "public", "bombs", "icons")).map((file) => file.replace(/\.webp$/, "")),
    );
    const voted = presetIcons(presets, known, new Map(bombs.map((bomb) => [bomb.id, bomb.kind])));
    expect(voted.size).toBeGreaterThan(200);
    const icons = bombIconData as Record<string, string>;
    const stale = [...voted].filter(([id, icon]) => icons[id] !== icon).map(([id, icon]) => `${id}: ${icons[id]} → ${icon}`);
    expect(stale).toEqual([]);
  });
});

describe("base-damage-model.json", () => {
  it("gives back every price the game states, from the same import's TNT figures", () => {
    const stats = statsData as unknown as Record<string, WeaponStats>;
    const model = modelData as BaseDamageModel;
    // The tooltip leaves the TNT figure out for TNT itself: then it is the charge.
    const tntOf = (s: WeaponStats | undefined) => s?.tntKg ?? (s?.explosiveType === "tnt" ? s.explosiveMassKg : undefined);
    const priced = bombs.filter((bomb) => bomb.damageSource === "game" && bomb.damageValue !== null && tntOf(stats[bomb.id]) !== undefined);
    expect(priced.length).toBeGreaterThan(250);
    const off = priced
      .map((bomb) => ({ id: bomb.id, game: bomb.damageValue!, model: zoneDamage(tntOf(stats[bomb.id])!, model) }))
      .filter(({ game, model }) => Math.abs(game - model) > 1);
    expect(off).toEqual([]);
  });
});
