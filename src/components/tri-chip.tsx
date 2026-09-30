"use client";

import { Check, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { FacetState } from "@/lib/facet";
import { cn } from "@/lib/utils";

/**
 * A chip on a row that ticks values in and crosses them out (see `facet.ts`):
 * each click moves it on — off, ticked, crossed out, off again. The box says
 * which, the colour backs it up: the accent for "only these", red for "not
 * these". The title tells what the next click does.
 */
export function TriChip({
  state,
  onClick,
  children,
}: {
  state: FacetState;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { m } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      title={m.common.facetNext[state]}
      className={cn(
        "flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full text-sm border transition motion-safe:active:scale-[0.97]",
        state === "in" && "border-accent text-accent bg-accent-dim",
        state === "out" && "border-danger text-danger bg-danger/10",
        state === "off" && "border-line text-ink-dim hover:text-ink hover:border-line-bright",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex items-center justify-center w-4 h-4 rounded-sm border shrink-0",
          state === "in" && "border-accent bg-accent text-ground",
          state === "out" && "border-danger bg-danger text-ground",
          state === "off" && "border-line-bright",
        )}
      >
        {state === "in" ? <Check size={12} strokeWidth={3} /> : null}
        {state === "out" ? <X size={12} strokeWidth={3} /> : null}
      </span>
      {children}
      {state === "off" ? null : <span className="sr-only"> ({m.common.facet[state]})</span>}
    </button>
  );
}
