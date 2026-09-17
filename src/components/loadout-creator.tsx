"use client";

import { ChevronDown } from "lucide-react";
import { useMemo } from "react";
import { brLabelFor } from "@/components/aircraft-planner";
import { DropSchedule, ItemList } from "@/components/drop-schedule";
import { Segmented } from "@/components/segmented";
import { reachableBaseHps } from "@/domain/base-hp";
import { BASE_COUNTS, GAME_MODES, type BaseCount, type BaseHp, type GameMode } from "@/domain/constants";
import {
  blockedIn,
  bombsIn,
  massOf,
  massOfOption,
  unmetIn,
  unpricedIn,
  violationsOf,
  type Armament,
  type Build,
  type SlotOption,
  type Violation,
} from "@/domain/loadout";
import { planPayload, type PlanItem } from "@/domain/schedule";
import type { Bomb } from "@/domain/types";
import { urlInteger, urlLiteral, useUrlState, type UrlCodec } from "@/lib/use-url-state";
import { cn, formatCount } from "@/lib/utils";

/** A build, comma-joined as `slot:option` pairs — every name in the data is plain alnum/underscore. */
function urlBuild(): UrlCodec<Build> {
  return {
    fallback: new Map(),
    parse: (raw) => {
      const build = new Map<number, string>();
      for (const pair of raw.split(",")) {
        const [slotText, option] = pair.split(":");
        const slot = Number(slotText);
        if (Number.isFinite(slot) && option) build.set(slot, option);
      }
      return build;
    },
    serialize: (value) =>
      value.size === 0 ? null : [...value].map(([slot, option]) => `${slot}:${option}`).join(","),
  };
}

/**
 * What a hardpoint choice is called on screen.
 *
 * Most options hang exactly one store, and the game's own full name is already
 * the right amount of detail — "500 lb AN-M64A1 bomb". A rack or a combination
 * of stores falls back to the shorter name so the line stays readable: "6 ×
 * AN-M64 500 lb + 2 × AIM-9B Sidewinder".
 */
function labelForOption(option: SlotOption): string {
  if (option.stores.length === 0) return option.name;
  if (option.stores.length === 1 && option.stores[0].count === 1) {
    return option.stores[0].store.name;
  }
  return option.stores
    .map(({ store, count }) => {
      const name = store.short ?? store.name;
      return count > 1 ? `${count} × ${name}` : name;
    })
    .join(" + ");
}

function labelFor(armament: Armament, slot: number, optionName: string): string {
  const option = armament.hardpoints.find((h) => h.index === slot)?.options.find((o) => o.name === optionName);
  return option ? labelForOption(option) : optionName;
}

const EMPTY = "";

export function LoadoutCreator({
  plane,
  armament,
  bombs,
}: {
  plane: { name: string; br: number };
  armament: Armament;
  bombs: Bomb[];
}) {
  const bombsById = useMemo(() => new Map(bombs.map((b) => [b.id, b])), [bombs]);
  const tiers = useMemo(() => reachableBaseHps(plane.br), [plane.br]);

  const [hp, setHp] = useUrlState("hp", urlInteger(tiers[0]));
  const [mode, setMode] = useUrlState("mode", urlLiteral(GAME_MODES, "rb"));
  const [mapSize, setMapSize] = useUrlState("map", urlInteger(4));
  const [build, setBuild] = useUrlState("build", urlBuild());

  const baseHp = (tiers.includes(hp as BaseHp) ? hp : tiers[0]) as BaseHp;
  const baseCount = (BASE_COUNTS as readonly number[]).includes(mapSize)
    ? (mapSize as BaseCount)
    : 4;

  const setSlot = (slot: number, option: string) => {
    const next = new Map(build);
    if (option === EMPTY) next.delete(slot);
    else next.set(slot, option);
    setBuild(next);
  };

  const massKg = massOf(build, armament);
  const overweight = armament.maxLoadKg !== null && massKg > armament.maxLoadKg;
  const violations = violationsOf(build, armament);
  const unmet = unmetIn(build, armament);
  const unpriced = unpricedIn(build, armament);

  const items = useMemo<PlanItem[]>(
    () =>
      bombsIn(build, armament)
        .flatMap(({ bombId, count }) => {
          const bomb = bombsById.get(bombId);
          return bomb ? [{ bomb, count }] : [];
        })
        .sort((a, b) => (b.bomb.damageValue ?? 0) - (a.bomb.damageValue ?? 0)),
    [build, armament, bombsById],
  );

  const plan = useMemo(
    () => planPayload(items, { baseHp, mode: mode as GameMode, baseCount }),
    [items, baseHp, mode, baseCount],
  );

  return (
    <div className="space-y-6">
      <section className="card p-4 sm:p-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Segmented
          label="Match BR"
          value={String(baseHp)}
          onChange={(v) => setHp(Number(v))}
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
      </section>

      <section className="card p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-faint">Total load</p>
            <p className={cn("nums text-lg font-semibold", overweight ? "text-danger" : "text-ink")}>
              {formatCount(Math.round(massKg))} kg
              {armament.maxLoadKg !== null ? (
                <span className="text-sm font-normal text-ink-faint">
                  {" "}
                  of {formatCount(armament.maxLoadKg)} kg
                </span>
              ) : null}
            </p>
          </div>
          {build.size > 0 ? (
            <button
              type="button"
              onClick={() => setBuild(new Map())}
              className="text-sm text-ink-faint hover:text-accent underline underline-offset-4"
            >
              clear all
            </button>
          ) : null}
        </div>
        {armament.maxLoadKg !== null ? (
          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div
              className={cn("h-full rounded-full", overweight ? "bg-danger" : "bg-accent")}
              style={{ width: `${Math.min((massKg / armament.maxLoadKg) * 100, 100)}%` }}
            />
          </div>
        ) : null}
      </section>

      {violations.length > 0 ? (
        <div className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2.5 space-y-1 text-sm">
          <p className="text-xs uppercase tracking-wider text-danger">Can&apos;t be flown</p>
          {violations.map((violation, i) => (
            <p key={i} className="text-ink-dim">
              {describeViolation(violation, armament)}
            </p>
          ))}
        </div>
      ) : null}

      {unmet.length > 0 ? (
        <div className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2.5 space-y-1 text-sm">
          <p className="text-xs uppercase tracking-wider text-warn">Worth checking</p>
          {unmet.map((dep, i) => (
            <p key={i} className="text-ink-dim">
              Pylon {dep.slot}&apos;s {labelFor(armament, dep.slot, dep.option)} usually comes with pylon{" "}
              {dep.needsSlot}&apos;s {labelFor(armament, dep.needsSlot, dep.needsOption)}, which isn&apos;t
              mounted.
            </p>
          ))}
        </div>
      ) : null}

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {armament.hardpoints.map((hardpoint) => {
          const current = build.get(hardpoint.index) ?? EMPTY;
          const blocked = blockedIn(armament, build, hardpoint.index);
          const currentOption = hardpoint.options.find((o) => o.name === current);
          const currentMass = currentOption ? massOfOption(currentOption) : 0;

          return (
            <li key={hardpoint.index} className="card p-3.5 space-y-2">
              <p className="text-xs uppercase tracking-wider text-ink-faint">
                Pylon {hardpoint.index}
              </p>
              <div className="relative">
                <select
                  value={current}
                  onChange={(e) => setSlot(hardpoint.index, e.target.value)}
                  className="w-full appearance-none card bg-surface px-3 py-2 pr-8 text-sm outline-none focus:border-accent transition-colors"
                >
                  <option value={EMPTY}>— Empty —</option>
                  {hardpoint.options.map((option) => (
                    <option key={option.name} value={option.name} disabled={blocked.has(option.name)}>
                      {labelForOption(option)}
                      {blocked.has(option.name) ? " (unavailable)" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  aria-hidden
                  size={16}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
                />
              </div>
              <p className="nums text-xs text-ink-faint">
                {currentOption ? `${formatCount(Math.round(currentMass))} kg` : "empty"}
              </p>
            </li>
          );
        })}
      </ol>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">What it drops</h2>
        <p className="text-sm text-ink-dim">
          {plan.basesDestroyed} base{plan.basesDestroyed === 1 ? "" : "s"}
          {items.length > 0 ? (
            <>
              {" "}
              · <ItemList items={items} />
            </>
          ) : null}
        </p>

        {unpriced.length > 0 ? (
          <p className="text-sm text-ink-dim border border-line bg-surface-2 rounded-lg px-3 py-2">
            Also carrying: {unpriced.map((s) => s.name).join(", ")} — the bomb chart doesn&apos;t price
            these, so they&apos;re left out of the count above.
          </p>
        ) : null}

        <DropSchedule plan={plan} />
      </section>
    </div>
  );
}

function describeViolation(violation: Violation, armament: Armament): string {
  if (violation.kind === "overweight") {
    const over = Math.round(violation.kg - violation.limitKg);
    return `${formatCount(Math.round(violation.kg))} kg carried — ${formatCount(over)} kg past the ${formatCount(violation.limitKg)} kg the airframe can lift.`;
  }
  const a = `pylon ${violation.a.slot}'s ${labelFor(armament, violation.a.slot, violation.a.option)}`;
  const b = `pylon ${violation.b.slot}'s ${labelFor(armament, violation.b.slot, violation.b.option)}`;
  return `${a[0].toUpperCase()}${a.slice(1)} can't be carried with ${b}.`;
}
