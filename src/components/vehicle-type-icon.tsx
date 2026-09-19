import { VEHICLE_TYPE_COLORS, type VehicleType } from "@/domain/constants";

/**
 * The exact class marker the wiki draws next to a unit's name — traced from
 * `/static/class_icon/{fighter,bomber,assault}.svg`, the same sprite its own
 * unit-list rows `<use>` (each with `color` set to the class's own hex, the
 * same values `VEHICLE_TYPE_COLORS` carries).
 */
const PATHS: Record<VehicleType, { viewBox: string; d: string }> = {
  fighter: { viewBox: "-10 0 1595 2048", d: "M794 313l635 579l-635 575l-641 -575z" },
  bomber: { viewBox: "-10 0 1964 2048", d: "M307 357h1330v507l-666 603l-664 -603v-507z" },
  assault: { viewBox: "-10 0 2056 2048", d: "M1023 1406l-811 -450l811 -453l814 453z" },
};

export function VehicleTypeIcon({
  type,
  size = 10,
  className,
}: {
  type: VehicleType;
  size?: number;
  className?: string;
}) {
  const { viewBox, d } = PATHS[type];
  return (
    <svg
      viewBox={viewBox}
      width={size}
      height={size}
      aria-hidden
      className={className}
      style={{ color: VEHICLE_TYPE_COLORS[type] }}
    >
      <path fill="currentColor" d={d} />
    </svg>
  );
}
