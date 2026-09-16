/** How the game lets an aircraft carry its suspended ordnance. */
export type MountStyle = "pylons" | "setups";

export type PresetWeapon = {
  /** Weapon file basename, e.g. "su_fab100" — the join key to the bomb chart. */
  weapon: string;
  count: number;
};

export type Preset = {
  name: string;
  weapons: PresetWeapon[];
};

/** "Mounting X on this pylon rules out Y over there." */
export type Ban = {
  slot: number;
  preset: string;
  bansSlot: number;
  bansPreset: string;
};

export type Armament = {
  style: MountStyle;
  /** Suspended hardpoints, not counting the fixed guns the aircraft always carries. */
  slots: number;
  /** Ready-made loadouts the game offers, whether or not slots can also be edited. */
  presets: Preset[];
  maxLoadKg: number | null;
  /** Most an aircraft may hang under one wing, and how unevenly it may be split. */
  maxPerConsoleKg: number | null;
  maxDisbalanceKg: number | null;
  bans: Ban[];
};

type Blk = Record<string, unknown>;

/** Game data files repeat a key instead of holding an array when there is one of something. */
function many<T>(value: unknown): T[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]) as T[];
}

const basename = (blkPath: string) =>
  blkPath.split("/").pop()?.replace(/\.blk$/i, "").toLowerCase() ?? blkPath;

/**
 * Collapses a preset's weapon list into counts per weapon type.
 *
 * Entries come in two shapes. Older aircraft name the weapon file outright, once
 * per hardpoint, so four bombs are four entries. Newer ones name a slot and a
 * per-slot preset instead, which is what makes the custom loadout editor work;
 * those carry no weapon file here, so only the count is known and the name is
 * taken from the slot preset.
 */
function weaponsOf(entries: Blk[]): PresetWeapon[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const file = typeof entry.blk === "string" ? basename(entry.blk) : null;
    const name = file ?? (typeof entry.preset === "string" ? entry.preset : null);
    if (!name) continue;
    const count = typeof entry.bullets === "number" && file ? entry.bullets : 1;
    totals.set(name, (totals.get(name) ?? 0) + count);
  }
  return [...totals].map(([weapon, count]) => ({ weapon, count }));
}

/**
 * Reads an aircraft's flight model file for everything it says about what it can
 * carry underneath.
 *
 * Two blocks matter. `weapon_presets` lists the ready-made loadouts by name, and
 * is the whole story for an aircraft with no hardpoint editor — a Pe-8 takes one
 * of its six setups or nothing. `WeaponSlots` describes the hardpoints themselves:
 * what each one accepts, what the airframe will lift, and which choices rule each
 * other out. Nothing outside the game's own files states that last part.
 */
export function parseArmament(fm: Blk, presetFiles: Map<string, Blk>): Armament {
  const slotsBlock = fm.WeaponSlots as Blk | undefined;
  const slotList = many<Blk>(slotsBlock?.WeaponSlot);

  // Slot zero is the fixed armament — cannons that are part of the aircraft.
  const suspended = slotList.filter((slot) => Number(slot.index) > 0);

  const bans: Ban[] = [];
  for (const slot of suspended) {
    for (const preset of many<Blk>(slot.WeaponPreset)) {
      for (const banned of many<Blk>(preset.BannedWeaponPreset)) {
        bans.push({
          slot: Number(slot.index),
          preset: String(preset.name),
          bansSlot: Number(banned.slot),
          bansPreset: String(banned.preset),
        });
      }
    }
  }

  const presets: Preset[] = [];
  for (const entry of many<Blk>((fm.weapon_presets as Blk | undefined)?.preset)) {
    const body = presetFiles.get(String(entry.name));
    presets.push({
      name: String(entry.name),
      weapons: body ? weaponsOf(many<Blk>(body.Weapon)) : [],
    });
  }

  const num = (value: unknown) => (typeof value === "number" ? value : null);

  return {
    style: suspended.length > 0 ? "pylons" : "setups",
    slots: suspended.length,
    presets,
    maxLoadKg: num(slotsBlock?.maxloadMass),
    maxPerConsoleKg: num(slotsBlock?.maxloadMassLeftConsoles),
    maxDisbalanceKg: num(slotsBlock?.maxDisbalance),
    bans,
  };
}

/** Where a preset's own file lives, from the reference inside the flight model. */
export function presetPath(blkReference: string): string {
  return blkReference.replace(/^gameData\//i, "").toLowerCase().replace(/\.blk$/i, ".blkx");
}
