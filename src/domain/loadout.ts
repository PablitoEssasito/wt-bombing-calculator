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

/** Bombs carried that the chart does not price, so nothing here can count them. */
export function unpricedIn(build: Build, armament: Armament): Store[] {
  const seen = new Map<string, Store>();
  for (const [slot, name] of build) {
    const option = optionAt(armament, slot, name);
    if (!option) continue;
    for (const { store } of option.stores) {
      if (store.bomb === null && ORDNANCE.has(store.kind)) seen.set(store.name, store);
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
