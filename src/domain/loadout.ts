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
};

export type SlotOption = {
  name: string;
  stores: { store: Store; count: number }[];
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

export type Armament = {
  maxLoadKg: number | null;
  /** Stated by the game but not enforced here — see `violationsOf`. */
  perWingKg: number | null;
  disbalanceKg: number | null;
  hardpoints: Hardpoint[];
  exclusions: Exclusion[];
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

/**
 * The choices this hardpoint cannot take, given everything else already hung.
 *
 * This is what greys an entry out in the menu rather than letting it be picked
 * and then complained about.
 */
export function blockedIn(armament: Armament, build: Build, slot: number): ReadonlySet<string> {
  const blocked = new Set<string>();
  const hardpoint = armament.hardpoints.find((h) => h.index === slot);
  if (!hardpoint) return blocked;

  for (const option of hardpoint.options) {
    const candidate = { slot, option: option.name };
    for (const [otherSlot, otherName] of build) {
      if (otherSlot === slot) continue;
      const other = { slot: otherSlot, option: otherName };
      if (armament.exclusions.some((rule) => clashes(rule, candidate, other))) {
        blocked.add(option.name);
        break;
      }
    }
  }
  return blocked;
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

/** Ordnance the chart would price if it listed it — everything else is not meant to be. */
const ORDNANCE = new Set<StoreKind>(["bomb", "mine", "torpedo"]);

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
