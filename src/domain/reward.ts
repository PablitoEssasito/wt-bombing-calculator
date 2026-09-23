import type { VehicleCategory } from "./constants";

/**
 * Payload damage the multiplier starts falling past, for tech-tree aircraft.
 *
 * The game prices a preset by the summed base damage of everything on it
 * (update 2.37.0.84 moved it off explosive mass). The sheet computes its 💡
 * column with a script the CSV export does not carry, so the curve below is
 * fitted to the sheet's own figures: cap / (1 + ln(damage / knee)), with
 * premiums earning 1.205× that before the cap. It lands within 0.1 of the
 * sheet on ~88% of its loadouts; the rest carry rockets or pods a schedule
 * never lists.
 */
const KNEE = 18910;
const PREMIUM_FACTOR = 1.205;

/** Reward multiplier for bases, as the loadout screen shows it, to one decimal. */
export function rewardMultiplier(damage: number, category: VehicleCategory): number {
  const cap = category.endsWith("bomber") ? 10 : 8;
  const factor = category.startsWith("premium") ? PREMIUM_FACTOR : 1;
  const curve = (cap * factor) / (1 + Math.log(Math.max(damage, KNEE) / KNEE));
  return Math.min(cap, Math.round(curve * 10) / 10);
}
