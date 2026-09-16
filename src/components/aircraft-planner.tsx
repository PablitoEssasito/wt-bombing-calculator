"use client";

import { useMemo } from "react";
import { reachableBaseHps } from "@/domain/base-hp";
import { BASE_COUNTS, GAME_MODES, type BaseCount, type BaseHp, type GameMode } from "@/domain/constants";
import { defaultTarget, pickLoadout, stanceOf, type Stance } from "@/domain/recommend";
import {
  buildPlan,
  mountedIn,
  payloadOf,
  scheduleFor,
  trimToTarget,
  type Plan,
} from "@/domain/schedule";
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
  basesDestroyed: number;
  bombCount: number;
};

export function AircraftPlanner({
  plane,
  bombs,
  sourceUrl,
  splittable,
}: {
  plane: Aircraft;
  bombs: Bomb[];
  sourceUrl: string;
  /** The game mounts this aircraft's ordnance per pylon, so part of a load can be left off. */
  splittable: boolean;
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
        return { option, index, schedule, plan, basesDestroyed: plan.basesDestroyed, bombCount };
      }),
    [plane.options, baseHp, bombsById, mode, baseCount],
  );

  const reach = Math.max(1, ...evaluated.map((e) => e.basesDestroyed));
  const auto = useMemo(() => defaultTarget(evaluated, baseCount), [evaluated, baseCount]);
  const wanted = Math.min(target === AUTO_TARGET ? auto : Math.max(target, 1), reach);

  const recommended = useMemo(() => pickLoadout(evaluated, wanted), [evaluated, wanted]);

  const active = picked === RECOMMENDED ? recommended : (evaluated[picked] ?? recommended);
  const stance = stanceOf(active.option);

  /**
   * What to actually mount.
   *
   * Cutting the payload down needs two things to be true. The player has to have
   * asked for a smaller target themselves — left alone, the schedule stays exactly
   * as the source wrote it, and the sheet's numbers already account for what the
   * game offers. And the aircraft has to mount its ordnance per pylon: the Pe-8
   * carries forty FAB-100s as one fixed setup, so telling it to leave eight behind
   * would be advice nobody can act on.
   */
  const canTrim = splittable && target !== AUTO_TARGET;
  const shown = useMemo(
    () => (canTrim ? trimToTarget(active.plan, wanted) : active.plan),
    [active.plan, canTrim, wanted],
  );
  const wantedFewer = target !== AUTO_TARGET && wanted < active.plan.basesDestroyed;

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
            {headingFor(stance, active === recommended, wanted, evaluated.length)}
          </h2>
          <StanceTag stance={stance} />
          <p className="text-sm text-ink-dim">
            {shown.basesDestroyed} base{shown.basesDestroyed === 1 ? "" : "s"} ·{" "}
            <ItemList items={mountedIn(shown)} />
            {active.option.rewardMultiplier !== null ? (
              <>
                {" "}
                · <span className="text-ink">{active.option.rewardMultiplier}×</span> reward
                {shown.trimmed ? " on the full load" : ""}
              </>
            ) : null}
          </p>
          {picked !== RECOMMENDED && active !== recommended ? (
            <button
              type="button"
              onClick={() => setPicked(RECOMMENDED)}
              className="text-sm text-accent underline underline-offset-4"
            >
              back to the default
            </button>
          ) : null}
        </header>

        {active.option.note || active.option.noteMarker ? (
          <SourceNote option={active.option} sourceUrl={sourceUrl} />
        ) : null}

        {shown.source === "recomputed" ? (
          <p className="text-sm text-ink-dim border border-line bg-surface-2 rounded-lg px-3 py-2">
            Recalculated for {mode === "ab" ? "arcade" : "these"} conditions:{" "}
            {formatCount(shown.effectiveHp)} HP bases
            {baseCount === 3 ? " on a three-base map" : ""}. The same payload, redistributed —
            the source only spells out realistic battles on four-base maps.
          </p>
        ) : null}

        {!splittable && wantedFewer ? (
          <p className="text-sm text-ink-dim border border-line bg-surface-2 rounded-lg px-3 py-2">
            The {plane.name} offers this as a fixed setup rather than pylon by pylon, so there is
            no way to carry part of it. The whole load comes along whether you drop it or not.
          </p>
        ) : null}

        {active.schedule.bracketNote ? (
          <p className="text-sm text-ink-faint">{active.schedule.bracketNote}</p>
        ) : null}

        <DropSchedule plan={shown} />
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
                  <th className="text-left font-normal px-3 py-2">The source</th>
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
                    <td className="nums px-3 py-2 font-medium">{entry.basesDestroyed}</td>
                    <td className="nums px-3 py-2 text-ink-dim">
                      {entry.option.rewardMultiplier !== null
                        ? `${entry.option.rewardMultiplier}×`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <StanceTag stance={stanceOf(entry.option)} />
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

/**
 * Names the loadout on screen for what it actually is.
 *
 * Only the source's own star earns the word "recommended". Calling our own pick
 * that put the label on loadouts whose note directly underneath argued against
 * taking them, which is exactly backwards.
 */
function headingFor(stance: Stance, isPick: boolean, wanted: number, choices: number): string {
  if (stance === "recommended") return "Recommended loadout";
  if (!isPick) return "This loadout";
  if (choices === 1) return "What to take";
  return `Best for ${wanted} base${wanted === 1 ? "" : "s"}`;
}

function StanceTag({ stance }: { stance: Stance }) {
  if (stance === "neutral") return null;
  return (
    <span
      className={cn(
        "text-xs px-2 py-0.5 rounded-full border whitespace-nowrap",
        stance === "recommended"
          ? "border-accent/40 text-accent bg-accent-dim"
          : "border-danger/40 text-danger bg-danger/5",
      )}
    >
      {stance === "recommended" ? "★ Source's pick" : "Advised against"}
    </span>
  );
}

/** Describes a bracket the way a player thinks about it: the BRs they will meet. */
function brLabelFor(vehicleBr: number, tier: BaseHp, tiers: BaseHp[]): string {
  if (tiers.length === 1) return `${vehicleBr.toFixed(1)} and up`;
  return tier === tiers[0] ? "No uptier" : "Uptiered";
}
