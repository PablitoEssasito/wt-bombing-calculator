import Image from "next/image";
import type { Nation } from "@/domain/constants";
import { NATION_LABELS } from "@/domain/constants";
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
 */
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
      src={`/flags/${nation}.svg`}
      alt=""
      width={Math.round((size * 4) / 3)}
      height={size}
      title={NATION_LABELS[nation]}
      className={cn("inline-block rounded-[2px] shrink-0 align-middle", className)}
    />
  );
}
