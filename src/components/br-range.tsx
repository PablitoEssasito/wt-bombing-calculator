"use client";

import { cn } from "@/lib/utils";

/**
 * A two-handle range over the battle ratings that actually exist.
 *
 * Battle ratings are not evenly spaced — they step 1.0, 1.3, 1.7, 2.0 — so the
 * sliders run over positions in the list rather than over the numbers, which
 * makes every stop land on a real value instead of somewhere between two.
 */
export function BrRange({
  steps,
  from,
  to,
  onChange,
}: {
  steps: number[];
  from: number;
  to: number;
  onChange: (from: number, to: number) => void;
}) {
  const last = steps.length - 1;
  const pct = (i: number) => (last === 0 ? 0 : (i / last) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider text-ink-faint">Battle rating</span>
        <span className="nums text-sm">
          {from === 0 && to === last ? (
            <span className="text-ink-faint">all</span>
          ) : (
            <span className="text-accent">
              {steps[from].toFixed(1)} – {steps[to].toFixed(1)}
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
          label="Lowest battle rating"
          max={last}
          value={from}
          onChange={(v) => onChange(Math.min(v, to), to)}
        />
        <RangeInput
          label="Highest battle rating"
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
        "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none",
        "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4",
        "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent",
        "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-ground",
        "[&::-webkit-slider-thumb]:cursor-grab",
        "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none",
        "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4",
        "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent",
        "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-ground",
      )}
    />
  );
}
