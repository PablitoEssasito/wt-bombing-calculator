"use client";

import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * A two-handle range over a set of steps that actually exist in the data —
 * battle ratings step 1.0, 1.3, 1.7, 2.0, ranks step 1..9, so both sliders run
 * over positions in the list rather than over the numbers themselves, which
 * makes every stop land on a real value instead of somewhere between two.
 */
export function RangeSlider({
  label,
  steps,
  from,
  to,
  format,
  onChange,
}: {
  label: string;
  steps: number[];
  from: number;
  to: number;
  /** How to print one endpoint value, e.g. `(v) => v.toFixed(1)` or a roman numeral lookup. */
  format: (value: number) => string;
  onChange: (from: number, to: number) => void;
}) {
  const { m } = useI18n();
  const last = steps.length - 1;
  const pct = (i: number) => (last === 0 ? 0 : (i / last) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider text-ink-faint">{label}</span>
        <span className="nums text-sm">
          {from === 0 && to === last ? (
            <span className="text-ink-faint">{m.common.all}</span>
          ) : (
            <span className="text-accent">
              {format(steps[from])} – {format(steps[to])}
            </span>
          )}
        </span>
      </div>

      <div className="relative h-6">
        {/* Track, then the selected span drawn over it. */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-surface-2" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-accent"
          style={{ left: `${pct(from)}%`, right: `${100 - pct(to)}%` }}
        />
        <RangeInput
          label={`Lowest ${label.toLowerCase()}`}
          max={last}
          value={from}
          onChange={(v) => onChange(Math.min(v, to), to)}
        />
        <RangeInput
          label={`Highest ${label.toLowerCase()}`}
          max={last}
          value={to}
          onChange={(v) => onChange(from, Math.max(v, from))}
        />
      </div>
    </div>
  );
}

function RangeInput({
  label,
  max,
  value,
  onChange,
}: {
  label: string;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="range"
      min={0}
      max={max}
      step={1}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn(
        "absolute inset-x-0 top-0 h-6 w-full appearance-none bg-transparent",
        // Only the handles should take the pointer, so the two inputs can overlap.
        "pointer-events-none",
        // 24px, not the visually-tighter 16px this would default to — a
        // two-handle slider already asks a lot of a touch screen (two close
        // targets to tell apart), and 16px sits well under both Apple's and
        // Google's minimum recommended touch target size.
        "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none",
        "[&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6",
        "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent",
        "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-ground",
        "[&::-webkit-slider-thumb]:cursor-grab",
        "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none",
        "[&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6",
        "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent",
        "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-ground",
      )}
    />
  );
}
