"use client";

import { BombRow } from "@/components/bomb-glyph";
import type { Plan, PlanBase, PlanItem } from "@/domain/schedule";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

export function DropSchedule({ plan }: { plan: Plan }) {
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
            <BaseTile base={base} index={i} threshold={plan.threshold} />
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
}: {
  base: PlanBase;
  index: number;
  threshold: number;
}) {
  const { m, number, fill } = useI18n();
  const ratio = Math.min(base.damage / threshold, 1);

  return (
    <article
      className={cn(
        "card p-3.5 h-full flex flex-col gap-3",
        base.destroys ? "border-line" : "border-dashed border-line-bright",
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wider text-ink-faint">
          {fill(m.drop.base, { n: index + 1 })}
        </span>
        <span className={cn("text-xs", base.destroys ? "text-live" : "text-warn")}>
          {base.destroys ? m.drop.destroyed : m.drop.leftovers}
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
            className={cn("h-full rounded-full", base.destroys ? "bg-live" : "bg-warn")}
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
