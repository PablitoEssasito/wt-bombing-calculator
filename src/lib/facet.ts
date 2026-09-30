/**
 * A filter row whose chips each tick a value in, cross it out, or leave it be
 * — Type on the armament table, Type and Class on the aircraft list. A value
 * both ticked and crossed out (only a hand-edited link says that) counts as
 * crossed out, as its chip shows.
 */
export type FacetState = "off" | "in" | "out";

/** How a click is logged: "on" and "off" as before crossing out existed, and "excluded". */
export const FACET_TRACKED: Record<FacetState, string> = { off: "off", in: "on", out: "excluded" };

export function facetState<T>(value: T, ticked: ReadonlySet<T>, crossed: ReadonlySet<T>): FacetState {
  if (crossed.has(value)) return "out";
  return ticked.has(value) ? "in" : "off";
}

/** A row with any ticked value, if any is ticked, and no crossed-out one. */
export function matchesFacet<T>(values: readonly T[], ticked: ReadonlySet<T>, crossed: ReadonlySet<T>): boolean {
  if (values.some((v) => crossed.has(v))) return false;
  const wanted = [...ticked].filter((v) => !crossed.has(v));
  return wanted.length === 0 || values.some((v) => wanted.includes(v));
}

/** One click on a value's chip: off, then ticked, then crossed out, then off again. */
export function nextFacet<T>(
  value: T,
  ticked: ReadonlySet<T>,
  crossed: ReadonlySet<T>,
): { ticked: Set<T>; crossed: Set<T>; state: FacetState } {
  const state = { off: "in", in: "out", out: "off" }[facetState(value, ticked, crossed)] as FacetState;
  const nextTicked = new Set(ticked);
  const nextCrossed = new Set(crossed);
  nextTicked.delete(value);
  nextCrossed.delete(value);
  if (state === "in") nextTicked.add(value);
  if (state === "out") nextCrossed.add(value);
  return { ticked: nextTicked, crossed: nextCrossed, state };
}
