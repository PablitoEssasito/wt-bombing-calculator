"use client";

import { BombRow } from "@/components/bomb-glyph";
import type { Plan, PlanBase, PlanItem, Shortfall } from "@/domain/schedule";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * `shortfalls` marks the bases the sheet counts down that the game's own damage
 * figures leave standing (see shortfallOf) — shown on the tile rather than
 * quietly re-counted, since the rest of the sheet's plan still stands.
 */
export function DropSchedule({ plan, shortfalls = [] }: { plan: Plan; shortfalls?: Shortfall[] }) {
  const { m, number, count, fill } = useI18n();
  if (plan.bases.length === 0) {
    return (
      <p className="card p-6 text-ink-dim text-center">
        {fill(m.drop.cannotFlatten, { hp: number(plan.effectiveHp) })}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plan.bases.map((base, i) => (
          <li key={i}>
            <BaseTile
              base={base}
              index={i}
              threshold={plan.threshold}
              shortfall={shortfalls.find((s) => s.base === i)}
            />
          </li>
        ))}
      </ol>

      {plan.unlistedBases > 0 ? (
        <p className="text-sm text-ink-dim">
          <span className="text-ink-faint">{count(m.drop.plusMore, plan.unlistedBases)}</span>
          {fill(m.drop.unlisted, { counted: plan.basesDestroyed, written: plan.bases.length })}
        </p>
      ) : null}

      {plan.leftover.length > 0 ? (
        <p className="text-sm text-ink-dim">
          <span className="text-ink-faint">{plan.trimmed ? m.drop.leaveBehind : m.drop.leftOver}</span>
          <ItemList items={plan.leftover} />
          <span className="text-ink-faint">
            {plan.trimmed
              ? count(m.drop.surplus, plan.bases.length)
              : plan.respawns
                ? m.drop.notEnoughRespawn
                : m.drop.notEnoughNoRespawn}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function BaseTile({
  base,
  index,
  threshold,
  shortfall,
}: {
  base: PlanBase;
  index: number;
  threshold: number;
  shortfall?: Shortfall;
}) {
  const { m, number, fill } = useI18n();
  const ratio = Math.min(base.damage / threshold, 1);
  const down = base.destroys && !shortfall;

  return (
    <article
      className={cn(
        "card p-3.5 h-full flex flex-col gap-3",
        down ? "border-line" : "border-dashed border-line-bright",
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wider text-ink-faint">
          {fill(m.drop.base, { n: index + 1 })}
        </span>
        <span className={cn("text-xs", down ? "text-live" : "text-warn")}>
          {shortfall ? m.drop.shortByGame : base.destroys ? m.drop.destroyed : m.drop.leftovers}
        </span>
      </header>

      {/* The glyphs are the answer; the words underneath are the caption. */}
      <div className="flex-1 space-y-2.5">
        {base.items.map((item) => (
          <div key={item.bomb.id} className="space-y-1">
            <BombRow bomb={item.bomb} count={item.count} />
            <p className="text-sm">
              <span className="nums text-accent font-semibold">{item.count}</span>
              <span className="text-ink-faint"> × </span>
              <span className="text-ink-dim">{item.bomb.chartName || item.bomb.fullName}</span>
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
          <div
            className={cn("h-full rounded-full", down ? "bg-live" : "bg-warn")}
            style={{ width: `${Math.max(ratio * 100, 2)}%` }}
          />
        </div>
        <p className="nums text-xs text-ink-faint">
          {fill(m.drop.damageOf, {
            damage: number(Math.round(base.damage)),
            threshold: number(Math.round(threshold)),
          })}
          {base.hasUnpriced ? m.drop.unpriced : ""}
        </p>
        {shortfall ? (
          <p className="text-xs text-warn">
            {shortfall.needed
              ? fill(m.drop.neededByGame, {
                  count: shortfall.needed.count,
                  name: shortfall.needed.bomb.chartName || shortfall.needed.bomb.fullName,
                  sheetCount: shortfall.needed.sheetCount,
                })
              : fill(m.drop.shortDetail, { sheet: number(Math.round(shortfall.sheetDamage)) })}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function ItemList({ items }: { items: PlanItem[] }) {
  return (
    <>
      {items.map((item, i) => (
        <span key={item.bomb.id} className="nums">
          {i > 0 ? ", " : ""}
          {item.count} × {item.bomb.chartName || item.bomb.fullName}
        </span>
      ))}
    </>
  );
}
