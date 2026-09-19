import Image from "next/image";
import type { Nation } from "@/domain/constants";
import { NATION_LABELS } from "@/domain/constants";
import { withBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";

/**
 * A nation's flag, as a small rounded chip.
 *
 * Not emoji: Windows renders flag emoji as a two-letter code in a plain box
 * rather than a picture (a deliberate font choice, not a bug), which is most of
 * this app's audience given the game itself is Windows-first. These are vendored
 * SVGs (flag-icons, MIT) instead, so the flag actually looks like a flag
 * everywhere. Only the ten nations this dataset covers are kept, not the
 * library's full set.
 *
 * Germany and the USSR are the exception: War Thunder's own nation is
 * "Germany" spanning both world wars and the Cold War, and "USSR", neither of
 * which the modern tricolour/tricolour-of-Russia actually represents in the
 * game. Those two are traced from the wiki's own `country_svg` icons instead —
 * the same ones the game's nation picker shows — whose canvas is 100×68
 * rather than the flag-icons library's 4:3, hence the aspect lookup below.
 */
const FLAG_ASPECT: Partial<Record<Nation, number>> = {
  germany: 100 / 68,
  ussr: 100 / 68,
};

export function Flag({
  nation,
  size = 16,
  className,
}: {
  nation: Nation;
  /** Height in px; width follows the flag's own 4:3 aspect ratio. */
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={withBasePath(`/flags/${nation}.svg`)}
      alt=""
      width={Math.round(size * (FLAG_ASPECT[nation] ?? 4 / 3))}
      height={size}
      title={NATION_LABELS[nation]}
      className={cn("inline-block rounded-[2px] shrink-0 align-middle", className)}
    />
  );
}
