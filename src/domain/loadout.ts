import type { Bomb } from "./types";

/** The group the game's own loadout menu files a store under. */
export type StoreKind =
  | "bomb"
  | "mine"
  | "torpedo"
  | "rocket"
  | "missile"
  | "gun"
  | "tank"
  | "pod"
  | "countermeasure"
  | "other";

/** One thing that can hang from a hardpoint, as the game names it. */
export type Store = {
  name: string;
  /** The shorter name the game falls back on where space is tight. */
  short: string | null;
  massKg: number | null;
  kind: StoreKind;
  /**
   * What it delivers in bomb-chart terms, when the chart prices it.
   *
   * The count belongs to the store, not the choice: a triple rack is one store
   * holding three bombs, so this is what decides how much damage it does.
   */
  bomb: { id: string; count: number } | null;
  /**
   * Rounds inside once every rack and rail is opened — a twin R-60M rail is
   * two, a rocket pod nineteen, a bare bomb one. Set whether or not the chart
   * prices the contents, which `bomb` alone cannot tell you.
   */
  holds: number;
  /**
   * The game's own UI icon key, when this store has one of its own — every
   * missile and most guns do, a rack takes it from what it holds. Null for the
   * kinds the game draws with no per-weapon icon (fuel tanks, torpedoes).
   */
  iconType: string | null;
  /**
   * The damage the game prices this store at for the base-bombing reward
   * (`weaponDamage` in wpcost.blkx), whole rack included. Null for what it
   * doesn't count — guns, fuel, most missiles — which is 0 to the game.
   */
  damage: number | null;
};

export type SlotOption = {
  name: string;
  stores: { store: Store; count: number }[];
  /**
   * The icon the game's own loadout menu draws for this exact choice — stated
   * on the preset, not on any one store it hangs, and the one that actually
   * accounts for how many are mounted. A twin missile rail and a lone one off
   * the same file draw differently; only this field knows which. Null for the
   * ~2% of presets that state none, where a store's own `iconType` stands in.
   */
  iconType: string | null;
};

export type Hardpoint = {
  /** The game's own numbering, which is sparse — some aircraft skip indices. */
  index: number;
  options: SlotOption[];
};

/** "Choosing this here rules that out over there." */
export type Exclusion = {
  slot: number;
  option: string;
  otherSlot: number;
  otherOption: string;
};

/** "Choosing this here calls for that over there too." */
export type Dependency = {
  slot: number;
  option: string;
  needsSlot: number;
  needsOption: string;
};

export type Armament = {
  maxLoadKg: number | null;
  /** Stated by the game but not enforced here — see `violationsOf`. */
  perWingKg: number | null;
  disbalanceKg: number | null;
  hardpoints: Hardpoint[];
  exclusions: Exclusion[];
  /**
   * Pairings the game states but that this build never blocks on — see
   * `unmetIn`. Already filtered to ones resolving against a real choice on this
   * aircraft; 5.5% of the game's own rules do not, being copy-paste in the
   * source data, and are dropped before this ever sees them. What is left is
   * shown as a note, not enforced, because a dependency is directional in a way
   * an exclusion is not — nothing here can be sure the reverse should hold.
   */
  dependencies: Dependency[];
};

/** What each hardpoint is holding, by option name. An absent slot is empty. */
export type Build = ReadonlyMap<number, string>;

export type Violation =
  | { kind: "overweight"; kg: number; limitKg: number }
  | { kind: "excluded"; a: { slot: number; option: string }; b: { slot: number; option: string } };

export function optionAt(armament: Armament, slot: number, name: string): SlotOption | null {
  const hardpoint = armament.hardpoints.find((h) => h.index === slot);
  return hardpoint?.options.find((o) => o.name === name) ?? null;
}

/** What one choice adds to the aircraft. */
export function massOfOption(option: SlotOption): number {
  return option.stores.reduce((kg, entry) => kg + (entry.store.massKg ?? 0) * entry.count, 0);
}

export function massOf(build: Build, armament: Armament): number {
  let kg = 0;
  for (const [slot, name] of build) {
    const option = optionAt(armament, slot, name);
    if (option) kg += massOfOption(option);
  }
  return kg;
}

/**
 * Whether two choices can be carried together.
 *
 * Read in both directions whichever way the rule is written. Four fifths of them
 * are stated once only, always from the larger store towards the smaller one it
 * crowds out — the PBY-5 says its 500 lb bomb bars the neighbouring rack of six
 * 100-pounders and never says the reverse. Taking that literally would let the
 * pair through whenever the small one was chosen first.
 */
function clashes(
  exclusion: Exclusion,
  a: { slot: number; option: string },
  b: { slot: number; option: string },
): boolean {
  const matches = (x: { slot: number; option: string }, slot: number, option: string) =>
    x.slot === slot && x.option === option;
  return (
    (matches(a, exclusion.slot, exclusion.option) &&
      matches(b, exclusion.otherSlot, exclusion.otherOption)) ||
    (matches(b, exclusion.slot, exclusion.option) &&
      matches(a, exclusion.otherSlot, exclusion.otherOption))
  );
}

/** Why a hardpoint cannot take a choice right now. */
export type Blocker =
  | { reason: "weight"; overBy: number }
  | { reason: "clash"; withSlot: number; withOption: string };

/**
 * The choices this hardpoint cannot take, given everything else already hung,
 * and what stands in the way of each.
 *
 * This is what greys an entry out in the menu rather than letting it be picked
 * and then complained about — the two things stated firmly enough to enforce:
 * what the airframe lifts, and what rules out what. A dependency is not
 * enforced here; see `unmetIn`. The reason travels with the block so the menu
 * can say which other pylon is the problem instead of only that there is one.
 */
export function blockedIn(
  armament: Armament,
  build: Build,
  slot: number,
): ReadonlyMap<string, Blocker> {
  const blocked = new Map<string, Blocker>();
  const hardpoint = armament.hardpoints.find((h) => h.index === slot);
  if (!hardpoint) return blocked;

  const rest = new Map(build);
  rest.delete(slot);
  const carriedElsewhere = massOf(rest, armament);

  for (const option of hardpoint.options) {
    const total = carriedElsewhere + massOfOption(option);
    if (armament.maxLoadKg !== null && total > armament.maxLoadKg) {
      blocked.set(option.name, { reason: "weight", overBy: total - armament.maxLoadKg });
      continue;
    }

    const candidate = { slot, option: option.name };
    for (const [otherSlot, otherName] of build) {
      if (otherSlot === slot) continue;
      const other = { slot: otherSlot, option: otherName };
      if (armament.exclusions.some((rule) => clashes(rule, candidate, other))) {
        blocked.set(option.name, { reason: "clash", withSlot: otherSlot, withOption: otherName });
        break;
      }
    }
  }
  return blocked;
}

/** Dependencies the build states without meeting — shown, never blocked on. */
export function unmetIn(build: Build, armament: Armament): Dependency[] {
  return armament.dependencies.filter(
    (dep) => build.get(dep.slot) === dep.option && build.get(dep.needsSlot) !== dep.needsOption,
  );
}

/**
 * Everything wrong with a build.
 *
 * Only the two the game's files state plainly: what the airframe lifts, and which
 * choices rule each other out. The per-wing and balance limits are known numbers
 * but not checkable here — nothing in the flight model says which wing a
 * hardpoint is on, and guessing would block loadouts that are perfectly legal.
 */
export function violationsOf(build: Build, armament: Armament): Violation[] {
  const violations: Violation[] = [];

  const kg = massOf(build, armament);
  if (armament.maxLoadKg !== null && kg > armament.maxLoadKg) {
    violations.push({ kind: "overweight", kg, limitKg: armament.maxLoadKg });
  }

  const chosen = [...build].map(([slot, option]) => ({ slot, option }));
  for (let i = 0; i < chosen.length; i++) {
    for (let j = i + 1; j < chosen.length; j++) {
      if (armament.exclusions.some((rule) => clashes(rule, chosen[i], chosen[j]))) {
        violations.push({ kind: "excluded", a: chosen[i], b: chosen[j] });
      }
    }
  }
  return violations;
}

/** Bomb-chart entries this build delivers, collapsed per bomb. */
export function bombsIn(build: Build, armament: Armament): { bombId: string; count: number }[] {
  const totals = new Map<string, number>();
  for (const [slot, name] of build) {
    const option = optionAt(armament, slot, name);
    if (!option) continue;
    for (const entry of option.stores) {
      const bomb = entry.store.bomb;
      if (!bomb) continue;
      totals.set(bomb.id, (totals.get(bomb.id) ?? 0) + bomb.count * entry.count);
    }
  }
  return [...totals].map(([bombId, count]) => ({ bombId, count }));
}

/**
 * The damage the game prices a build at for the bombing reward — the sum of
 * each store's `weaponDamage` (`getWeaponDamage`, econWeaponUtils.nut), so
 * rockets and incendiaries count as they do in the game, and guns don't.
 */
export function weaponDamageOf(build: Build, armament: Armament): number {
  let damage = 0;
  for (const [slot, name] of build) {
    const option = optionAt(armament, slot, name);
    if (!option) continue;
    for (const entry of option.stores) damage += (entry.store.damage ?? 0) * entry.count;
  }
  return damage;
}

/**
 * Ordnance the chart would price if it listed it — everything else is not meant
 * to be. The same set `scripts/armament/stores.ts` lets through to the chart.
 */
const ORDNANCE = new Set<StoreKind>(["bomb", "mine", "torpedo", "rocket"]);

/**
 * Bombs carried that the chart does not price, so nothing here can count them:
 * those with no row at all, and those whose row has no damage to give — a
 * torpedo has a row for its figures, and nothing to do to a base.
 */
export function unpricedIn(
  build: Build,
  armament: Armament,
  isPriced: (bombId: string) => boolean = () => true,
): Store[] {
  const seen = new Map<string, Store>();
  for (const [slot, name] of build) {
    const option = optionAt(armament, slot, name);
    if (!option) continue;
    for (const { store } of option.stores) {
      if (ORDNANCE.has(store.kind) && (store.bomb === null || !isPriced(store.bomb.id))) seen.set(store.name, store);
    }
  }
  return [...seen.values()];
}

/** What a choice hangs, independent of what the hardpoint calls it. */
const contentsOf = (option: SlotOption) =>
  option.stores
    .map(({ store, count }) => `${store.name}×${count}`)
    .sort()
    .join("|");

/**
 * The choice on another hardpoint that hangs the same thing as this one — so a
 * bomb dragged from one pylon can land on another.
 *
 * The same name where the other hardpoint offers it, which is the usual case;
 * otherwise a choice carrying exactly the same stores in the same numbers,
 * since the game names the same bomb differently on an inner and an outer
 * station. Null when the other hardpoint can't hang it at all.
 */
export function equivalentOption(
  armament: Armament,
  fromSlot: number,
  optionName: string,
  toSlot: number,
): SlotOption | null {
  const source = optionAt(armament, fromSlot, optionName);
  const hardpoint = armament.hardpoints.find((h) => h.index === toSlot);
  if (!source || !hardpoint) return null;
  const sameName = hardpoint.options.find((o) => o.name === optionName);
  if (sameName) return sameName;
  const contents = contentsOf(source);
  return hardpoint.options.find((o) => contentsOf(o) === contents) ?? null;
}

/** A choice being dragged: out of a hardpoint's menu, or off a pylon it hangs on. */
export type DragSource = { from: "menu" | "pylon"; slot: number; option: string };

/** Where it is let go: on a pylon, off the aircraft, or onto every pylon that takes it. */
export type DropTarget = { to: "pylon"; slot: number } | { to: "remove" } | { to: "all" };

export type DropResult = {
  build: Build;
  /** Choices the drop took off the aircraft, so the change can be undone knowingly. */
  displaced: { slot: number; option: string }[];
};

/** Whether every changed hardpoint holds something the rest of the build allows. */
const allowed = (armament: Armament, build: Build, slots: number[]) =>
  slots.every((slot) => {
    const name = build.get(slot);
    return name === undefined || !blockedIn(armament, build, slot).has(name);
  });

/**
 * The build a drop leaves behind, or null when the drop isn't allowed.
 *
 * Held to the same two rules the menu enforces (`blockedIn`): the load limit
 * and what rules out what. A pylon-to-pylon drop onto an occupied pylon swaps
 * the two when each can take the other's choice, and otherwise replaces it —
 * the replaced choice comes back in `displaced`. "All" fills every empty pylon
 * that can take the choice, in the game's order, skipping any the rules bar.
 */
export function applyDrop(
  build: Build,
  armament: Armament,
  source: DragSource,
  target: DropTarget,
): DropResult | null {
  if (target.to === "remove") {
    if (source.from !== "pylon" || build.get(source.slot) !== source.option) return null;
    const next = new Map(build);
    next.delete(source.slot);
    return { build: next, displaced: [{ slot: source.slot, option: source.option }] };
  }

  if (target.to === "all") {
    const next = new Map(build);
    const filled: number[] = [];
    for (const { index } of armament.hardpoints) {
      if (next.has(index)) continue;
      const option = equivalentOption(armament, source.slot, source.option, index);
      if (!option) continue;
      next.set(index, option.name);
      if (allowed(armament, next, [index])) filled.push(index);
      else next.delete(index);
    }
    return filled.length > 0 ? { build: next, displaced: [] } : null;
  }

  if (source.from === "pylon" && source.slot === target.slot) return null;
  const option = equivalentOption(armament, source.slot, source.option, target.slot);
  if (!option) return null;

  const next = new Map(build);
  if (source.from === "pylon") next.delete(source.slot);
  const occupant = build.get(target.slot);
  next.set(target.slot, option.name);

  const changed = [target.slot];
  const swapBack =
    source.from === "pylon" && occupant !== undefined
      ? equivalentOption(armament, target.slot, occupant, source.slot)
      : null;
  if (swapBack) {
    next.set(source.slot, swapBack.name);
    changed.push(source.slot);
    if (allowed(armament, next, changed)) return { build: next, displaced: [] };
    next.delete(source.slot);
    changed.pop();
  }

  if (!allowed(armament, next, changed)) return null;
  const displaced =
    occupant !== undefined && occupant !== option.name ? [{ slot: target.slot, option: occupant }] : [];
  return { build: next, displaced };
}

const designation = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Whether one bomb is a variant of another the sheet names: the same kind and
 * damage, and the sheet's own name for it inside the other's — "Mk 77" in
 * "Mk 77 mod 4", "FAB-100sv" in "FAB-100sv (forged)". Kind and damage alone
 * are not enough: the GBU-38 prices exactly as the GBU-62 does, and is not one.
 */
export function variantOf(
  bomb: Pick<Bomb, "kind" | "damageValue" | "fullName">,
  of: Pick<Bomb, "kind" | "damageValue" | "chartName" | "fullName">,
): boolean {
  if (bomb.kind !== of.kind || of.damageValue === null || bomb.damageValue !== of.damageValue) return false;
  const name = designation(of.chartName || of.fullName);
  return name.length > 0 && designation(bomb.fullName).includes(name);
}

/** Steps one search may take before giving up — the whole sheet needs at most ~15 000. */
const SEARCH_LIMIT = 300_000;

/** Spare rounds a build may carry past what was asked, tried one at a time from none. */
const MAX_OVERSHOOT = 4;

/**
 * Hardpoint choices that carry a list of bombs — the sheet's loadout, hung
 * pylon by pylon — or null when nothing the aircraft can mount adds up to it.
 *
 * A bomb some pylon hangs is taken as named. Only one that no pylon hangs
 * may have another stand in for it (`standsIn`, see `variantOf`): the sheet's
 * "Mk 77" is the mod 2 where the A-4B's racks hang the mod 4. Only choices
 * made up of wanted bombs are considered — no tanks, missiles or pods
 * alongside.
 *
 * Exact first. Failing that, the fewest spare rounds, since a rack hangs its
 * bombs in pairs or threes: the Halifax's fourteen are fifteen on the
 * aircraft. Failing that too, over the load limit, which a handful of the
 * sheet's own loadouts exceed as the game's files state it — the creator then
 * says so. The exclusion rules hold throughout.
 */
export function buildFor(
  armament: Armament,
  wanted: { bombId: string; count: number }[],
  standsIn: (bombId: string, forBombId: string) => boolean,
): Build | null {
  const hung = new Set(
    armament.hardpoints.flatMap((hardpoint) =>
      hardpoint.options.flatMap((option) => option.stores.flatMap(({ store }) => (store.bomb ? [store.bomb.id] : []))),
    ),
  );
  const unhung = [...new Set(wanted.map((w) => w.bombId))].filter((bombId) => !hung.has(bombId));
  // What a store's bomb counts towards: itself where it is wanted by name,
  // else the one unhung bomb it may stand in for, else nothing.
  const keyOf = (bombId: string) =>
    hung.has(bombId) && wanted.some((w) => w.bombId === bombId)
      ? bombId
      : (unhung.find((forBombId) => standsIn(bombId, forBombId)) ?? null);

  const target = new Map<string, number>();
  for (const { bombId, count } of wanted) target.set(bombId, (target.get(bombId) ?? 0) + count);
  const keys = [...target.keys()];
  if (keys.length === 0) return null;

  type Candidate = { name: string; rounds: number[]; total: number; kg: number };
  const candidates = armament.hardpoints.map((hardpoint) => ({
    slot: hardpoint.index,
    options: hardpoint.options
      .flatMap((option): Candidate[] => {
        const rounds = keys.map(() => 0);
        for (const { store, count } of option.stores) {
          const key = store.bomb ? keyOf(store.bomb.id) : null;
          const at = key === null ? -1 : keys.indexOf(key);
          if (at < 0) return [];
          rounds[at] += store.bomb!.count * count;
        }
        const total = rounds.reduce((a, b) => a + b, 0);
        return total > 0 ? [{ name: option.name, rounds, total, kg: massOfOption(option) }] : [];
      })
      .sort((a, b) => b.total - a.total),
  }));

  // The most of each bomb the hardpoints from here on could still take.
  const room = candidates.map(() => keys.map(() => 0));
  room.push(keys.map(() => 0));
  for (let i = candidates.length - 1; i >= 0; i--) {
    room[i] = keys.map((_, k) => room[i + 1][k] + Math.max(0, ...candidates[i].options.map((o) => o.rounds[k])));
  }

  // A failure is remembered with everything that decided it: the bombs still
  // wanted, the choices some exclusion names and, under a load limit, the load.
  const ruled = new Set(armament.exclusions.flatMap((r) => [`${r.slot}:${r.option}`, `${r.otherSlot}:${r.otherOption}`]));

  const search = (overshoot: number, limitKg: number | null): Build | null => {
    const chosen = new Map<number, string>();
    const failed = new Set<string>();
    let steps = 0;

    const visit = (i: number, left: number[], spare: number, kg: number): boolean => {
      if (++steps > SEARCH_LIMIT) return false;
      if (left.every((n) => n <= 0)) return true;
      if (i === candidates.length || left.some((n, k) => n > room[i][k])) return false;
      const binding = [...chosen].map(([slot, name]) => `${slot}:${name}`).filter((pick) => ruled.has(pick));
      const state = `${i}|${left.join(",")}|${spare}|${binding.join(",")}|${limitKg === null ? "" : Math.round(kg)}`;
      if (failed.has(state)) return false;

      const { slot, options } = candidates[i];
      for (const option of options) {
        const extra = option.rounds.reduce((sum, n, k) => sum + Math.max(0, n - Math.max(left[k], 0)), 0);
        if (spare + extra > overshoot) continue;
        if (limitKg !== null && kg + option.kg > limitKg) continue;
        const here = { slot, option: option.name };
        if (
          [...chosen].some(([otherSlot, otherName]) =>
            armament.exclusions.some((rule) => clashes(rule, here, { slot: otherSlot, option: otherName })),
          )
        ) {
          continue;
        }
        chosen.set(slot, option.name);
        if (visit(i + 1, left.map((n, k) => n - option.rounds[k]), spare + extra, kg + option.kg)) return true;
        chosen.delete(slot);
      }
      if (visit(i + 1, left, spare, kg)) return true;
      failed.add(state);
      return false;
    };

    return visit(0, keys.map((key) => target.get(key)!), 0, 0) ? new Map(chosen) : null;
  };

  for (const limitKg of armament.maxLoadKg === null ? [null] : [armament.maxLoadKg, null]) {
    for (let overshoot = 0; overshoot <= MAX_OVERSHOOT; overshoot++) {
      const build = search(overshoot, limitKg);
      if (build) return build;
    }
  }
  return null;
}
