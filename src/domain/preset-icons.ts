/** One hardpoint preset: the icon it states, and every chart bomb it hangs. */
export type PresetIcon = { iconType: string; bombIds: string[] };

/** The icon for one round of whatever a rack, group or pod preset draws several of. */
const singleRoundOf = (iconType: string) =>
  iconType
    .replace(/_(maws_)?ltc_pod/, "")
    .replace(/_group.*$/, "")
    .replace(/_x\d+$/, "");

/**
 * The icon the game's own loadout menu draws each bomb with, by majority over
 * every preset that hangs it alone.
 *
 * Preferred over the weapon file's `iconType` wherever a preset states one: the
 * two disagree for about half of all presets (the Mk 83's file says
 * bombs_special, the presets carrying it draw bombs_large), and the preset's is
 * the one a player actually sees. The menu also draws one bomb differently from
 * one aircraft to the next — the AN-M64 is bombs_middle on most, bombs_large on
 * the A-26B-10 — so this runs once over every aircraft for the site-wide icon,
 * and again over each aircraft's own presets (scripts/bomb-icons/aircraft.ts).
 *
 * A preset's icon usually draws the whole rack, so it is cut back to its
 * single-round form, and counted only when `known` says there is an icon by
 * that name. A tie goes to the icon whose drag matches the bomb's `kinds`
 * entry — the m/71 is drawn plain and retarded equally often, and is a GP bomb.
 */
export function presetIcons(
  presets: PresetIcon[],
  known: Set<string>,
  kinds: Map<string, string> = new Map(),
): Map<string, string> {
  const votes = new Map<string, Map<string, number>>();
  for (const { iconType, bombIds } of presets) {
    if (new Set(bombIds).size !== 1) continue;
    const single = singleRoundOf(iconType);
    if (!known.has(single)) continue;
    const tally = votes.get(bombIds[0]) ?? new Map<string, number>();
    tally.set(single, (tally.get(single) ?? 0) + 1);
    votes.set(bombIds[0], tally);
  }
  return new Map(
    [...votes].map(([bombId, tally]) => {
      const fits = (icon: string) => icon.includes("drag") === (kinds.get(bombId) === "DRAG");
      const ranked = [...tally].sort(
        (a, b) => b[1] - a[1] || Number(fits(b[0])) - Number(fits(a[0])) || a[0].localeCompare(b[0]),
      );
      return [bombId, ranked[0][0]];
    }),
  );
}
