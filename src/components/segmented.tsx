"use client";

import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  hint?: string;
};

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs uppercase tracking-wider text-ink-faint">{label}</div>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              className={cn(
                "px-3 py-2 rounded-lg border text-sm text-left transition-colors",
                active
                  ? "border-accent bg-accent-dim text-ink"
                  : "border-line text-ink-dim hover:text-ink hover:border-line-bright",
              )}
            >
              <span className={cn("block", active && "text-accent font-medium")}>
                {option.label}
              </span>
              {option.hint ? (
                <span className="block text-xs text-ink-faint nums">{option.hint}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
