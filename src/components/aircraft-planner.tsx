"use client";

import { useMemo } from "react";
import { effectiveBaseHp, reachableBaseHps } from "@/domain/base-hp";
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
import rewardConstantsData from "@/data/reward-constants.json";
import { loadoutRewardMul, type AircraftEconomy, type RewardConstants } from "@/domain/reward";
import type { Aircraft, Bomb, LoadoutOption, Schedule } from "@/domain/types";
import { AnimatedCount, AnimatedNumber } from "@/components/animated-number";
import { DropSchedule, ItemList } from "@/components/drop-schedule";
import { LoadoutNote } from "@/components/loadout-note";
import { RewardPanel } from "@/components/reward-panel";
import { Segmented } from "@/components/segmented";
import { ShareButton } from "@/components/share-button";
import { useI18n } from "@/i18n/client";
import type { ClientMessages } from "@/i18n/messages";
import { track } from "@/lib/analytics";
import { urlInteger, urlLiteral, useUrlState } from "@/lib/use-url-state";
import { cn } from "@/lib/utils";
import { withViewTransition } from "@/lib/view-transition";

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
  displayName,
  bombs,
  sourceUrl,
  splittable,
  economy,
}: {
  plane: Aircraft;
  /** The aircraft's name in the page's language. */
  displayName: string;
  bombs: Bomb[];
  sourceUrl: string;
  /** The game mounts this aircraft's ordnance per pylon, so part of a load can be left off. */
  splittable: boolean;
  /** The game's own earning figures; null where none matched. */
  economy: AircraftEconomy | null;
}) {
  const { m, number, count, fill } = useI18n();
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
          label={m.conditions.matchBr}
          value={String(baseHp)}
          onChange={(v) => {
            withViewTransition(() => {
              setHp(Number(v));
              setPicked(RECOMMENDED);
            });
            track("planner_adjusted", { control: "match_br", value: v });
          }}
          options={tiers.map((tier) => ({
            value: String(tier),
            label: brLabelFor(m, plane.br, tier, tiers),
            hint: fill(m.conditions.hpBases, { hp: number(tier) }),
          }))}
        />

        <Segmented
          label={m.conditions.gameMode}
          value={mode}
          onChange={(v) => {
            withViewTransition(() => setMode(v as GameMode));
            track("planner_adjusted", { control: "game_mode", value: v });
          }}
          options={[
            { value: "rb", label: m.conditions.realistic, hint: m.conditions.basesRespawn },
            { value: "ab", label: m.conditions.arcade, hint: m.conditions.doubleHealth },
          ]}
        />

        <Segmented
          label={m.conditions.basesOnMap}
          value={String(baseCount)}
          onChange={(v) => {
            withViewTransition(() => setMapSize(Number(v)));
            track("planner_adjusted", { control: "map_size", value: v });
          }}
          options={[
            { value: "4", label: m.conditions.four },
            { value: "3", label: m.conditions.three },
          ]}
        />

        <div className="space-y-1.5">
          <div className="text-xs uppercase tracking-wider text-ink-faint">{m.planner.basesToHit}</div>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: reach }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  withViewTransition(() => {
                    setTarget(n);
                    setPicked(RECOMMENDED);
                  });
                  track("planner_adjusted", { control: "target_bases", value: n });
                }}
                aria-pressed={n === wanted}
                className={cn(
                  "nums w-9 h-9 rounded-lg border text-sm transition motion-safe:active:scale-[0.97]",
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

      <section className="vt-item space-y-4">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold">
            {headingFor(m, count, stance, active === recommended, wanted, evaluated.length)}
          </h2>
          <StanceTag stance={stance} m={m} />
          <p className="text-sm text-ink-dim">
            <AnimatedCount forms={m.common.bases} value={shown.basesDestroyed} /> ·{" "}
            <ItemList items={mountedIn(shown)} />
            {active.option.rewardMultiplier !== null ? (
              <>
                {" "}
                ·{" "}
                <span className="text-ink">
                  <AnimatedNumber value={active.option.rewardMultiplier} format={{ maximumFractionDigits: 2 }} suffix="×" />
                </span>{" "}
                {m.planner.reward}
                {shown.trimmed ? m.planner.onFullLoad : ""}
              </>
            ) : null}
          </p>
          {picked !== RECOMMENDED && active !== recommended ? (
            <button
              type="button"
              onClick={() => withViewTransition(() => setPicked(RECOMMENDED))}
              className="text-sm text-accent underline underline-offset-4"
            >
              {m.planner.backToDefault}
            </button>
          ) : null}
          <ShareButton surface="planner" className="ml-auto" />
        </header>

        {active.option.note || active.option.noteMarker ? (
          <LoadoutNote option={active.option} sourceUrl={sourceUrl} />
        ) : null}

        {shown.source === "recomputed" ? (
          <p className="text-sm text-ink-dim border border-line bg-surface-2 rounded-lg px-3 py-2">
            {fill(m.planner.recalculated, {
              conditions: mode === "ab" ? m.planner.arcadeConditions : m.planner.theseConditions,
              hp: number(shown.effectiveHp),
              map: baseCount === 3 ? m.planner.onThreeBaseMap : "",
            })}
          </p>
        ) : null}

        {!splittable && wantedFewer ? (
          <p className="text-sm text-ink-dim border border-line bg-surface-2 rounded-lg px-3 py-2">
            {fill(m.planner.fixedSetup, { name: displayName })}
          </p>
        ) : null}

        {active.schedule.bracketNote ? (
          <p className="text-sm text-ink-faint">{active.schedule.bracketNote}</p>
        ) : null}

        <DropSchedule plan={shown} />
      </section>

      {evaluated.length > 1 ? (
        <section className="vt-item space-y-3">
          <h2 className="text-lg font-semibold">{m.planner.everyLoadout}</h2>
          <p className="text-sm text-ink-faint">{m.planner.everyLoadoutHint}</p>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-ink-faint">
                <tr className="hairline">
                  <th className="text-left font-normal px-3 py-2">{m.planner.columns.bases}</th>
                  <th className="text-left font-normal px-3 py-2">{m.planner.columns.reward}</th>
                  <th className="text-left font-normal px-3 py-2">{m.planner.columns.status}</th>
                  <th className="text-left font-normal px-3 py-2">{m.planner.columns.payload}</th>
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
                      <StanceTag stance={stanceOf(entry.option)} m={m} />
                    </td>
                    <td className="px-3 py-2 text-ink-dim">
                      <ItemList items={payloadOf(entry.schedule, bombsById)} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {entry === active ? (
                        <span className="text-xs text-accent">{m.planner.shownAbove}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            withViewTransition(() => setPicked(entry.index));
                            track("planner_adjusted", { control: "loadout_pick", value: entry.index });
                          }}
                          className="text-xs text-ink-dim hover:text-accent underline underline-offset-4"
                        >
                          {m.planner.show}
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

      {economy ? (
        <RewardPanel
          aircraftId={plane.id}
          economy={economy}
          mode={mode as GameMode}
          // The game's own payload multiplier, unrounded; the sheet's (×10 on the
          // loadout screen) only where that can't be worked out.
          sortie={
            active.option.rewardMultiplier !== null
              ? {
                  bases: shown.basesDestroyed,
                  baseHp: effectiveBaseHp(baseHp, "rb", baseCount),
                  payload:
                    loadoutRewardMul(
                      active.option,
                      (id) => bombsById.get(id)?.damageValue,
                      economy,
                      (rewardConstantsData as RewardConstants).bombing,
                    ) ?? active.option.rewardMultiplier / 10,
                }
              : null
          }
        />
      ) : null}
    </div>
  );
}

/**
 * Names the loadout on screen for what it actually is.
 *
 * Only the sheet's own star earns the word "recommended". Calling our own pick
 * that put the label on loadouts whose note directly underneath argued against
 * taking them, which is exactly backwards.
 */
function headingFor(
  m: ClientMessages,
  count: ReturnType<typeof useI18n>["count"],
  stance: Stance,
  isPick: boolean,
  wanted: number,
  choices: number,
): string {
  if (stance === "recommended") return m.planner.recommendedHeading;
  if (!isPick) return m.planner.thisLoadout;
  if (choices === 1) return m.planner.whatToTake;
  return count(m.planner.bestFor, wanted);
}

function StanceTag({ stance, m }: { stance: Stance; m: ClientMessages }) {
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
      {stance === "recommended" ? m.planner.recommendedTag : m.planner.advisedAgainst}
    </span>
  );
}

/** Describes a bracket the way a player thinks about it: the BRs they will meet. */
export function brLabelFor(m: ClientMessages, vehicleBr: number, tier: BaseHp, tiers: BaseHp[]): string {
  if (tiers.length === 1) return m.conditions.andUp.replace("{br}", vehicleBr.toFixed(1));
  return tier === tiers[0] ? m.conditions.noUptier : m.conditions.uptiered;
}
