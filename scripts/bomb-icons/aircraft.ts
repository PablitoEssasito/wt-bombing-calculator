import { presetIcons, type PresetIcon } from "../../src/domain/preset-icons";

const many = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

/** A weapon file's name as the armament catalogue keys it: "us_500lb_anm64a1". */
const fileOf = (blk: string) => blk.split("/").pop()!.replace(/\.blkx?$/i, "").toLowerCase();

/**
 * Icons read by hand off in-game loadout menu screenshots (2026-09-24), for
 * bombs whose aircraft carries a weapon file the chart does not tie to them —
 * the Tu-95M hangs a FAB-1500M-54, the chart prices a FAB-1500M-46 — so none
 * of the three sources below can reach them. Each won over the derived icon.
 */
export const AIRCRAFT_ICON_OVERRIDES: Record<string, Record<string, string>> = {
  "britain-tornado-gr-4": { "pgm-2000": "guided_bomb_grey" }, // the PGM 2000/3 the sheet schedules
  "china-su-30mkk": { "fab-1500": "bombs_heavy_middle" },
  "ussr-tu-95m": { "fab-1500": "bombs_heavy_middle" },
  "israel-m-d-450b": { "mk-2": "napalm_small" },
  "israel-m-d-450b-29": { "mk-2": "napalm_small" },
  "israel-mystere-iva": { "mk-2": "napalm_small" },
  "japan-h8k3": { "navy-250-25": "bombs_large" },
  "usa-a-4b": { "mk-77": "napalm_middle" },
  "usa-av-8c": { "mk-77": "napalm_middle" },
  "usa-f-4j": { "mk-77": "napalm_small" },
  "usa-f-4s": { "mk-77": "napalm_small" },
  "usa-f-15a": { "gbu-8": "guided_bomb_green" },
};

/** The one part of a raw flight model this reads: the fixed presets of an aircraft with no pylons. */
export type RawUnit = {
  fm?: {
    weapon_presets?: {
      preset?: Many<{
        weaponConfig?: {
          Weapon?: Many<{ blk?: string; iconType?: string; tier?: Many<{ iconType?: string }> }>;
        };
      }>;
    };
  };
};
type Many<T> = T | T[];

/**
 * How one aircraft's own loadout menu draws each bomb it carries.
 *
 * The game states it three ways, and each aircraft uses whichever its files
 * are written in — checked against LEGION's sheet, which pictures every
 * loadout's menu row, and against the game itself where the two disagreed:
 *
 * 1. `slotPresets` — the pylon-by-pylon presets the loadout creator reads,
 *    each with its own icon.
 * 2. `weaponConfig` — an aircraft with fixed setups instead states an icon per
 *    weapon of each preset, or per column of its menu row.
 * 3. Where neither says, the menu falls back to the weapon file's own icon.
 *
 * The same bomb comes out a size apart from one aircraft to the next — the
 * AN-M65 is bombs_large on a B-29 and bombs_special on a PBJ-1J — which is why
 * no single icon per bomb can be right everywhere.
 */
export function aircraftIcons({
  slotPresets,
  raw,
  bombOfFile,
  iconOfFile,
  known,
  kinds,
}: {
  slotPresets: PresetIcon[];
  raw: RawUnit;
  bombOfFile: Map<string, string | undefined>;
  iconOfFile: Map<string, string | null>;
  known: Set<string>;
  kinds: Map<string, string>;
}): Map<string, string> {
  const configPresets: PresetIcon[] = [];
  for (const preset of many(raw.fm?.weapon_presets?.preset)) {
    for (const weapon of many(preset.weaponConfig?.Weapon)) {
      const bombId = weapon.blk ? bombOfFile.get(fileOf(weapon.blk)) : undefined;
      if (!bombId) continue;
      for (const iconType of [weapon.iconType, ...many(weapon.tier).map((t) => t.iconType)]) {
        if (iconType) configPresets.push({ iconType, bombIds: [bombId] });
      }
    }
  }

  const filePresets: PresetIcon[] = [];
  for (const [, blk] of JSON.stringify(raw).matchAll(/"([^"]*\/weapons\/[^"]+\.blk)"/gi)) {
    const bombId = bombOfFile.get(fileOf(blk));
    const iconType = iconOfFile.get(fileOf(blk));
    if (bombId && iconType) filePresets.push({ iconType, bombIds: [bombId] });
  }

  const icons = new Map<string, string>();
  for (const presets of [slotPresets, configPresets, filePresets]) {
    for (const [bombId, iconType] of presetIcons(presets, known, kinds)) {
      if (!icons.has(bombId)) icons.set(bombId, iconType);
    }
  }
  return icons;
}
