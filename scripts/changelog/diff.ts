import type { Aircraft, Bomb, ChangedField, ChangelogEntry, WeaponStats } from "../../src/domain/types";

/** An import's data: `stats` absent for one made before armament-stats.json existed. */
export type DataSnapshot = { aircraft: Aircraft[]; bombs: Bomb[]; stats?: Record<string, WeaponStats> };

/** The values a bomb row is priced by — a change to any is worth telling a player about. */
const BOMB_FIELDS = ["damageValue", "tntKg", "massKg"] as const satisfies readonly ChangedField[];

/** A weapon's own figures a player notices in battle: how far it reaches, how fast it flies, what it carries. */
const STAT_FIELDS = [
  "launchRangeM",
  "seekerRangeM",
  "machMax",
  "maxSpeedMs",
  "explosiveMassKg",
] as const satisfies readonly ChangedField[];

/**
 * Masses carry the sheet's unit conversions to eight places; a change nobody
 * could read is none. So figures compare to a tenth — a Mach number, shown to
 * two places, to a hundredth.
 */
const rounded = (value: number | null, field: ChangedField) =>
  value === null ? null : Math.round(value * (field === "machMax" ? 100 : 10));

const aircraftRef =(a: Aircraft) => ({ id: a.id, name: a.name, nation: a.nation });
const bombRef = (b: Bomb) => ({ id: b.id, name: b.fullName || b.chartName });

/**
 * What changed between two imports, keyed by id — or null when nothing did.
 *
 * Only what a player would act on: aircraft and bombs added or removed, a BR
 * moving, a loadout being rewritten, a bomb's damage, TNT or mass changing.
 * A loadout is compared whole, schedules and notes included, and reported as
 * rewritten rather than itemised; the aircraft's own page shows what it is now.
 */
export function diffData(
  before: DataSnapshot,
  after: DataSnapshot,
  label: Pick<ChangelogEntry, "date" | "gameVersion">,
): ChangelogEntry | null {
  const oldAircraft = new Map(before.aircraft.map((a) => [a.id, a]));
  const newAircraft = new Map(after.aircraft.map((a) => [a.id, a]));
  const oldBombs = new Map(before.bombs.map((b) => [b.id, b]));
  const newBombs = new Map(after.bombs.map((b) => [b.id, b]));

  const kept = after.aircraft.flatMap((a) => {
    const old = oldAircraft.get(a.id);
    return old ? [[old, a] as const] : [];
  });

  const entry: ChangelogEntry = {
    ...label,
    aircraft: {
      added: after.aircraft.filter((a) => !oldAircraft.has(a.id)).map(aircraftRef),
      removed: before.aircraft.filter((a) => !newAircraft.has(a.id)).map(aircraftRef),
      br: kept
        .filter(([old, a]) => old.br !== a.br)
        .map(([old, a]) => ({ ...aircraftRef(a), from: old.br, to: a.br })),
      loadouts: kept
        .filter(([old, a]) => JSON.stringify(old.options) !== JSON.stringify(a.options))
        .map(([, a]) => aircraftRef(a)),
    },
    bombs: {
      added: after.bombs.filter((b) => !oldBombs.has(b.id)).map(bombRef),
      removed: before.bombs.filter((b) => !newBombs.has(b.id)).map(bombRef),
      changed: after.bombs.flatMap((b) => {
        const old = oldBombs.get(b.id);
        if (!old) return [];
        const fields: ChangelogEntry["bombs"]["changed"][number]["fields"] = BOMB_FIELDS.filter(
          (f) => rounded(old[f], f) !== rounded(b[f], f),
        ).map((field) => ({ field, from: old[field], to: b[field] }));
        // Only where both imports read the weapon's file: a figure first read is not one that changed.
        const was = before.stats?.[b.id];
        const is = after.stats?.[b.id];
        if (was && is) {
          for (const field of STAT_FIELDS) {
            const from = was[field] ?? null;
            const to = is[field] ?? null;
            if (rounded(from, field) !== rounded(to, field)) fields.push({ field, from, to });
          }
        }
        return fields.length > 0 ? [{ ...bombRef(b), fields }] : [];
      }),
    },
  };

  return isEmpty(entry) ? null : entry;
}

const isEmpty = (entry: ChangelogEntry) =>
  Object.values(entry.aircraft).every((list) => list.length === 0) &&
  Object.values(entry.bombs).every((list) => list.length === 0);

/** Both lists, keyed by id; where both hold one, `pick` decides — null drops it. */
function mergeById<T extends { id: string }>(older: T[], newer: T[], pick: (o: T, n: T) => T | null = (_, n) => n) {
  const merged = new Map(older.map((item) => [item.id, item]));
  for (const item of newer) {
    const old = merged.get(item.id);
    const next = old ? pick(old, item) : item;
    if (next) merged.set(item.id, next);
    else merged.delete(item.id);
  }
  return [...merged.values()];
}

/**
 * Folds a second import into the entry of the same patch, so a patch keeps one
 * entry however many imports it takes. A value changed twice reads from its
 * first value to its last, and drops out if it ends where it started.
 */
export function mergeEntries(older: ChangelogEntry, newer: ChangelogEntry): ChangelogEntry | null {
  const merged: ChangelogEntry = {
    date: older.date,
    gameVersion: older.gameVersion,
    aircraft: {
      added: mergeById(older.aircraft.added, newer.aircraft.added),
      removed: mergeById(older.aircraft.removed, newer.aircraft.removed),
      br: mergeById(older.aircraft.br, newer.aircraft.br, (o, n) =>
        o.from === n.to ? null : { ...n, from: o.from },
      ),
      loadouts: mergeById(older.aircraft.loadouts, newer.aircraft.loadouts),
    },
    bombs: {
      added: mergeById(older.bombs.added, newer.bombs.added),
      removed: mergeById(older.bombs.removed, newer.bombs.removed),
      changed: mergeById(older.bombs.changed, newer.bombs.changed, (o, n) => {
        const fields = mergeById(
          o.fields.map((f) => ({ ...f, id: f.field })),
          n.fields.map((f) => ({ ...f, id: f.field })),
          (of, nf) => (rounded(of.from, of.field) === rounded(nf.to, nf.field) ? null : { ...nf, from: of.from }),
        ).map(({ field, from, to }) => ({ field, from, to }));
        return fields.length > 0 ? { ...n, fields } : null;
      }),
    },
  };
  return isEmpty(merged) ? null : merged;
}
