import type { Aircraft, Bomb, BombKind, LoadoutItem } from "../../src/domain/types";
import { normalizeBombName } from "../etl/aliases";

/**
 * The sheet's plans, each bomb swapped for the one the aircraft really hangs
 * in the game's files — the game decides, and nothing it doesn't have can be
 * in a plan.
 *
 * The sheet names bombs by its own chart's names, and two rows of one name
 * ("G.P.500", "Mk 77", "HVAR") or a near miss ("M8" for the Soviet M-8) put
 * the wrong weapon in a plan. So a bomb the aircraft cannot carry is replaced
 * by one it can: the same name, else the same kind of weapon nearest in mass
 * (the British Corsair's only 1000-pounder is the G.P. Mk.I, not the AN-M65A1
 * the sheet names). A bomb with no counterpart at all, by name or by kind and
 * mass, leaves the plan. A replaced item keeps the sheet's bomb in
 * `sheetBombId`, which is what the sheet's own figures are.
 *
 * A weapon the sheet's chart has no row for at all (`sheetName`, a missile
 * it never prices) is the one carried weapon going by that name. One the
 * aircraft hangs nothing of that name for — or several — leaves the plan and
 * is reported in `unplaced`, for the import to stop on.
 */
export function rebindPlans(
  aircraft: Aircraft[],
  bombs: Bomb[],
  carriedBy: (planeId: string) => ReadonlySet<string> | undefined,
): { aircraft: Aircraft[]; changes: string[]; unplaced: string[] } {
  const byId = new Map(bombs.map((bomb) => [bomb.id, bomb]));
  const changes: string[] = [];
  const unplaced: string[] = [];
  const nameOf = (bomb: Bomb) => bomb.chartName || bomb.fullName;

  const rebound = aircraft.map((plane) => {
    const carried = carriedBy(plane.id);
    const choices = [...(carried ?? [])].flatMap((id) => byId.get(id) ?? []);
    const seen = new Set<string>();

    /** A name the sheet's chart has no row for: the one carried weapon going by it, by its whole name else part of it. */
    const place = (item: LoadoutItem, name: string): LoadoutItem | null => {
      const wanted = normalizeBombName(name);
      let matches = choices.filter((choice) => keysOf(choice).includes(wanted));
      if (matches.length === 0 && wanted.length >= 3) {
        matches = choices.filter((choice) => keysOf(choice).some((key) => key.includes(wanted)));
      }
      if (matches.length !== 1) {
        const line = `${plane.name}: ${name}`;
        if (!unplaced.includes(line)) unplaced.push(line);
        return null;
      }
      const line = `${plane.name}: ${name} (no row in the sheet's chart) → ${nameOf(matches[0])}`;
      if (!seen.has(line)) changes.push(line);
      seen.add(line);
      return { bombId: matches[0].id, count: item.count };
    };

    const rebindItem = (item: LoadoutItem): LoadoutItem | null => {
      if (item.sheetName !== undefined) return place(item, item.sheetName);
      // No flight model read for it: nothing to hold the plan against.
      if (!carried) return item;
      const bomb = byId.get(item.bombId);
      const sheetBombId = item.sheetBombId ?? item.bombId;
      const note = (to: string) => {
        const line = `${plane.name}: ${bomb ? nameOf(bomb) : item.bombId} → ${to}`;
        if (!seen.has(line)) changes.push(line);
        seen.add(line);
      };
      if (!bomb) return item;
      if (bomb.aliasOf && byId.has(bomb.aliasOf)) {
        return { ...item, bombId: bomb.aliasOf, sheetBombId };
      }
      if (carried.has(bomb.id)) return item;
      const replacement = byName(bomb, choices) ?? byMass(bomb, choices);
      if (!replacement) {
        note("(not in the game — dropped)");
        return null;
      }
      note(nameOf(replacement));
      return { ...item, bombId: replacement.id, sheetBombId };
    };

    return {
      ...plane,
      options: plane.options.map((option) => ({
        ...option,
        schedules: option.schedules.map((schedule) => ({
          ...schedule,
          bases: schedule.bases.map((base) => ({
            ...base,
            items: base.items.flatMap((item) => rebindItem(item) ?? []),
          })),
        })),
      })),
    };
  });
  return { aircraft: rebound, changes, unplaced };
}

const keysOf = (bomb: Bomb) => [bomb.chartName, bomb.fullName].filter(Boolean).map(normalizeBombName);

/** A carried weapon going by the sheet's name, or with it inside its own ("M8" → "M-8", "130-2" → "Type 130-2"). */
function byName(bomb: Bomb, choices: Bomb[]): Bomb | null {
  const wanted = keysOf(bomb);
  const matches = choices.filter((choice) =>
    keysOf(choice).some((key) => wanted.some((w) => key === w || (w.length >= 3 && key.includes(w)))),
  );
  return closest(bomb, matches);
}

/** The families a bomb may be swapped within when no name fits. */
const FAMILY: Record<BombKind, string> = {
  GP: "bomb",
  AP: "bomb",
  DRAG: "bomb",
  INC: "incendiary",
  MINE: "mine",
  GNSS: "guided",
  LAS: "guided",
  TV: "guided",
  IR: "guided",
  RC: "guided",
  AGM: "guided",
  ROCKET: "rocket",
  AAM: "aam",
  TORPEDO: "torpedo",
  GUN: "gun",
  OTHER: "other",
};

/** How far a stand-in may weigh from the sheet's bomb: a 200 kg bomb for a 250 kg one, not a 60 kg one. */
const MASS_SLACK = 0.35;

const massOf = (bomb: Bomb) => bomb.massKg ?? bomb.sheet?.massKg ?? null;

/** The carried weapon of the same kind, else family, nearest in mass. */
function byMass(bomb: Bomb, choices: Bomb[]): Bomb | null {
  const mass = massOf(bomb);
  if (mass === null) return null;
  const near = choices.filter((choice) => {
    const other = massOf(choice);
    return other !== null && FAMILY[choice.kind] === FAMILY[bomb.kind] && Math.abs(other - mass) <= mass * MASS_SLACK;
  });
  return closest(bomb, near);
}

/** The same kind first, then the nearest mass, then the id — so a rerun picks the same one. */
function closest(bomb: Bomb, choices: Bomb[]): Bomb | null {
  const mass = massOf(bomb) ?? 0;
  return (
    [...choices].sort(
      (a, b) =>
        Number(b.kind === bomb.kind) - Number(a.kind === bomb.kind) ||
        Math.abs((massOf(a) ?? 0) - mass) - Math.abs((massOf(b) ?? 0) - mass) ||
        a.id.localeCompare(b.id),
    )[0] ?? null
  );
}
