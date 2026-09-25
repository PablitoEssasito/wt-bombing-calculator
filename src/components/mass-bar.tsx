"use client";

import * as motion from "motion/react-m";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** Past this share of the limit the bar warns before it turns red. */
const NEAR_LIMIT = 0.9;

/**
 * How much of the airframe's load limit the build takes, as a bar that fills
 * with a spring. It turns amber near the limit and red past it, with a short
 * shake the moment the load tips over, so an overweight build is noticed
 * without reading the numbers.
 */
export function MassBar({ massKg, limitKg }: { massKg: number; limitKg: number }) {
  const { m } = useI18n();
  const share = limitKg > 0 ? massKg / limitKg : 0;
  const over = share > 1;

  return (
    <motion.div
      role="meter"
      aria-label={m.creator.loadMeter}
      aria-valuemin={0}
      aria-valuemax={limitKg}
      aria-valuenow={Math.round(massKg)}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
      animate={over ? { x: [0, -4, 4, -2, 0] } : { x: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        className={cn(
          "h-full origin-left rounded-full transition-colors",
          over ? "bg-danger" : share > NEAR_LIMIT ? "bg-warn" : "bg-accent",
        )}
        initial={false}
        animate={{ scaleX: Math.min(share, 1) }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
      />
    </motion.div>
  );
}
