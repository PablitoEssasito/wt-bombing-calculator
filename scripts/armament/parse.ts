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

/** What one hardpoint will take. */
export type Slot = {
  index: number;
  /** Named choices offered for this hardpoint, in the order the game lists them. */
  presets: string[];
  /** Choices the game does not put in the loadout menu. */
  hidden: string[];
};

/** A rule tying one hardpoint's choice to another's. */
export type Rule = {
  slot: number;
  preset: string;
  otherSlot: number;
  otherPreset: string;
};

export type Armament = {
  style: MountStyle;
  /**
   * The hardpoints, by their own index. Indices are sparse — the Hunter F58A
   * numbers its ten slots 1-5 and 8-12 — so this is the list, never a count.
   */
  slots: Slot[];
  /** Ready-made loadouts, whether or not the hardpoints can also be edited. */
  presets: Preset[];
  maxLoadKg: number | null;
  maxLeftKg: number | null;
  maxRightKg: number | null;
  maxDisbalanceKg: number | null;
  /**
   * "Mounting this rules that out."
   *
   * Read these as mutual whichever way round they are written. Four fifths are
   * stated once only, almost always from the bigger store towards the smaller one
   * it crowds out — the PBY-5 says its 500 lb bomb bars the neighbouring rack of
   * six 100-pounders and never says the reverse — so anything working out valid
   * combinations has to close them both ways or it will allow the pair whenever
   * the small store is chosen first.
   */
  bans: Rule[];
  /** "Mounting this brings that with it." */
  requires: Rule[];
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
 * per-slot preset instead, which is what makes the loadout editor work; those
 * carry no weapon file, so the slot preset's name stands in for it.
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

function rulesFrom(slots: Blk[], key: "BannedWeaponPreset" | "DependentWeaponPreset"): Rule[] {
  const rules: Rule[] = [];
  for (const slot of slots) {
    for (const preset of many<Blk>(slot.WeaponPreset)) {
      for (const other of many<Blk>(preset[key])) {
        rules.push({
          slot: Number(slot.index),
          preset: String(preset.name),
          otherSlot: Number(other.slot),
          otherPreset: String(other.preset),
        });
      }
    }
  }
  return rules;
}

/**
 * Reads an aircraft's flight model file for everything it says about what it can
 * carry underneath.
 *
 * Two blocks matter. `weapon_presets` lists the ready-made loadouts by name, and
 * is the whole story for an aircraft with no hardpoint editor — a Pe-8 takes one
 * of its six setups or nothing. `WeaponSlots` describes the hardpoints: what each
 * accepts, what the airframe will lift, and which choices rule each other out or
 * drag each other along. Nothing outside the game's own files states those last
 * two, which is the reason for reading them here rather than off the wiki.
 */
export function parseArmament(fm: Blk, presetFiles: Map<string, Blk>): Armament {
  const slotsBlock = fm.WeaponSlots as Blk | undefined;
  // Slot zero is the fixed armament — cannons that are part of the aircraft.
  const suspended = many<Blk>(slotsBlock?.WeaponSlot).filter((slot) => Number(slot.index) > 0);

  const slots: Slot[] = suspended.map((slot) => {
    const presets = many<Blk>(slot.WeaponPreset);
    return {
      index: Number(slot.index),
      presets: presets.map((p) => String(p.name)),
      hidden: presets.filter((p) => p.showInWeaponMenu === false).map((p) => String(p.name)),
    };
  });

  const presets: Preset[] = many<{ name: unknown }>(
    (fm.weapon_presets as Blk | undefined)?.preset,
  ).map((entry) => {
    const body = presetFiles.get(String(entry.name));
    return {
      name: String(entry.name),
      weapons: body ? weaponsOf(many<Blk>(body.Weapon)) : [],
    };
  });

  const num = (value: unknown) => (typeof value === "number" ? value : null);

  return {
    style: slots.length > 0 ? "pylons" : "setups",
    slots,
    presets,
    maxLoadKg: num(slotsBlock?.maxloadMass),
    maxLeftKg: num(slotsBlock?.maxloadMassLeftConsoles),
    maxRightKg: num(slotsBlock?.maxloadMassRightConsoles),
    maxDisbalanceKg: num(slotsBlock?.maxDisbalance),
    bans: rulesFrom(suspended, "BannedWeaponPreset"),
    requires: rulesFrom(suspended, "DependentWeaponPreset"),
  };
}

/** Where a preset's own file lives, from the reference inside the flight model. */
export function presetPath(blkReference: string): string {
  return blkReference.replace(/^gameData\//i, "").toLowerCase().replace(/\.blk$/i, ".blkx");
}
