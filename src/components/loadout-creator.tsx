"use client";

import {
  Bomb as BombGlyph,
  CircleHelp,
  Crosshair,
  Fuel,
  GripVertical,
  Info,
  Package,
  Rocket,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as motion from "motion/react-m";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { brLabelFor } from "@/components/aircraft-planner";
import { AnimatedCount, AnimatedNumber } from "@/components/animated-number";
import { DropSchedule, ItemList } from "@/components/drop-schedule";
import { DraggableChoice, DropZone, LoadoutDnd, PylonTarget, useDragging } from "@/components/loadout-dnd";
import { MassBar } from "@/components/mass-bar";
import { MotionProvider } from "@/components/motion-provider";
import { RewardPanel } from "@/components/reward-panel";
import { Segmented } from "@/components/segmented";
import { ShareButton } from "@/components/share-button";
import { effectiveBaseHp, reachableBaseHps } from "@/domain/base-hp";
import {
  BASE_COUNTS,
  GAME_MODES,
  type BaseCount,
  type BaseHp,
  type GameMode,
  type VehicleCategory,
} from "@/domain/constants";
import { useI18n } from "@/i18n/client";
import type { ClientMessages } from "@/i18n/messages";
import { track } from "@/lib/analytics";
import {
  applyDrop,
  blockedIn,
  bombsIn,
  massOf,
  massOfOption,
  optionAt,
  unmetIn,
  unpricedIn,
  violationsOf,
  weaponDamageOf,
  type Armament,
  type Blocker,
  type Build,
  type DragSource,
  type DropResult,
  type DropTarget,
  type SlotOption,
  type StoreKind,
  type Violation,
} from "@/domain/loadout";
import rewardConstantsData from "@/data/reward-constants.json";
import {
  presetRewardMul,
  rewardMultiplier,
  type AircraftEconomy,
  type RewardConstants,
} from "@/domain/reward";
import { planPayload, type PlanItem } from "@/domain/schedule";
import type { Bomb } from "@/domain/types";
import { bombIconUrl, bombIconsById } from "@/lib/assets";
import { toast } from "@/lib/toast";
import { useMediaQuery } from "@/lib/use-media-query";
import { urlInteger, urlLiteral, useUrlState, type UrlCodec } from "@/lib/use-url-state";
import { cn } from "@/lib/utils";
import { withViewTransition } from "@/lib/view-transition";

const rewardConstants = rewardConstantsData as RewardConstants;

/** Phones only, so vaul never reaches a desktop's download. */
const PylonSheet = dynamic(() => import("@/components/pylon-sheet").then((mod) => mod.PylonSheet));

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

const MASS_UNITS = ["kg", "lb"] as const;
type MassUnit = (typeof MASS_UNITS)[number];

/** A mass in the unit picked — most bombs are named in pounds, the airframe's limit comes in kilograms. */
function massIn(kg: number, unit: MassUnit): number {
  return Math.round(unit === "lb" ? kg * 2.20462 : kg);
}

/**
 * What the module-level helpers below need to speak the page's language: its
 * words, its number format, and the game's own name for each weapon.
 */
type Words = {
  m: ClientMessages;
  number: (value: number) => string;
  fill: (template: string, vars: Record<string, string | number>) => string;
  /** A weapon's name as the game's client in this language shows it. */
  weapon: (english: string) => string;
};

function formatMass(kg: number, unit: MassUnit, w: Words): string {
  return `${w.number(massIn(kg, unit))} ${unit}`;
}

/** The headings the game's own loadout menu groups its list under, in its order. */
const GROUPS: { kind: StoreKind[]; key: keyof ClientMessages["creator"]["groups"] }[] = [
  { kind: ["bomb", "mine", "torpedo"], key: "bombs" },
  { kind: ["rocket"], key: "rockets" },
  { kind: ["missile"], key: "missiles" },
  { kind: ["gun"], key: "guns" },
  { kind: ["tank"], key: "tanks" },
  { kind: ["pod", "countermeasure", "other"], key: "other" },
];

/**
 * Named the way the game's own menu does it: the store's name, with the round
 * count in front once a rack or rail makes it more than one — "2 × R-60M",
 * not an R-60M that happens to weigh twice as much.
 */
function labelForOption(option: SlotOption, w: Words): string {
  if (option.stores.length === 0) return option.name;
  return option.stores
    .map(({ store, count }) => {
      const rounds = count * store.holds;
      const name = w.weapon(store.name);
      return rounds > 1 ? `${rounds} × ${name}` : name;
    })
    .join(" + ");
}

function labelFor(armament: Armament, slot: number, optionName: string, w: Words): string {
  const option = armament.hardpoints
    .find((h) => h.index === slot)
    ?.options.find((o) => o.name === optionName);
  return option ? labelForOption(option, w) : optionName;
}

/** The kind that decides which heading a choice is filed under. */
const kindOf = (option: SlotOption): StoreKind => option.stores[0]?.store.kind ?? "other";

const HOW_TO_KEY = "wtbc:creator-how-to";

/**
 * Whether the instructions were closed on an earlier visit. Read straight from
 * storage: the creator is never prerendered (it mounts only once its tab is
 * open, after hydration), so there is no server render for this to disagree with.
 */
function readHowToHidden(): boolean {
  try {
    return localStorage.getItem(HOW_TO_KEY) === "hidden";
  } catch {
    return false;
  }
}

export function LoadoutCreator({
  plane,
  armament,
  bombs,
  weaponNames,
  economy,
}: {
  plane: { id: string; name: string; br: number; category: VehicleCategory };
  armament: Armament;
  bombs: Bomb[];
  /** English weapon name to the page language's; null in English. */
  weaponNames: Record<string, string> | null;
  /** The game's own earning figures; null where none matched the aircraft. */
  economy: AircraftEconomy | null;
}) {
  const { m, number, fill, count } = useI18n();
  const w = useMemo<Words>(
    () => ({ m, number, fill, weapon: (english) => weaponNames?.[english] ?? english }),
    [m, number, fill, weaponNames],
  );
  const bombsById = useMemo(() => new Map(bombs.map((b) => [b.id, b])), [bombs]);
  const tiers = useMemo(() => reachableBaseHps(plane.br), [plane.br]);

  const [hp, setHp] = useUrlState("hp", urlInteger(tiers[0]));
  const [mode, setMode] = useUrlState("mode", urlLiteral(GAME_MODES, "rb"));
  const [mapSize, setMapSize] = useUrlState("map", urlInteger(4));
  const [rawBuild, setBuild] = useUrlState("build", urlBuild());
  const [unit, setUnit] = useUrlState("unit", urlLiteral(MASS_UNITS, "kg"));
  const [editing, setEditing] = useState(armament.hardpoints[0]?.index ?? 1);
  const narrow = useMediaQuery("(max-width: 639px)");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [howToHidden, setHowToHidden] = useState(readHowToHidden);

  const toggleHowTo = (hidden: boolean) => {
    setHowToHidden(hidden);
    try {
      if (hidden) localStorage.setItem(HOW_TO_KEY, "hidden");
      else localStorage.removeItem(HOW_TO_KEY);
    } catch {
      // Storage denied — it just shows again next visit.
    }
  };

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
    // Fired once per session, on the transition from an empty build to a
    // real one — a click that means "I'm building my own loadout", not
    // every pylon toggle after that.
    if (build.size === 0 && option !== null) {
      track("loadout_creator_used", { plane: plane.name });
    }
    const next = new Map(build);
    if (option === null) next.delete(slot);
    else next.set(slot, option);
    setBuild(next);
  };

  /** Applies a change that can take things off, with the toast that undoes it. */
  const commit = (next: Build, message: string | null) => {
    const previous = build;
    if (build.size === 0 && next.size > 0) track("loadout_creator_used", { plane: plane.name });
    setBuild(next);
    if (message) toast(message, { action: { label: m.common.undo, onClick: () => setBuild(previous) } });
  };

  const handleDrop = (result: DropResult, source: DragSource, target: DropTarget) => {
    const added = result.build.size - build.size;
    const message =
      target.to === "remove"
        ? fill(m.creator.takenOff, { n: source.slot })
        : target.to === "all"
          ? count(m.creator.alsoHung, added)
          : result.displaced.length > 0
            ? fill(m.creator.replaced, {
                what: labelFor(armament, result.displaced[0].slot, result.displaced[0].option, w),
                n: result.displaced[0].slot,
              })
            : null;
    commit(result.build, message);
    if (target.to === "pylon") setEditing(target.slot);
    if (source.from === "menu") setSheetOpen(false);
    track("loadout_creator_dragged", { plane: plane.name, from: source.from, to: target.to });
  };

  const massKg = massOf(build, armament);
  const overweight = armament.maxLoadKg !== null && massKg > armament.maxLoadKg;
  const violations = violationsOf(build, armament);
  const unmet = unmetIn(build, armament);
  const unpriced = unpricedIn(build, armament);

  const hardpoint = armament.hardpoints.find((h) => h.index === editing);
  const blocked = hardpoint ? blockedIn(armament, build, editing) : new Map<string, Blocker>();
  const editingOption = build.get(editing);
  const fillAll = editingOption
    ? applyDrop(build, armament, { from: "pylon", slot: editing, option: editingOption }, { to: "all" })
    : null;

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

  /**
   * The editing hardpoint's menu — inline beside the pylons on a wide screen,
   * in a bottom sheet on a phone. Its choices drag onto a pylon from either.
   */
  const menu = (afterPick: () => void) => {
    const pick = (option: string | null) => {
      setSlot(editing, option);
      afterPick();
    };
    return (
      <>
        <OptionRow
          label={m.creator.empty}
          detail={m.creator.nothingOnPylon}
          selected={!build.has(editing)}
          onSelect={() => pick(null)}
        />
        {GROUPS.map((group) => {
          const options = (hardpoint?.options ?? []).filter((o) => group.kind.includes(kindOf(o)));
          if (options.length === 0) return null;
          return (
            <div key={group.key} className="mt-2">
              <p className="px-2 py-1 text-xs uppercase tracking-wider text-accent">{m.creator.groups[group.key]}</p>
              {options.map((option) => {
                const blocker = blocked.get(option.name);
                return (
                  <DraggableChoice key={option.name} slot={editing} option={option.name} disabled={Boolean(blocker)}>
                    {(ref) => (
                      <OptionRow
                        buttonRef={ref}
                        draggable={!blocker}
                        label={labelForOption(option, w)}
                        detail={fill(m.creator.massDetail, { mass: formatMass(massOfOption(option), unit, w) })}
                        glyph={<StoreGlyph option={option} size={18} />}
                        selected={build.get(editing) === option.name}
                        blocked={blocker ? describeBlocker(blocker, armament, unit, w) : null}
                        onSelect={() => pick(option.name)}
                      />
                    )}
                  </DraggableChoice>
                );
              })}
            </div>
          );
        })}
      </>
    );
  };

  // The game's own price for what's hung; the chart's figures only where the
  // game data prices nothing on this aircraft.
  const gameDamage = weaponDamageOf(build, armament);
  const damage =
    gameDamage > 0 ? gameDamage : items.reduce((sum, { bomb, count }) => sum + (bomb.damageValue ?? 0) * count, 0);
  const earner = economy ?? {
    goldPriced: plane.category.startsWith("premium"),
    fighter: plane.category.endsWith("fighter"),
  };

  return (
    <MotionProvider>
      <div className="space-y-6">
        <section className="card p-4 sm:p-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Segmented
            label={m.conditions.matchBr}
            value={String(baseHp)}
            onChange={(v) => withViewTransition(() => setHp(Number(v)))}
            options={tiers.map((tier) => ({
              value: String(tier),
              label: brLabelFor(m, plane.br, tier, tiers),
              hint: fill(m.conditions.hpBases, { hp: number(tier) }),
            }))}
          />
          <Segmented
            label={m.conditions.gameMode}
            value={mode}
            onChange={(v) => withViewTransition(() => setMode(v as GameMode))}
            options={[
              { value: "rb", label: m.conditions.realistic, hint: m.conditions.basesRespawn },
              { value: "ab", label: m.conditions.arcade, hint: m.conditions.doubleHealth },
            ]}
          />
          <Segmented
            label={m.conditions.basesOnMap}
            value={String(baseCount)}
            onChange={(v) => withViewTransition(() => setMapSize(Number(v)))}
            options={[
              { value: "4", label: m.conditions.four, hint: m.conditions.mostMaps },
              {
                value: "3",
                label: m.conditions.three,
                hint: fill(m.conditions.hpBases, { hp: number(effectiveBaseHp(baseHp, mode, 3)) }),
              },
            ]}
          />
        </section>

        {howToHidden ? null : (
          <HowTo
            steps={
              narrow
                ? [m.creator.tapAPylon, m.creator.howToHoldChoice, m.creator.howToHold]
                : [m.creator.howToPick, m.creator.howToDrag, m.creator.howToMove]
            }
            onHide={() => toggleHowTo(true)}
          />
        )}

        <LoadoutDnd
          build={build}
          armament={armament}
          onDrop={handleDrop}
          renderOverlay={(source) => {
            const option = optionAt(armament, source.slot, source.option);
            return (
              <span className="flex items-center gap-2 text-sm text-ink">
                {option ? <StoreGlyph option={option} size={20} /> : null}
                <span className="truncate">{labelFor(armament, source.slot, source.option, w)}</span>
              </span>
            );
          }}
        >
          <section className="card overflow-hidden">
            <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3">
              <p className="flex flex-wrap items-baseline gap-x-3 text-sm text-ink-dim">
                <span>
                  {m.creator.editing} <span className="text-ink">{fill(m.creator.pylon, { n: editing })}</span>
                </span>
                {fillAll ? (
                  <button
                    type="button"
                    onClick={() => {
                      const added = fillAll.build.size - build.size;
                      commit(fillAll.build, count(m.creator.alsoHung, added));
                    }}
                    className="text-accent underline underline-offset-4 hover:text-ink"
                  >
                    {fill(m.creator.alsoOnEveryFree, { n: fillAll.build.size - build.size })}
                  </button>
                ) : null}
              </p>
              <div className="flex items-center gap-3">
                {howToHidden ? (
                  <button
                    type="button"
                    onClick={() => toggleHowTo(false)}
                    aria-label={m.creator.howTo}
                    title={m.creator.howTo}
                    className="text-ink-faint transition-colors hover:text-accent"
                  >
                    <CircleHelp size={16} aria-hidden />
                  </button>
                ) : null}
                <p className="nums text-sm">
                  <span className="text-ink-faint">{m.creator.mass}</span>
                  <span className={cn("font-semibold", overweight ? "text-danger" : "text-ink")}>
                    <AnimatedNumber value={massIn(massKg, unit)} suffix={` ${unit}`} />
                  </span>
                  {armament.maxLoadKg !== null ? (
                    <span className="text-ink-faint"> / {formatMass(armament.maxLoadKg, unit, w)}</span>
                  ) : null}
                </p>
                <div role="group" aria-label={m.creator.massUnit} className="flex rounded-md border border-line text-xs">
                  {MASS_UNITS.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnit(u)}
                      aria-pressed={unit === u}
                      className={cn(
                        "px-2 py-0.5 transition-colors",
                        unit === u ? "bg-accent-dim text-accent" : "text-ink-faint hover:text-ink",
                      )}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              {armament.maxLoadKg !== null ? (
                <div className="basis-full pt-1">
                  <MassBar massKg={massKg} limitKg={armament.maxLoadKg} />
                </div>
              ) : null}
            </header>

            <div className="relative">
              {narrow ? (
                <p className="px-4 py-3 text-sm text-ink-dim">
                  {m.creator.tapAPylon}
                </p>
              ) : (
                <div className="max-h-[26rem] overflow-y-auto px-2 py-2">{menu(() => {})}</div>
              )}
              {/* Over the list's foot rather than in the flow, so the pylons don't
                  shift under the pointer the moment a drag begins. */}
              <div className="pointer-events-none absolute inset-x-2 bottom-2 space-y-2 [&>*]:pointer-events-auto [&>*]:bg-surface/95">
                <DropZone kind="all">{m.creator.dropOnAll}</DropZone>
                <DropZone kind="remove">{m.creator.dropToRemove}</DropZone>
              </div>
            </div>

            <div className="border-t border-line px-3 py-3 overflow-x-auto">
              <div className="flex gap-1 justify-center min-w-max">
                {armament.hardpoints.map((point) => {
                  const chosen = build.get(point.index);
                  const option = chosen
                    ? point.options.find((o) => o.name === chosen)
                    : undefined;
                  return (
                    <PylonTarget key={point.index} slot={point.index} option={chosen} className="shrink-0">
                      {(state, over, ref) => (
                        <button
                          ref={ref}
                          type="button"
                          onClick={() => {
                            setEditing(point.index);
                            if (narrow) setSheetOpen(true);
                          }}
                          aria-pressed={point.index === editing}
                          title={
                            state.kind === "blocked" && state.blocker
                              ? describeBlocker(state.blocker, armament, unit, w)
                              : state.kind === "incompatible"
                                ? fill(m.creator.cantHang, { n: point.index })
                                : option
                                  ? labelForOption(option, w)
                                  : fill(m.creator.emptyPylon, { n: point.index })
                          }
                          className={cn(
                            "w-12 h-14 rounded-md border flex flex-col items-center justify-center gap-1 transition",
                            point.index === editing
                              ? "border-accent bg-accent-dim"
                              : option
                                ? "border-line-bright bg-surface-2 hover:border-accent/60"
                                : "border-line border-dashed hover:border-line-bright",
                            state.kind === "ok" && "outline-2 outline-dashed outline-offset-2 outline-accent/70",
                            over && "scale-110 bg-accent-dim outline-accent",
                            state.kind === "blocked" && "opacity-40",
                            state.kind === "incompatible" && "opacity-20",
                          )}
                        >
                          <AnimatePresence initial={false}>
                            <motion.span
                              key={option?.name ?? "empty"}
                              initial={{ scale: 0.4, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ type: "spring", stiffness: 500, damping: 24 }}
                              className="flex h-5 items-center"
                            >
                              {option ? (
                                <StoreGlyph option={option} size={20} />
                              ) : (
                                <span className="text-ink-faint text-lg leading-none">·</span>
                              )}
                            </motion.span>
                          </AnimatePresence>
                          <span
                            className={cn(
                              "nums text-[10px]",
                              point.index === editing ? "text-accent" : "text-ink-faint",
                            )}
                          >
                            {point.index}
                          </span>
                        </button>
                      )}
                    </PylonTarget>
                  );
                })}
              </div>
            </div>
          </section>
          {narrow ? (
            <MenuSheet
              open={sheetOpen}
              onOpenChange={setSheetOpen}
              title={fill(m.creator.pylonSheetTitle, { n: editing })}
              description={m.creator.pickWhatItCarries}
            >
              {menu(() => setSheetOpen(false))}
            </MenuSheet>
          ) : null}
        </LoadoutDnd>

        {violations.length > 0 ? (
          <div className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2.5 space-y-1 text-sm">
            <p className="text-xs uppercase tracking-wider text-danger">{m.creator.cantBeFlown}</p>
            {violations.map((violation, i) => (
              <p key={i} className="text-ink-dim">
                {describeViolation(violation, armament, unit, w)}
              </p>
            ))}
          </div>
        ) : null}

        {unmet.length > 0 ? (
          <div className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2.5 space-y-1 text-sm">
            <p className="text-xs uppercase tracking-wider text-warn">{m.creator.worthChecking}</p>
            {unmet.map((dep, i) => (
              <p key={i} className="text-ink-dim">
                {fill(m.creator.usuallyWith, {
                  n: dep.slot,
                  what: labelFor(armament, dep.slot, dep.option, w),
                  other: dep.needsSlot,
                  otherWhat: labelFor(armament, dep.needsSlot, dep.needsOption, w),
                })}
              </p>
            ))}
          </div>
        ) : null}

        <section className="vt-item space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-lg font-semibold">{m.creator.whatItDrops}</h2>
            <div className="flex items-center gap-3">
              {build.size > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const previous = build;
                    setBuild(new Map());
                    toast(m.creator.cleared, {
                      action: { label: m.common.undo, onClick: () => setBuild(previous) },
                    });
                  }}
                  className="text-sm text-ink-faint hover:text-accent underline underline-offset-4"
                >
                  {m.creator.clearAircraft}
                </button>
              ) : null}
              {build.size > 0 ? <ShareButton surface="loadout_creator" /> : null}
            </div>
          </div>
          <p className="text-sm text-ink-dim">
            <AnimatedCount forms={m.common.bases} value={plan.basesDestroyed} />
            {items.length > 0 ? (
              <>
                {" "}
                · <ItemList items={items} />
              </>
            ) : null}
            {damage > 0 ? (
              <>
                {" "}
                ·{" "}
                <span className="text-ink">
                  <AnimatedNumber
                    value={rewardMultiplier(damage, earner, rewardConstants.bombing)}
                    format={{ maximumFractionDigits: 1 }}
                    suffix="×"
                  />
                </span>{" "}
                {m.creator.reward}
              </>
            ) : null}
          </p>

          {unpriced.length > 0 ? (
            <p className="text-sm text-ink-dim border border-line bg-surface-2 rounded-lg px-3 py-2">
              {fill(m.creator.alsoCarrying, { stores: unpriced.map((s) => w.weapon(s.name)).join(", ") })}
            </p>
          ) : null}

          <DropSchedule plan={plan} />
        </section>

        {economy ? (
          <RewardPanel
            aircraftId={plane.id}
            economy={economy}
            mode={mode as GameMode}
            sortie={
              damage > 0
                ? {
                    bases: plan.basesDestroyed,
                    baseHp: effectiveBaseHp(baseHp, "rb", baseCount),
                    payload: presetRewardMul(damage, earner, rewardConstants.bombing),
                  }
                : null
            }
          />
        ) : null}
      </div>
    </MotionProvider>
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

/** The phone's menu sheet, faded away while one of its choices is dragged out. */
function MenuSheet(props: Omit<React.ComponentProps<typeof PylonSheet>, "hidden">) {
  return <PylonSheet {...props} hidden={useDragging()?.from === "menu"} />;
}

/** The creator's instructions, above its card until closed. */
function HowTo({ steps, onHide }: { steps: string[]; onHide: () => void }) {
  const { m } = useI18n();
  return (
    <aside aria-label={m.creator.howTo} className="card relative px-4 py-3 pr-10 text-sm">
      <p className="flex items-center gap-2 font-medium text-ink">
        <Info size={16} className="text-accent" aria-hidden />
        {m.creator.howTo}
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-dim marker:text-ink-faint">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onHide}
        aria-label={m.creator.hideHowTo}
        title={m.creator.hideHowTo}
        className="absolute right-2 top-2 rounded-md p-1.5 text-ink-faint transition-colors hover:text-ink"
      >
        <X size={16} aria-hidden />
      </button>
    </aside>
  );
}

function OptionRow({
  buttonRef,
  draggable = false,
  label,
  detail,
  glyph,
  selected,
  blocked,
  onSelect,
}: {
  buttonRef?: (element: Element | null) => void;
  /** Shows the grip that says the row can be dragged onto a pylon. */
  draggable?: boolean;
  label: string;
  detail: string;
  glyph?: React.ReactNode;
  selected: boolean;
  blocked?: string | null;
  onSelect: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onSelect}
      disabled={Boolean(blocked)}
      aria-pressed={selected}
      className={cn(
        "group w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        blocked
          ? "cursor-not-allowed opacity-45"
          : selected
            ? "bg-accent-dim text-accent"
            : "hover:bg-surface-2",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <span className="w-5 shrink-0 flex justify-center">{glyph}</span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate", selected ? "text-accent" : "text-ink")}>{label}</span>
        <span className="nums block truncate text-xs text-ink-faint">{blocked ?? detail}</span>
      </span>
      {draggable ? (
        <GripVertical
          size={16}
          aria-hidden
          className="shrink-0 text-ink-faint opacity-50 transition-opacity group-hover:opacity-100"
        />
      ) : null}
    </button>
  );
}

function describeBlocker(blocker: Blocker, armament: Armament, unit: MassUnit, w: Words): string {
  if (blocker.reason === "weight") {
    return w.fill(w.m.creator.overLimit, { mass: formatMass(blocker.overBy, unit, w) });
  }
  return w.fill(w.m.creator.clashesWith, {
    n: blocker.withSlot,
    what: labelFor(armament, blocker.withSlot, blocker.withOption, w),
  });
}

function describeViolation(violation: Violation, armament: Armament, unit: MassUnit, w: Words): string {
  if (violation.kind === "overweight") {
    return w.fill(w.m.creator.overweight, {
      carried: formatMass(violation.kg, unit, w),
      over: formatMass(violation.kg - violation.limitKg, unit, w),
      limit: formatMass(violation.limitKg, unit, w),
    });
  }
  const choice = (slot: number, option: string) =>
    w.fill(w.m.creator.pylonsChoice, { n: slot, what: labelFor(armament, slot, option, w) });
  const a = choice(violation.a.slot, violation.a.option);
  return w.fill(w.m.creator.cantCarryWith, {
    a: `${a[0].toUpperCase()}${a.slice(1)}`,
    b: choice(violation.b.slot, violation.b.option),
  });
}
