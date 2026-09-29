import { carriedWithin, type Armament } from "./loadout";

/**
 * Fitting one of the sheet's plans to what the aircraft can actually carry,
 * where it cannot carry it as written (scripts/armament puts the result in the
 * plan). Nothing here guesses: every answer comes from a search that looks at
 * every possibility it has to, and says so where it cannot.
 */

/** A count of one bomb, as a plan gives it. */
export type Rounds = { bombId: string; count: number };

/** Bases a load brings down, what goes on each, and what is left over. */
export type Split = { bases: Rounds[][]; leftover: Rounds[] };

/** How many states a search may have in all before it refuses rather than run for ever. */
const MAX_STATES = 200_000;

/** One entry per bomb, in a fixed order so every answer comes out the same way twice. */
function merged(load: readonly Rounds[], damageOf: (bombId: string) => number): Rounds[] {
  const totals = new Map<string, number>();
  for (const { bombId, count } of load) if (count > 0) totals.set(bombId, (totals.get(bombId) ?? 0) + count);
  return [...totals]
    .map(([bombId, count]) => ({ bombId, count }))
    .sort((a, b) => damageOf(b.bombId) - damageOf(a.bombId) || a.bombId.localeCompare(b.bombId));
}

const damageOfLoad = (load: readonly Rounds[], damageOf: (bombId: string) => number) =>
  load.reduce((sum, { bombId, count }) => sum + damageOf(bombId) * count, 0);

function statesOf(counts: readonly number[]): number {
  const states = counts.reduce((n, c) => n * (c + 1), 1);
  if (states > MAX_STATES) throw new Error(`A load of ${counts.join("/")} rounds is past what the search takes`);
  return states;
}

/**
 * The most bases `load` brings down, each taking at least `threshold`, and the
 * rounds on each — worked out exactly, over every way to share the rounds out,
 * not by filling one base after another: the greedy way can come up a base
 * short. No more than `cap` are counted, the rest being left over.
 *
 * A base is only ever given rounds it needs, none it could lose and still come
 * down — whatever it could spare does more good elsewhere, so nothing is lost
 * by it. Between two ways to the same count, the one whose next base is
 * brought down with the least to spare.
 */
export function splitIntoBases(
  load: readonly Rounds[],
  damageOf: (bombId: string) => number,
  threshold: number,
  cap: number,
): Split {
  const types = merged(load, damageOf);
  const damage = types.map((t) => damageOf(t.bombId));
  const counts = types.map((t) => t.count);
  statesOf(counts);

  type Best = { bases: number; first: number[] | null };
  const memo = new Map<string, Best>();
  const best = (left: number[]): Best => {
    const key = left.join(",");
    const known = memo.get(key);
    if (known) return known;
    let answer: Best = { bases: 0, first: null };
    let answerSpare = Infinity;
    if (left.reduce((sum, n, k) => sum + n * damage[k], 0) >= threshold) {
      const base = left.map(() => 0);
      const walk = (k: number, sum: number) => {
        if (k === left.length) {
          if (sum < threshold) return;
          // Only a base that needs every round it is given.
          if (base.some((n, j) => n > 0 && sum - damage[j] >= threshold)) return;
          const rest = best(left.map((n, j) => n - base[j]));
          const bases = 1 + rest.bases;
          const spare = sum - threshold;
          if (bases > answer.bases || (bases === answer.bases && spare < answerSpare)) {
            answer = { bases, first: [...base] };
            answerSpare = spare;
          }
          return;
        }
        for (let n = 0; n <= left[k]; n++) {
          base[k] = n;
          walk(k + 1, sum + n * damage[k]);
        }
        base[k] = 0;
      };
      walk(0, 0);
    }
    memo.set(key, answer);
    return answer;
  };

  const bases: Rounds[][] = [];
  let left = counts;
  for (let step = best(left); step.first && bases.length < cap; step = best(left)) {
    const taken = step.first;
    bases.push(types.flatMap((t, k) => (taken[k] > 0 ? [{ bombId: t.bombId, count: taken[k] }] : [])));
    left = left.map((n, k) => n - taken[k]);
  }
  const leftover = types.flatMap((t, k) => (left[k] > 0 ? [{ bombId: t.bombId, count: left[k] }] : []));
  return { bases, leftover };
}

/**
 * The part of `load` the aircraft's hardpoints carry exactly — no spare round,
 * nothing past the load limit, no two choices the game rules out together —
 * that brings down the most bases (no more than `cap`), and of those the one
 * that loses the least damage. Never a round the plan does not name, never
 * more of one than it names. Null where not one round of it can be hung.
 *
 * Every part of the load is a candidate. They are taken in order of damage
 * lost, so the first that hangs at each count of bases is the one that gives
 * up least; the search stops once nothing still to try could bring down more
 * bases than the best found. A search that gives up throws (`carriedWithin`).
 */
export function nearestCarried(
  armament: Armament,
  load: readonly Rounds[],
  standsIn: (bombId: string, forBombId: string) => boolean,
  damageOf: (bombId: string) => number,
  threshold: number,
  cap: number,
): { load: Rounds[]; split: Split } | null {
  const types = merged(load, damageOf);
  const damage = types.map((t) => damageOf(t.bombId));
  statesOf(types.map((t) => t.count));
  const total = damageOfLoad(types, damageOf);

  type State = { removed: number[]; lost: number; rounds: number };
  const keyOf = (removed: number[]) => removed.join(",");
  const order = (a: State, b: State) =>
    a.lost - b.lost || a.rounds - b.rounds || keyOf(a.removed).localeCompare(keyOf(b.removed));
  const queue: State[] = [{ removed: types.map(() => 0), lost: 0, rounds: 0 }];
  const seen = new Set([keyOf(queue[0].removed)]);
  let found: { load: Rounds[]; split: Split } | null = null;

  while (queue.length > 0) {
    let at = 0;
    for (let i = 1; i < queue.length; i++) if (order(queue[i], queue[at]) < 0) at = i;
    const { removed, lost, rounds } = queue.splice(at, 1)[0];

    // Nothing from here on keeps more damage, so nothing brings down more bases than this can.
    const reach = Math.min(cap, Math.floor((total - lost) / threshold));
    if (found && reach <= found.split.bases.length) break;

    const candidate = types.flatMap((t, k) =>
      t.count > removed[k] ? [{ bombId: t.bombId, count: t.count - removed[k] }] : [],
    );
    if (candidate.length > 0 && carriedWithin(armament, candidate, standsIn, true)) {
      const split = splitIntoBases(candidate, damageOf, threshold, cap);
      if (!found || split.bases.length > found.split.bases.length) found = { load: candidate, split };
    }

    types.forEach((t, k) => {
      if (removed[k] >= t.count) return;
      const next = removed.map((n, j) => (j === k ? n + 1 : n));
      const key = keyOf(next);
      if (seen.has(key)) return;
      seen.add(key);
      queue.push({ removed: next, lost: lost + damage[k], rounds: rounds + 1 });
    });
  }
  return found;
}

/**
 * Whether one of the game's fixed setups hangs every bomb of `load`, as many or
 * more. A variant counts for the bomb it is one of (`standsIn`) — the forged
 * FAB-100sv for the plain — but a setup's rounds go towards one of the load's
 * bombs, never to two alike: each bomb takes its own first, then what is left
 * of its variants.
 */
export function fitsSetup(
  setup: readonly Rounds[],
  load: readonly Rounds[],
  standsIn: (bombId: string, forBombId: string) => boolean,
): boolean {
  const spare = new Map<string, number>();
  for (const { bombId, count } of setup) spare.set(bombId, (spare.get(bombId) ?? 0) + count);
  const short = new Map<string, number>();
  for (const { bombId, count } of load) short.set(bombId, (short.get(bombId) ?? 0) + count);
  const take = (bombId: string, counts: (id: string) => boolean) => {
    for (const [id, n] of spare) {
      if (!counts(id)) continue;
      const used = Math.min(n, short.get(bombId)!);
      spare.set(id, n - used);
      short.set(bombId, short.get(bombId)! - used);
    }
  };
  for (const bombId of short.keys()) take(bombId, (id) => id === bombId);
  for (const bombId of short.keys()) take(bombId, (id) => id !== bombId && standsIn(id, bombId));
  return [...short.values()].every((n) => n <= 0);
}

/**
 * The game's fixed setup that brings down the most bases (no more than
 * `cap`), and of those the one nearest `load` in damage — for an aircraft that
 * takes whole setups only and none of which carries the plan as written. Null
 * where no setup hangs a bomb at all.
 *
 * `alternatives` are the other setups that bring down as many, nearest first,
 * so they can be offered beside it — none where that is no base at all.
 */
export function nearestSetup(
  setups: readonly (readonly Rounds[])[],
  load: readonly Rounds[],
  damageOf: (bombId: string) => number,
  threshold: number,
  cap: number,
): { load: Rounds[]; split: Split; alternatives: { load: Rounds[]; split: Split }[] } | null {
  const planned = damageOfLoad(load, damageOf);
  const ranked = setups
    .map((setup) => merged(setup, damageOf))
    .filter((rounds) => rounds.length > 0)
    .map((rounds, order) => ({
      load: rounds,
      split: splitIntoBases(rounds, damageOf, threshold, cap),
      gap: Math.abs(damageOfLoad(rounds, damageOf) - planned),
      order,
    }))
    .sort((a, b) => b.split.bases.length - a.split.bases.length || a.gap - b.gap || a.order - b.order);
  const [found, ...rest] = ranked;
  if (!found) return null;

  const same = (a: readonly Rounds[], b: readonly Rounds[]) =>
    a.length === b.length && a.every((r, i) => r.bombId === b[i].bombId && r.count === b[i].count);
  const alternatives: { load: Rounds[]; split: Split }[] = [];
  if (found.split.bases.length > 0) {
    for (const other of rest) {
      if (other.split.bases.length < found.split.bases.length) break;
      if ([found, ...alternatives].some((taken) => same(taken.load, other.load))) continue;
      alternatives.push({ load: other.load, split: other.split });
    }
  }
  return { load: found.load, split: found.split, alternatives };
}
