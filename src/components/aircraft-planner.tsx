"use client";

import { useMemo } from "react";
import { reachableBaseHps } from "@/domain/base-hp";
import { BASE_COUNTS, GAME_MODES, type BaseCount, type BaseHp, type GameMode } from "@/domain/constants";
import { buildPlan, payloadOf, type Plan } from "@/domain/schedule";
import type { Aircraft, Bomb, LoadoutOption, Schedule } from "@/domain/types";
import { DropSchedule, ItemList } from "@/components/drop-schedule";
import { Segmented } from "@/components/segmented";
import { SourceNote } from "@/components/source-note";

import { urlInteger, urlLiteral, useUrlState } from "@/lib/use-url-state";
import { cn, formatCount } from "@/lib/utils";

/** Sentinels for the two controls that default to "whatever the tool suggests". */
const AUTO_TARGET = 0;
const RECOMMENDED = -1;

type Evaluated = {
  option: LoadoutOption;
  index: number;
  schedule: Schedule;
  plan: Plan;
  bombCount: number;
};

/**
 * Picks the schedule written for this base health, or the closest one below it.
 *
 * The source describes a loadout once per BR bracket it was written for, so an
 * exact match is the normal case; the fallback covers a player deliberately
 * looking at a bracket the sheet did not spell out.
 */
function scheduleFor(option: LoadoutOption, baseHp: BaseHp): Schedule {
  const exact = option.schedules.find((s) => s.baseHp === baseHp);
  if (exact) return exact;
  const below = [...option.schedules].reverse().find((s) => s.baseHp <= baseHp);
  return below ?? option.schedules[0];
}

export function AircraftPlanner({
  plane,
  bombs,
  sourceUrl,
}: {
  plane: Aircraft;
  bombs: Bomb[];
  sourceUrl: string;
}) {
  const bombsById = useMemo(() => new Map(bombs.map((b) => [b.id, b])), [bombs]);
  const tiers = useMemo(() => reachableBaseHps(plane.br), [plane.br]);

  const [hp, setHp] = useUrlState("hp", urlInteger(tiers[0]));
  const [mode, setMode] = useUrlState("mode", urlLiteral(GAME_MODES, "rb"));
  const [mapSize, setMapSize] = useUrlState("map", urlInteger(4));
  const [target, setTarget] = useUrlState("bases", urlInteger(AUTO_TARGET));
  const [picked, setPicked] = useUrlState("loadout", urlInteger(RECOMMENDED));

  const baseHp = (tiers.includes(hp as BaseHp) ? hp : tiers[0]) as BaseHp;
  const baseCount = (BASE_COUNTS as readonly number[]).includes(mapSize)
    ? (mapSize as BaseCount)
    : 4;

  const evaluated = useMemo<Evaluated[]>(
    () =>
      plane.options.map((option, index) => {
        const schedule = scheduleFor(option, baseHp);
        const plan = buildPlan(schedule, bombsById, { baseHp, mode: mode as GameMode, baseCount });
        const bombCount = payloadOf(schedule, bombsById).reduce((n, i) => n + i.count, 0);
        return { option, index, schedule, plan, bombCount };
      }),
    [plane.options, baseHp, bombsById, mode, baseCount],
  );

  const reach = Math.max(1, ...evaluated.map((e) => e.plan.basesDestroyed));
  /**
   * Default to clearing the map once, not to the aircraft's ceiling.
   *
   * Reaching the ceiling means the heaviest loadout, which carries the worst
   * reward multiplier — the opposite of what the source recommends. Anyone
   * farming respawned bases can raise it with one click.
   */
  const wanted = Math.min(target === AUTO_TARGET ? baseCount : Math.max(target, 1), reach);

  /**
   * The lightest loadout that still hits the number of bases asked for.
   *
   * Reward multipliers fall as payload grows, so carrying more than the job needs
   * costs you research — the source makes the same point in its FAQ.
   */
  const recommended = useMemo(() => {
    const capable = evaluated.filter((e) => e.plan.basesDestroyed >= wanted);
    const pool = capable.length > 0 ? capable : evaluated;
    return pool.reduce((best, e) => {
      const better =
        (e.option.rewardMultiplier ?? 0) - (best.option.rewardMultiplier ?? 0) ||
        best.bombCount - e.bombCount;
      return better > 0 ? e : best;
    });
  }, [evaluated, wanted]);

  const active = picked === RECOMMENDED ? recommended : (evaluated[picked] ?? recommended);

  return (
    <div className="space-y-8">
      <section className="card p-4 sm:p-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Segmented
          label="Match BR"
          value={String(baseHp)}
          onChange={(v) => {
            setHp(Number(v));
            setPicked(RECOMMENDED);
          }}
          options={tiers.map((tier) => ({
            value: String(tier),
            label: brLabelFor(plane.br, tier, tiers),
            hint: `${formatCount(tier)} HP bases`,
          }))}
        />

        <Segmented
          label="Game mode"
          value={mode}
          onChange={(v) => setMode(v as GameMode)}
          options={[
            { value: "rb", label: "Realistic / Sim", hint: "bases respawn" },
            { value: "ab", label: "Arcade", hint: "double health" },
          ]}
        />

        <Segmented
          label="Bases on the map"
          value={String(baseCount)}
          onChange={(v) => setMapSize(Number(v))}
          options={[
            { value: "4", label: "Four", hint: "most maps" },
            { value: "3", label: "Three", hint: "half payload" },
          ]}
        />

        <div className="space-y-1.5">
          <div className="text-xs uppercase tracking-wider text-ink-faint">
            Bases you want to hit
          </div>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: reach }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setTarget(n);
                  setPicked(RECOMMENDED);
                }}
                aria-pressed={n === wanted}
                className={cn(
                  "nums w-9 h-9 rounded-lg border text-sm transition-colors",
                  n === wanted
                    ? "border-accent bg-accent-dim text-accent font-medium"
                    : "border-line text-ink-dim hover:text-ink hover:border-line-bright",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold">
            {active === recommended ? "Recommended loadout" : `Loadout ${active.index + 1}`}
          </h2>
          <p className="text-sm text-ink-dim">
            {active.plan.basesDestroyed} base{active.plan.basesDestroyed === 1 ? "" : "s"} ·{" "}
            <ItemList items={payloadOf(active.schedule, bombsById)} />
            {active.option.rewardMultiplier !== null ? (
              <>
                {" "}
                · <span className="text-ink">{active.option.rewardMultiplier}×</span> reward
              </>
            ) : null}
          </p>
          {picked !== RECOMMENDED && active !== recommended ? (
            <button
              type="button"
              onClick={() => setPicked(RECOMMENDED)}
              className="text-sm text-accent underline underline-offset-4"
            >
              back to recommended
            </button>
          ) : null}
        </header>

        {active.option.noteMarker ? (
          <SourceNote
            marker={active.option.noteMarker}
            note={active.option.note}
            sourceUrl={sourceUrl}
          />
        ) : null}

        {active.plan.source === "recomputed" ? (
          <p className="text-sm text-ink-dim border border-line bg-surface-2 rounded-lg px-3 py-2">
            Recalculated for {mode === "ab" ? "arcade" : "these"} conditions:{" "}
            {formatCount(active.plan.effectiveHp)} HP bases
            {baseCount === 3 ? " on a three-base map" : ""}. The same payload, redistributed —
            the source only spells out realistic battles on four-base maps.
          </p>
        ) : null}

        {active.schedule.bracketNote ? (
          <p className="text-sm text-ink-faint">{active.schedule.bracketNote}</p>
        ) : null}

        <DropSchedule plan={active.plan} />
      </section>

      {evaluated.length > 1 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Every loadout</h2>
          <p className="text-sm text-ink-faint">
            Lighter loadouts earn a higher multiplier per base, so take only what the job needs.
          </p>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-ink-faint">
                <tr className="hairline">
                  <th className="text-left font-normal px-3 py-2">Bases</th>
                  <th className="text-left font-normal px-3 py-2">Reward</th>
                  <th className="text-left font-normal px-3 py-2">Payload</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {evaluated.map((entry) => (
                  <tr
                    key={entry.index}
                    className={cn(
                      "border-t border-line",
                      entry === active && "bg-accent-dim",
                    )}
                  >
                    <td className="nums px-3 py-2 font-medium">{entry.plan.basesDestroyed}</td>
                    <td className="nums px-3 py-2 text-ink-dim">
                      {entry.option.rewardMultiplier !== null
                        ? `${entry.option.rewardMultiplier}×`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-ink-dim">
                      <ItemList items={payloadOf(entry.schedule, bombsById)} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {entry === active ? (
                        <span className="text-xs text-accent">shown above</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPicked(entry.index)}
                          className="text-xs text-ink-dim hover:text-accent underline underline-offset-4"
                        >
                          show
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Describes a bracket the way a player thinks about it: the BRs they will meet. */
function brLabelFor(vehicleBr: number, tier: BaseHp, tiers: BaseHp[]): string {
  if (tiers.length === 1) return `${vehicleBr.toFixed(1)} and up`;
  return tier === tiers[0] ? "No uptier" : "Uptiered";
}
