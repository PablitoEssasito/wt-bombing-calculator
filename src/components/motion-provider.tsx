"use client";

import { domAnimation, LazyMotion, MotionConfig } from "motion/react";

/**
 * Motion for the aircraft page only: the lean `m.*` components plus the DOM
 * animation features, rather than the whole library. `strict` makes a stray
 * full `motion.*` component an error, so the bundle can't quietly grow back.
 * Reduced motion follows the player's system setting.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
