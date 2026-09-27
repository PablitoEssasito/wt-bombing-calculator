/**
 * How much a blast hurts a bombing base, for ordnance the game prices nothing.
 *
 * The hangar's "Estimated damage to bases" is `weaponDamage` in wpcost.blkx,
 * which the game prices for bombs and rockets and leaves out for every guided
 * missile. It is not a number anyone typed in: across every high-explosive
 * store the game prices, it is one function of the blast's TNT equivalent —
 * no two stores with the same TNT disagree, and it only ever rises with it.
 * Its one step is where the blast stops piercing the base's armour. A bombing
 * zone is armour class `bombing_zone` (damage_model/armor_classes.blk):
 * 25 mm thick, and a blast that cannot pierce that deals 0.6 of its damage
 * (`restrainExplosionDamage`). The blast's penetration is explosive.blk's own
 * `explosiveMassToPenetration` table, and it crosses 25 mm at about 2 kg of
 * TNT — exactly where the priced stores jump from 180 to 311.
 *
 * So the model is the game's own prices, laid out along TNT, with that step
 * taken out: every priced store is a point, and anything else is read off the
 * line between its neighbours, the step put back. It is built afresh at every
 * import (scripts/armament/stores.ts), so a patch that reprices the
 * explosions moves it too.
 */

/** A table the way the game's p2 blocks write one: `[x, y]` pairs. */
export type Curve = [number, number][];

export type BaseDamageModel = {
  /** TNT equivalent (kg) → damage at full effect, one point per priced store. */
  points: Curve;
  /** The bombing zone's armour, in mm. */
  armorThickness: number;
  /** What a blast that cannot pierce it still deals, as a share. */
  restrain: number;
  /** TNT equivalent (kg) → a blast's armour penetration (mm). */
  penetration: Curve;
};

/**
 * Reads a table the way the game does (`getLinearValueFromP2blk`,
 * gui/scripts/weaponry/dmgmodel.nut): straight lines between points, and the
 * nearest end's value past either end.
 */
export function readCurve(curve: Curve, x: number): number {
  let below: [number, number] | null = null;
  let above: [number, number] | null = null;
  for (const point of curve) {
    if (point[0] === x) return point[1];
    if (point[0] < x && (!below || point[0] > below[0])) below = point;
    if (point[0] > x && (!above || point[0] < above[0])) above = point;
  }
  if (!below) return above?.[1] ?? 0;
  if (!above) return below[1];
  return below[1] + ((above[1] - below[1]) * (x - below[0])) / (above[0] - below[0]);
}

/** Whether a blast of this much TNT goes through the bombing zone's armour. */
const pierces = (tntKg: number, model: BaseDamageModel) => readCurve(model.penetration, tntKg) >= model.armorThickness;

/**
 * Damage a blast of this much TNT does to a bombing base, as the game would
 * price it.
 *
 * Between two priced stores it is the line between them. Below the lightest it
 * falls straight to nothing; past the heaviest it carries on along the last
 * stretch, rather than stopping flat the way a game table would — the damage
 * has never once stopped rising with TNT.
 */
export function zoneDamage(tntKg: number, model: BaseDamageModel): number {
  if (!(tntKg > 0) || model.points.length === 0) return 0;
  const points = [...model.points].sort((a, b) => a[0] - b[0]);
  const [first] = points;
  let full: number;
  if (tntKg <= first[0]) {
    full = (first[1] * tntKg) / first[0];
  } else if (tntKg >= points[points.length - 1][0] && points.length > 1) {
    const [a, b] = points.slice(-2);
    full = b[1] + ((b[1] - a[1]) * (tntKg - b[0])) / (b[0] - a[0]);
  } else {
    full = readCurve(points, tntKg);
  }
  return Math.round(full * (pierces(tntKg, model) ? 1 : model.restrain));
}

/**
 * Damage at full effect a store deals, allowing for its price being a whole
 * number: a point is on a line if it is within this of it, at full effect —
 * a rounded price of one point, scaled back up from 0.6 below the step.
 */
const ROUNDING = 2;

/** The least-squares line through some points. */
function lineThrough(points: Curve): { slope: number; at: (x: number) => number } {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  const sxx = points.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  const slope = sxx === 0 ? 0 : points.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / sxx;
  return { slope, at: (x) => my + slope * (x - mx) };
}

/**
 * The table the game's prices were read off: the fewest straight stretches
 * that hold every priced store to within its rounding, and the corners
 * where two stretches meet.
 *
 * The game's own table has corners at round figures of TNT — 250 kg, 500 kg,
 * 1 000 kg — and priced stores seldom sit on one; a corner is where the lines
 * through the stores on either side cross. Interpolating store to store
 * instead would cut every corner: a store of 252 kg TNT, just past the one at
 * 250, would come out 17 points dear.
 */
function cornersOf(points: Curve): Curve {
  const runs: Curve[] = [];
  let run: Curve = [];
  for (const point of points) {
    const candidate = [...run, point];
    const line = candidate.length > 2 ? lineThrough(candidate) : null;
    if (!line || candidate.every(([x, y]) => Math.abs(line.at(x) - y) <= ROUNDING)) {
      run = candidate;
    } else {
      runs.push(run);
      run = [point];
    }
  }
  if (run.length > 0) runs.push(run);

  const corners: Curve = [];
  runs.forEach((current, i) => {
    const line = current.length > 1 ? lineThrough(current) : null;
    const first = current[0];
    const last = current[current.length - 1];
    const previous = runs[i - 1];
    // Where this stretch meets the one before, if both are lines and they
    // cross in the gap between them; otherwise it simply starts at its store.
    if (line && previous && previous.length > 1) {
      const before = lineThrough(previous);
      const x = before.slope === line.slope ? NaN : (line.at(0) - before.at(0)) / (before.slope - line.slope);
      if (x >= previous[previous.length - 1][0] && x <= first[0]) {
        corners.pop();
        corners.push([x, line.at(x)]);
      } else {
        corners.push([first[0], line.at(first[0])]);
      }
    } else {
      corners.push([first[0], line ? line.at(first[0]) : first[1]]);
    }
    if (line && current.length > 1) corners.push([last[0], line.at(last[0])]);
  });
  return corners.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e3) / 1e3]);
}

/**
 * Lays the game's priced stores out along TNT — each one's damage at full
 * effect, the step taken back out of those that cannot pierce — and reads
 * the game's table back off them (see `cornersOf`). Stores that share a TNT
 * always share a price in the game's data; where they would not, the lower
 * one is kept.
 */
export function buildModel(
  priced: { tntKg: number; damage: number }[],
  zone: { armorThickness: number; restrain: number; penetration: Curve },
): BaseDamageModel {
  const partial = { ...zone, points: [] as Curve };
  const byTnt = new Map<number, number>();
  for (const { tntKg, damage } of priced) {
    if (!(tntKg > 0) || !(damage > 0)) continue;
    const full = pierces(tntKg, partial) ? damage : damage / zone.restrain;
    const key = Math.round(tntKg * 1e4) / 1e4;
    byTnt.set(key, Math.min(byTnt.get(key) ?? Infinity, full));
  }
  return { ...partial, points: cornersOf([...byTnt].sort((a, b) => a[0] - b[0])) };
}
