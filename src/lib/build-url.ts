import type { Build } from "@/domain/loadout";
import type { UrlCodec } from "@/lib/use-url-state";

/**
 * A creator build in the page's URL, comma-joined as `slot:option` pairs —
 * every name in the data is plain alnum/underscore. Its own module so the
 * planner can hand the creator a build without loading the creator.
 */
export function urlBuild(): UrlCodec<Build> {
  return {
    fallback: new Map(),
    parse: (raw) => {
      const build = new Map<number, string>();
      for (const pair of raw.split(",")) {
        const [slotText, option] = pair.split(":");
        const slot = Number(slotText);
        if (Number.isFinite(slot) && option) build.set(slot, option);
      }
      return build;
    },
    serialize: (value) =>
      value.size === 0 ? null : [...value].map(([slot, option]) => `${slot}:${option}`).join(","),
  };
}
