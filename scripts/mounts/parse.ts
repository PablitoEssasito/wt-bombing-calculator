/** How the game lets an aircraft carry its suspended ordnance. */
export type MountStyle = "pylons" | "setups";

/**
 * Reads the wiki's "Suspended armament" block, which describes the loadout in one
 * of two shapes.
 *
 * A pylon matrix — a row per weapon, a column per hardpoint — means the game's
 * custom loadout editor is available and any part of a load can be mounted on its
 * own. A numbered list of setups instead means the aircraft offers whole loadouts
 * and nothing else: the Pe-8 takes its forty FAB-100s as one block, and there is
 * no way to carry thirty-two.
 *
 * That difference is the whole reason for reading the wiki at all — it decides
 * whether advising someone to leave a few bombs behind is advice they can act on.
 */
export function parseMountStyle(html: string): MountStyle | null {
  const start = html.indexOf("Suspended armament");
  if (start < 0) return null;

  const region = html.slice(start, start + 300_000);
  if (/<th[^>]*>\s*Slot\s*<\/th>/.test(region)) return "pylons";
  if (/Setup\s*\d+/.test(region.slice(0, 20_000))) return "setups";
  return null;
}
