"use client";

import {
  Bomb as BombGlyph,
  Crosshair,
  Fuel,
  Package,
  Rocket,
  Sparkles,
  Target,
} from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
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

  optionAt,
  unmetIn,
  unpricedIn,
  violationsOf,
  type Armament,
  type Blocker,
  type Build,
  type SlotOption,
  type StoreKind,
  type Violation,
} from "@/domain/loadout";
import { planPayload, type PlanItem } from "@/domain/schedule";
import type { Bomb } from "@/domain/types";
import { bombIconUrl, bombIconsById } from "@/lib/assets";
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

/** The headings the game's own loadout menu groups its list under, in its order. */
const GROUPS: { kind: StoreKind[]; label: string }[] = [
  { kind: ["bomb", "mine", "torpedo"], label: "Bombs" },
  { kind: ["rocket"], label: "Rockets" },
  { kind: ["missile"], label: "Missiles" },
  { kind: ["gun"], label: "Cannons & machine guns" },
  { kind: ["tank"], label: "Fuel tanks" },
  { kind: ["pod", "countermeasure", "other"], label: "Pods & other" },
];

/**
 * Named the way the game's own menu does it: the store's name, with the round
 * count in front once a rack or rail makes it more than one — "2 × R-60M",
 * not an R-60M that happens to weigh twice as much.
 */
function labelForOption(option: SlotOption): string {
  if (option.stores.length === 0) return option.name;
  return option.stores
    .map(({ store, count }) => {
      const rounds = count * store.holds;
      return rounds > 1 ? `${rounds} × ${store.name}` : store.name;
    })
    .join(" + ");
}

function labelFor(armament: Armament, slot: number, optionName: string): string {
  const option = armament.hardpoints
    .find((h) => h.index === slot)
    ?.options.find((o) => o.name === optionName);
  return option ? labelForOption(option) : optionName;
}

/** The kind that decides which heading a choice is filed under. */
const kindOf = (option: SlotOption): StoreKind => option.stores[0]?.store.kind ?? "other";

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
  const [rawBuild, setBuild] = useUrlState("build", urlBuild());
  const [editing, setEditing] = useState(armament.hardpoints[0]?.index ?? 1);

  // A link can name a choice this aircraft no longer offers — an old build after
  // a data update, or a hand-edited URL. Those drop out rather than sit on a
  // pylon as something that can be neither shown nor removed.
  const build = useMemo<Build>(
    () => new Map([...rawBuild].filter(([slot, name]) => optionAt(armament, slot, name) !== null)),
    [rawBuild, armament],
  );

  const baseHp = (tiers.includes(hp as BaseHp) ? hp : tiers[0]) as BaseHp;
  const baseCount = (BASE_COUNTS as readonly number[]).includes(mapSize)
    ? (mapSize as BaseCount)
    : 4;

  const setSlot = (slot: number, option: string | null) => {
    const next = new Map(build);
    if (option === null) next.delete(slot);
    else next.set(slot, option);
    setBuild(next);
  };

  const massKg = massOf(build, armament);
  const overweight = armament.maxLoadKg !== null && massKg > armament.maxLoadKg;
  const violations = violationsOf(build, armament);
  const unmet = unmetIn(build, armament);
  const unpriced = unpricedIn(build, armament);

  const hardpoint = armament.hardpoints.find((h) => h.index === editing);
  const blocked = hardpoint ? blockedIn(armament, build, editing) : new Map<string, Blocker>();

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

      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3">
          <p className="text-sm text-ink-dim">
            Editing <span className="text-ink">pylon {editing}</span>
          </p>
          <p className="nums text-sm">
            <span className="text-ink-faint">Mass: </span>
            <span className={cn("font-semibold", overweight ? "text-danger" : "text-ink")}>
              {formatCount(Math.round(massKg))}
            </span>
            {armament.maxLoadKg !== null ? (
              <span className="text-ink-faint"> / {formatCount(armament.maxLoadKg)} kg</span>
            ) : null}
          </p>
        </header>

        <div className="max-h-[26rem] overflow-y-auto px-2 py-2">
          <OptionRow
            label="Empty"
            detail="nothing on this pylon"
            selected={!build.has(editing)}
            onSelect={() => setSlot(editing, null)}
          />
          {GROUPS.map((group) => {
            const options = (hardpoint?.options ?? []).filter((o) => group.kind.includes(kindOf(o)));
            if (options.length === 0) return null;
            return (
              <div key={group.label} className="mt-2">
                <p className="px-2 py-1 text-xs uppercase tracking-wider text-accent">
                  {group.label}
                </p>
                {options.map((option) => {
                  const blocker = blocked.get(option.name);
                  return (
                    <OptionRow
                      key={option.name}
                      label={labelForOption(option)}
                      detail={`Mass: ${formatCount(Math.round(massOfOption(option)))} kg`}
                      glyph={<StoreGlyph option={option} size={18} />}
                      selected={build.get(editing) === option.name}
                      blocked={blocker ? describeBlocker(blocker, armament) : null}
                      onSelect={() => setSlot(editing, option.name)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="border-t border-line px-3 py-3 overflow-x-auto">
          <div className="flex gap-1 justify-center min-w-max">
            {armament.hardpoints.map((point) => {
              const chosen = build.get(point.index);
              const option = chosen
                ? point.options.find((o) => o.name === chosen)
                : undefined;
              return (
                <button
                  key={point.index}
                  type="button"
                  onClick={() => setEditing(point.index)}
                  aria-pressed={point.index === editing}
                  title={option ? labelForOption(option) : `Pylon ${point.index} — empty`}
                  className={cn(
                    "w-12 h-14 shrink-0 rounded-md border flex flex-col items-center justify-center gap-1 transition-colors",
                    point.index === editing
                      ? "border-accent bg-accent-dim"
                      : option
                        ? "border-line-bright bg-surface-2 hover:border-accent/60"
                        : "border-line border-dashed hover:border-line-bright",
                  )}
                >
                  {option ? (
                    <StoreGlyph option={option} size={20} />
                  ) : (
                    <span className="text-ink-faint text-lg leading-none">·</span>
                  )}
                  <span
                    className={cn(
                      "nums text-[10px]",
                      point.index === editing ? "text-accent" : "text-ink-faint",
                    )}
                  >
                    {point.index}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
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
              Pylon {dep.slot}&apos;s {labelFor(armament, dep.slot, dep.option)} usually comes with
              pylon {dep.needsSlot}&apos;s {labelFor(armament, dep.needsSlot, dep.needsOption)}, which
              isn&apos;t mounted.
            </p>
          ))}
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-semibold">What it drops</h2>
          {build.size > 0 ? (
            <button
              type="button"
              onClick={() => setBuild(new Map())}
              className="text-sm text-ink-faint hover:text-accent underline underline-offset-4"
            >
              clear the aircraft
            </button>
          ) : null}
        </div>
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
            Also carrying: {unpriced.map((s) => s.name).join(", ")} — the bomb chart doesn&apos;t
            price these, so they&apos;re left out of the count above.
          </p>
        ) : null}

        <DropSchedule plan={plan} />
      </section>
    </div>
  );
}

/** The game's own icon for a choice, where it hangs something the chart knows. */
/**
 * The game's own artwork for a choice, where there is any.
 *
 * The choice's own icon comes first — it is what the preset itself states,
 * which is the only thing that knows how many are mounted (a twin missile
 * rail draws differently from one off the same file; a weapon's own icon
 * cannot tell you that). Only the ~2% of presets that state none fall through
 * to a store's own icon — the bomb chart's match for a bomb or rocket, or
 * whatever the weapon file names directly for anything else.
 */
function iconFor(option: SlotOption): string | null {
  if (option.iconType) return bombIconUrl(option.iconType);
  for (const { store } of option.stores) {
    const iconType = (store.bomb ? bombIconsById[store.bomb.id] : undefined) ?? store.iconType;
    if (iconType) return bombIconUrl(iconType);
  }
  return null;
}

/**
 * A stand-in for stores the game gives us no artwork for.
 *
 * Bombs carry the game's own weapon-selector icon, matched through the chart;
 * everything else — missiles, tanks, gun pods — has none to match, so the shape
 * says what sort of thing it is rather than leaving the row blank.
 */
const GLYPHS: Record<StoreKind, typeof Rocket> = {
  bomb: BombGlyph,
  mine: BombGlyph,
  torpedo: BombGlyph,
  rocket: Rocket,
  missile: Target,
  gun: Crosshair,
  tank: Fuel,
  pod: Package,
  countermeasure: Sparkles,
  other: Package,
};

function StoreGlyph({ option, size }: { option: SlotOption; size: number }) {
  const icon = iconFor(option);
  if (icon) return <Image src={icon} alt="" width={size} height={size} />;

  const Glyph = GLYPHS[kindOf(option)];
  return <Glyph aria-hidden size={size - 2} className="text-ink-faint" />;
}

function OptionRow({
  label,
  detail,
  glyph,
  selected,
  blocked,
  onSelect,
}: {
  label: string;
  detail: string;
  glyph?: React.ReactNode;
  selected: boolean;
  blocked?: string | null;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={Boolean(blocked)}
      aria-pressed={selected}
      className={cn(
        "w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        blocked
          ? "cursor-not-allowed opacity-45"
          : selected
            ? "bg-accent-dim text-accent"
            : "hover:bg-surface-2",
      )}
    >
      <span className="w-5 shrink-0 flex justify-center">{glyph}</span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate", selected ? "text-accent" : "text-ink")}>{label}</span>
        <span className="nums block truncate text-xs text-ink-faint">{blocked ?? detail}</span>
      </span>
    </button>
  );
}

function describeBlocker(blocker: Blocker, armament: Armament): string {
  if (blocker.reason === "weight") {
    return `${formatCount(Math.round(blocker.overBy))} kg over the limit`;
  }
  return `clashes with pylon ${blocker.withSlot}'s ${labelFor(armament, blocker.withSlot, blocker.withOption)}`;
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
