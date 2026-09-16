import { effectiveBaseHp } from "./base-hp";
import { BASE_BLEED, type BaseCount, type BaseHp, type GameMode } from "./constants";
import type { Bomb, LoadoutOption, Schedule } from "./types";

/**
 * Picks the schedule written for this base health, or the closest one below it.
 *
 * The source describes a loadout once per BR bracket it was written for, so an
 * exact match is the normal case; the fallback covers a player deliberately
 * looking at a bracket the sheet did not spell out.
 */
export function scheduleFor(option: LoadoutOption, baseHp: BaseHp): Schedule {
  const exact = option.schedules.find((s) => s.baseHp === baseHp);
  if (exact) return exact;
  const below = [...option.schedules].reverse().find((s) => s.baseHp <= baseHp);
  return below ?? option.schedules[0];
}

const MAX_RESPAWN_BASES = 16;

export type Conditions = {
  baseHp: BaseHp;
  mode: GameMode;
  baseCount: BaseCount;
};

export type PlanItem = { bomb: Bomb; count: number };

export type PlanBase = {
  items: PlanItem[];
  /** Damage delivered to this base, ignoring any ordnance we cannot price. */
  damage: number;
  destroys: boolean;
  /** True when the base carries ordnance the source gives no damage value for. */
  hasUnpriced: boolean;
};

export type Plan = {
  bases: PlanBase[];
  /** Ordnance left over once no further base can be flattened. */
  leftover: PlanItem[];
  basesDestroyed: number;
  /**
   * "sheet" means these are the source's own hand-tuned numbers. "recomputed"
   * means conditions differ from what the source assumes and we redistributed
   * the same payload ourselves.
   */
  source: "sheet" | "recomputed";
  effectiveHp: number;
  /** Damage a single base actually has to take, once base bleed is allowed for. */
  threshold: number;
  /** Whether destroyed bases come back during the match. */
  respawns: boolean;
};

/** Bases respawn only in realistic and simulator battles on four-base maps. */
export function basesRespawn(mode: GameMode, baseCount: BaseCount): boolean {
  return mode === "rb" && baseCount === 4;
}

/** Everything the aircraft carries under this schedule, collapsed per bomb type. */
export function payloadOf(schedule: Schedule, lookup: Map<string, Bomb>): PlanItem[] {
  const totals = new Map<string, number>();
  for (const base of schedule.bases) {
    for (const item of base.items) {
      totals.set(item.bombId, (totals.get(item.bombId) ?? 0) + item.count);
    }
  }
  return [...totals]
    .flatMap(([id, count]) => {
      const bomb = lookup.get(id);
      return bomb ? [{ bomb, count }] : [];
    })
    .sort((a, b) => (b.bomb.damageValue ?? 0) - (a.bomb.damageValue ?? 0));
}

function measure(items: PlanItem[], threshold: number): PlanBase {
  let damage = 0;
  let hasUnpriced = false;
  for (const item of items) {
    if (item.bomb.damageValue === null) hasUnpriced = true;
    else damage += item.bomb.damageValue * item.count;
  }
  return { items, damage, destroys: damage >= threshold, hasUnpriced };
}

type Pool = { bomb: Bomb; count: number }[];

/**
 * Draws bombs from the pool until one base is flattened.
 *
 * Takes the heaviest bomb that still fits inside what is left to do, so the
 * payload is not squandered overkilling a base that is nearly down; when nothing
 * fits any more, the lightest bomb on hand finishes it off. Returns null — having
 * touched nothing — when the pool cannot cover a whole base.
 */
function drawOneBase(pool: Pool, threshold: number): PlanItem[] | null {
  const taken = new Map<string, number>();
  const draft = pool.map((entry) => ({ ...entry }));
  let remaining = threshold;

  while (remaining > 0) {
    const available = draft.filter((entry) => entry.count > 0 && entry.bomb.damageValue !== null);
    if (available.length === 0) return null;

    const fits = available.filter((entry) => entry.bomb.damageValue! <= remaining);
    const pick =
      fits.length > 0
        ? fits.reduce((best, e) => (e.bomb.damageValue! > best.bomb.damageValue! ? e : best))
        : available.reduce((best, e) => (e.bomb.damageValue! < best.bomb.damageValue! ? e : best));

    pick.count -= 1;
    taken.set(pick.bomb.id, (taken.get(pick.bomb.id) ?? 0) + 1);
    remaining -= pick.bomb.damageValue!;
  }

  // Commit the draw back to the caller's pool.
  for (const [index, entry] of draft.entries()) pool[index].count = entry.count;

  const byId = new Map(pool.map((entry) => [entry.bomb.id, entry.bomb]));
  return [...taken].map(([id, count]) => ({ bomb: byId.get(id)!, count }));
}

/**
 * Works out what to drop on each base for the conditions the player selected.
 *
 * Under the conditions the source assumes — realistic battles, four-base map, the
 * schedule's own BR bracket — its hand-tuned numbers are returned untouched: they
 * account for which loadouts the game actually offers, which nothing here can
 * know. Change the mode, the map or the bracket and the same payload is
 * redistributed against the new base health instead.
 */
export function buildPlan(
  schedule: Schedule,
  bombs: Map<string, Bomb>,
  conditions: Conditions,
): Plan {
  const effectiveHp = effectiveBaseHp(conditions.baseHp, conditions.mode, conditions.baseCount);
  const threshold = effectiveHp * BASE_BLEED;
  const respawns = basesRespawn(conditions.mode, conditions.baseCount);

  const isSourceCase =
    conditions.mode === "rb" &&
    conditions.baseCount === 4 &&
    conditions.baseHp === schedule.baseHp;

  if (isSourceCase) {
    const measured = schedule.bases.map((base) =>
      measure(
        base.items.flatMap((item) => {
          const bomb = bombs.get(item.bombId);
          return bomb ? [{ bomb, count: item.count }] : [];
        }),
        threshold,
      ),
    );

    /**
     * On this path the source's own count decides which bases come down, rather
     * than our arithmetic.
     *
     * The two disagree on a handful of schedules — the Lancaster I is told to put
     * three 1000-pounders on each base when two would do, so its spare base clears
     * the threshold without being counted. Re-deciding from damage alone would
     * contradict the figure shown beside it, and the author knows things the
     * damage column does not, such as what the bomb bay will actually release.
     * The damage on each base is still reported, so the difference stays visible.
     */
    const destroyed = schedule.basesDestroyed ?? measured.filter((b) => b.destroys).length;
    const bases = measured.map((base, i) => ({ ...base, destroys: i < destroyed }));

    return {
      bases,
      leftover: [],
      basesDestroyed: destroyed,
      source: "sheet",
      effectiveHp,
      threshold,
      respawns,
    };
  }

  const pool: Pool = payloadOf(schedule, bombs).map((item) => ({ ...item }));
  // Where bases come back, the only real limit is the payload. The cap is a
  // guard rail — the heaviest bomber in the source reaches eleven bases.
  const maxBases = respawns ? MAX_RESPAWN_BASES : conditions.baseCount;
  const bases: PlanBase[] = [];

  while (bases.length < maxBases) {
    const items = drawOneBase(pool, threshold);
    if (!items) break;
    bases.push(measure(items, threshold));
  }

  const leftover = pool.filter((entry) => entry.count > 0).map((entry) => ({ ...entry }));

  return {
    bases,
    leftover,
    basesDestroyed: bases.length,
    source: "recomputed",
    effectiveHp,
    threshold,
    respawns,
  };
}
