"use client";

import Fuse from "fuse.js";
import { ArrowDown, ArrowUp } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState, ViewTransition } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { BombRow } from "@/components/bomb-glyph";
import { Count } from "@/components/filter-count";
import { Filled } from "@/components/filled";
import { Flag } from "@/components/flag";
import { RangeSlider } from "@/components/range-slider";
import { ShareButton } from "@/components/share-button";
import { VehicleTypeIcon } from "@/components/vehicle-type-icon";
import { NATIONS, VEHICLE_TYPES, type VehicleType } from "@/domain/constants";
import { BATTLE_MODES, type BattleMode } from "@/domain/types";
import { useI18n } from "@/i18n/client";
import { track } from "@/lib/analytics";
import { iconUrl, TALISMAN_ICON_URL } from "@/lib/assets";
import type { AircraftSummary, BombGlyphData } from "@/lib/dataset";
import { RANK_LABELS } from "@/lib/labels";
import { REWARD_TINT, rewardKindOf } from "@/lib/reward-kind";
import { urlInteger, urlLiteral, urlStringSet, urlText, useUrlState } from "@/lib/use-url-state";
import { cn } from "@/lib/utils";

/** Reward class a tile is picked out for — the same two the game colours. */
const REWARD_KINDS = ["premium", "squadron"] as const;

/**
 * Ordering results moves premium or squadron aircraft to the front of their
 * battle rating — nothing drops out of the list, so "sort by class" is a way
 * to actually see the premium/squadron and the ordinary tech-tree vehicles
 * side by side rather than a filter that hides two of the three. The two
 * reward sorts put the best earners first, by the game's own multipliers.
 */
const SORTS = ["br", "name", "premium-first", "squadron-first", "sl-first", "rp-first"] as const;

/**
 * Which air mode's SL multiplier a battle mode sorts by. The game prices an
 * aircraft's Silver Lions per air mode only — wpcost.blkx has no ground-battle
 * figure for it — so a ground mode reads the air one of the same difficulty.
 */
const SL_MODE: Record<BattleMode, 0 | 1 | 2> = {
  "air-ab": 0,
  "air-rb": 1,
  "air-sb": 2,
  "ground-ab": 0,
  "ground-rb": 1,
  "ground-sb": 2,
};

/** Direction only means anything for the two sorts with an inherent order. */
const DIRECTIONAL_SORTS = new Set<(typeof SORTS)[number]>(["br", "name"]);
const SORT_DIRS = ["asc", "desc"] as const;

/**
 * A first few screenfuls, not a cap — the page loads more in batches instead
 * of hiding the rest. Kept small because every sort or filter builds most of
 * a batch afresh; 48 fills whole rows at two, three and four columns.
 */
const PAGE_SIZE = 48;

const VIEWS = ["tiles", "list"] as const;


export function AircraftSearch({
  index,
  brSteps,
  rankSteps,
  bombs,
}: {
  index: AircraftSummary[];
  /** Every battle rating present in each mode, ascending — the slider snaps to these. */
  brSteps: Record<BattleMode, number[]>;
  /** Every rank present, ascending — the slider snaps to these. */
  rankSteps: number[];
  bombs: BombGlyphData[];
}) {
  const { m, fill } = useI18n();
  const [query, setQuery] = useUrlState("q", urlText());
  const [nation, setNation] = useUrlState(
    "nation",
    urlLiteral(["all", ...NATIONS] as const, "all"),
  );
  // Type and class are independent toggles, not a single choice — picking
  // Fighter and Bomber together shows both, same as picking Premium and
  // Squadron together. An empty set means no filter on that axis at all.
  const [types, setTypes] = useUrlState("type", urlStringSet(VEHICLE_TYPES));
  const [rewards, setRewards] = useUrlState("reward", urlStringSet(REWARD_KINDS));
  const [sort, setSort] = useUrlState("sort", urlLiteral(SORTS, "br"));
  const [sortDir, setSortDir] = useUrlState("dir", urlLiteral(SORT_DIRS, "asc"));
  const [view, setView] = useUrlState("view", urlLiteral(VIEWS, "tiles"));
  const [mode, setMode] = useUrlState("mode", urlLiteral(BATTLE_MODES, "air-rb"));
  const steps = brSteps[mode];
  const [brFrom, setBrFrom] = useUrlState("brFrom", urlInteger(0));
  const [brTo, setBrTo] = useUrlState("brTo", urlInteger(steps.length - 1));
  const [rankFrom, setRankFrom] = useUrlState("rankFrom", urlInteger(0));
  const [rankTo, setRankTo] = useUrlState("rankTo", urlInteger(rankSteps.length - 1));

  const deferred = useDeferredValue(query);
  const bombsById = useMemo(() => new Map(bombs.map((b) => [b.id, b])), [bombs]);

  // Debounced so a full search term is what lands in GA4, not one event per
  // keystroke.
  useEffect(() => {
    const term = deferred.trim();
    if (!term) return;
    const id = setTimeout(() => track("search", { search_term: term, surface: "aircraft" }), 700);
    return () => clearTimeout(id);
  }, [deferred]);

  const from = Math.min(Math.max(brFrom, 0), steps.length - 1);
  const to = Math.min(Math.max(brTo, from), steps.length - 1);
  const rankLo = Math.min(Math.max(rankFrom, 0), rankSteps.length - 1);
  const rankHi = Math.min(Math.max(rankTo, rankLo), rankSteps.length - 1);

  const fuse = useMemo(
    () => new Fuse(index, { keys: ["name"], threshold: 0.35, ignoreLocation: true }),
    [index],
  );

  // The index comes ordered by Air RB; any other mode needs its own order, and
  // drops the aircraft that can't be flown in it.
  const byMode = useMemo(
    () =>
      mode === "air-rb"
        ? index
        : index
            .filter((a) => a.brs[mode] !== null)
            .sort((x, y) => x.brs[mode]! - y.brs[mode]! || x.name.localeCompare(y.name)),
    [index, mode],
  );
  const inBrRange = useCallback(
    (a: AircraftSummary) => {
      const br = a.brs[mode];
      return br !== null && br >= steps[from] && br <= steps[to];
    },
    [mode, steps, from, to],
  );

  // Slider positions index into the mode's own steps, so a new mode starts at its full range.
  const selectMode = (m: BattleMode) => {
    setBrFrom(0);
    setBrTo(steps.length - 1);
    setMode(m);
    track("filter_applied", { surface: "aircraft", filter: "mode", value: m });
  };

  const selectNation = (n: "all" | (typeof NATIONS)[number]) => {
    setNation(n);
    track("filter_applied", { surface: "aircraft", filter: "nation", value: n });
  };

  const toggleType = (t: VehicleType) => {
    const next = new Set(types);
    const turningOn = !next.has(t);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    setTypes(next);
    track("filter_applied", { surface: "aircraft", filter: "type", value: t, state: turningOn ? "on" : "off" });
  };

  const toggleReward = (r: (typeof REWARD_KINDS)[number]) => {
    const next = new Set(rewards);
    const turningOn = !next.has(r);
    if (next.has(r)) next.delete(r);
    else next.add(r);
    setRewards(next);
    track("filter_applied", {
      surface: "aircraft",
      filter: "reward",
      value: r,
      state: turningOn ? "on" : "off",
    });
  };

  const results = useMemo(() => {
    const matched = deferred.trim() ? fuse.search(deferred.trim()).map((r) => r.item) : byMode;
    let filtered = matched.filter(
      (a) =>
        (nation === "all" || a.nation === nation) &&
        (types.size === 0 || (a.vehicleType !== null && types.has(a.vehicleType))) &&
        (rewards.size === 0 ||
          (rewards.has("premium") && a.premium) ||
          (rewards.has("squadron") && a.squadron)) &&
        inBrRange(a) &&
        a.rank >= rankSteps[rankLo] &&
        a.rank <= rankSteps[rankHi],
    );
    if (sort === "name") {
      filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "premium-first" || sort === "squadron-first") {
      // A stable sort, so ties keep the underlying battle-rating order.
      const key = sort === "premium-first" ? "premium" : "squadron";
      filtered = [...filtered].sort((x, y) => Number(y[key]) - Number(x[key]));
    } else if (sort === "sl-first" || sort === "rp-first") {
      const earns = (a: AircraftSummary) =>
        a.reward === null ? -1 : sort === "sl-first" ? a.reward.sl[SL_MODE[mode]] : a.reward.rp;
      filtered = [...filtered].sort((x, y) => earns(y) - earns(x));
    }
    if (sortDir === "desc" && DIRECTIONAL_SORTS.has(sort)) filtered = [...filtered].reverse();
    return filtered;
  }, [
    deferred,
    fuse,
    byMode,
    nation,
    types,
    rewards,
    sort,
    sortDir,
    mode,
    inBrRange,
    rankSteps,
    rankLo,
    rankHi,
  ]);

  // Facet counts: how many results each option would leave, holding every
  // *other* axis fixed — so picking Fighter after Britain shows British
  // fighters, not fighters overall. Cheap even unmemoized at this size (≤648
  // rows), but memoized anyway since three chip rows read from it per render.
  const withoutNation = useMemo(
    () =>
      (deferred.trim() ? fuse.search(deferred.trim()).map((r) => r.item) : byMode).filter(
        (a) =>
          (types.size === 0 || (a.vehicleType !== null && types.has(a.vehicleType))) &&
          (rewards.size === 0 ||
            (rewards.has("premium") && a.premium) ||
            (rewards.has("squadron") && a.squadron)) &&
          inBrRange(a) &&
          a.rank >= rankSteps[rankLo] &&
          a.rank <= rankSteps[rankHi],
      ),
    [deferred, fuse, byMode, types, rewards, inBrRange, rankSteps, rankLo, rankHi],
  );
  const withoutType = useMemo(
    () =>
      (deferred.trim() ? fuse.search(deferred.trim()).map((r) => r.item) : byMode).filter(
        (a) =>
          (nation === "all" || a.nation === nation) &&
          (rewards.size === 0 ||
            (rewards.has("premium") && a.premium) ||
            (rewards.has("squadron") && a.squadron)) &&
          inBrRange(a) &&
          a.rank >= rankSteps[rankLo] &&
          a.rank <= rankSteps[rankHi],
      ),
    [deferred, fuse, byMode, nation, rewards, inBrRange, rankSteps, rankLo, rankHi],
  );
  const withoutReward = useMemo(
    () =>
      (deferred.trim() ? fuse.search(deferred.trim()).map((r) => r.item) : byMode).filter(
        (a) =>
          (nation === "all" || a.nation === nation) &&
          (types.size === 0 || (a.vehicleType !== null && types.has(a.vehicleType))) &&
          inBrRange(a) &&
          a.rank >= rankSteps[rankLo] &&
          a.rank <= rankSteps[rankHi],
      ),
    [deferred, fuse, byMode, nation, types, inBrRange, rankSteps, rankLo, rankHi],
  );
  const nationCount = (n: (typeof NATIONS)[number] | "all") =>
    n === "all" ? withoutNation.length : withoutNation.filter((a) => a.nation === n).length;
  const typeCount = (t: VehicleType) => withoutType.filter((a) => a.vehicleType === t).length;
  const rewardCount = (r: (typeof REWARD_KINDS)[number]) =>
    withoutReward.filter((a) => (r === "premium" ? a.premium : a.squadron)).length;

  const filtersActive =
    query.trim() !== "" ||
    nation !== "all" ||
    types.size > 0 ||
    rewards.size > 0 ||
    mode !== "air-rb" ||
    from !== 0 ||
    to !== steps.length - 1 ||
    rankLo !== 0 ||
    rankHi !== rankSteps.length - 1;

  const clearFilters = () => {
    setQuery("");
    setNation("all");
    setTypes(new Set());
    setRewards(new Set());
    setBrFrom(0);
    setBrTo(steps.length - 1);
    setMode("air-rb");
    setRankFrom(0);
    setRankTo(rankSteps.length - 1);
  };

  // Reset the reveal count when the filters change, without an effect —
  // adjusting state during render is the pattern React itself recommends for
  // "this derived value resets when its inputs change".
  const filterKey = `${deferred} ${nation} ${[...types].sort().join(",")} ${[...rewards].sort().join(",")} ${sort} ${sortDir} ${mode} ${from} ${to} ${rankLo} ${rankHi}`;
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [seenFilterKey, setSeenFilterKey] = useState(filterKey);
  if (filterKey !== seenFilterKey) {
    setSeenFilterKey(filterKey);
    setVisible(PAGE_SIZE);
  }

  // A sort or filter brings in a different page of aircraft, most of them
  // tiles React has to build from scratch. Deferred, that happens in a render
  // the next tap can interrupt, and the control itself answers at once. The
  // mode and the reveal count wait with it, so the old list never shows the
  // new mode's BRs or shrinks before the new one arrives.
  const current = useMemo(() => ({ results, mode, visible }), [results, mode, visible]);
  const listed = useDeferredValue(current);
  const shown = listed.results.slice(0, listed.visible);

  return (
    <div className="space-y-5">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={fill(m.search.placeholder, { count: index.length })}
        aria-label={m.search.label}
        autoComplete="off"
        className="w-full card px-4 py-3.5 text-base outline-none placeholder:text-ink-faint focus:border-accent transition-colors"
      />

      <div className="card p-4 space-y-4">
        <FilterRow label={m.common.nation}>
          <Chip active={nation === "all"} onClick={() => selectNation("all")}>
            <span aria-hidden>🌐</span> {m.common.allNations}
            <Count>{nationCount("all")}</Count>
          </Chip>
          {NATIONS.map((n) => (
            <Chip key={n} active={nation === n} onClick={() => selectNation(n)}>
              <Flag nation={n} /> {m.nations[n]}
              <Count>{nationCount(n)}</Count>
            </Chip>
          ))}
        </FilterRow>

        <FilterRow label={m.common.type}>
          {VEHICLE_TYPES.map((t) => (
            <Chip key={t} active={types.has(t)} onClick={() => toggleType(t)}>
              <VehicleTypeIcon type={t} size={18} />
              {m.vehicleTypes[t]}
              <Count>{typeCount(t)}</Count>
            </Chip>
          ))}
        </FilterRow>

        <FilterRow label={m.search.class}>
          {REWARD_KINDS.map((r) => (
            <Chip key={r} active={rewards.has(r)} onClick={() => toggleReward(r)}>
              <span
                aria-hidden
                className={cn("size-2 rounded-full", r === "premium" ? "bg-premium" : "bg-squadron")}
              />
              {m.search[r]}
              <Count>{rewardCount(r)}</Count>
            </Chip>
          ))}
        </FilterRow>

        <div className="grid gap-4 sm:grid-cols-2">
          <RangeSlider
            label={m.search.battleRating}
            steps={steps}
            from={from}
            to={to}
            format={(v) => v.toFixed(1)}
            onChange={(f, t) => {
              setBrFrom(f);
              setBrTo(t);
            }}
          />
          <RangeSlider
            label={m.search.rank}
            steps={rankSteps}
            from={rankLo}
            to={rankHi}
            format={(v) => RANK_LABELS[v]}
            onChange={(f, t) => {
              setRankFrom(f);
              setRankTo(t);
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-line">
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-ink-faint">
            <span className="text-xs uppercase tracking-wider">{m.search.mode}</span>
            <select
              value={mode}
              onChange={(e) => {
                const next = e.target.value as BattleMode;
                selectMode(next);
              }}
              aria-label={m.search.modeLabel}
              className="bg-transparent text-ink border border-line rounded-md pl-2 pr-1 py-1 text-sm focus:border-accent outline-none"
            >
              {BATTLE_MODES.map((mode_) => (
                <option key={mode_} value={mode_} className="bg-surface text-ink">
                  {m.search.modes[mode_]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-sm text-ink-faint">
            <span className="text-xs uppercase tracking-wider">{m.search.sort}</span>
            <select
              value={sort}
              onChange={(e) => {
                const next = e.target.value as (typeof SORTS)[number];
                setSort(next);
                track("filter_applied", { surface: "aircraft", filter: "sort", value: next });
              }}
              className="bg-transparent text-ink border border-line rounded-md pl-2 pr-1 py-1 text-sm focus:border-accent outline-none"
            >
              {SORTS.map((s) => (
                <option key={s} value={s} className="bg-surface text-ink">
                  {m.search.sorts[s]}
                </option>
              ))}
            </select>
            {DIRECTIONAL_SORTS.has(sort) ? (
              <button
                type="button"
                onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
                aria-label={sortDir === "asc" ? m.search.sortAscending : m.search.sortDescending}
                className="p-1.5 rounded-md border border-line text-ink-dim hover:text-ink hover:border-line-bright transition motion-safe:active:scale-[0.97]"
              >
                {sortDir === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
              </button>
            ) : null}
          </div>

          <ShareButton surface="aircraft_search" />

          <div className="flex gap-1 ml-auto">
            {VIEWS.map((v) => (
              <Chip
                key={v}
                active={view === v}
                onClick={() => {
                  setView(v);
                  track("filter_applied", { surface: "aircraft", filter: "view", value: v });
                }}
              >
                {v === "tiles" ? m.search.tiles : m.search.list}
              </Chip>
            ))}
          </div>

          {filtersActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-ink-faint hover:text-accent transition-colors underline underline-offset-4"
            >
              {m.common.clearFilters}
            </button>
          ) : null}
        </div>
      </div>

      {listed.results.length === 0 ? (
        <p className="text-ink-dim py-12 text-center">
          {m.search.empty}
        </p>
      ) : view === "tiles" ? (
        <ul className="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(270px,1fr))]">
          {shown.map((plane, i) => (
            <li key={plane.id} className="tile-in" style={{ "--i": i % PAGE_SIZE } as React.CSSProperties}>
              <Tile
                plane={plane}
                br={plane.brs[listed.mode]}
                bomb={plane.preview ? bombsById.get(plane.preview.bombId) : undefined}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {shown.map((plane, i) => (
            <li key={plane.id} className="tile-in cv-row" style={{ "--i": i % PAGE_SIZE } as React.CSSProperties}>
              <Row plane={plane} br={plane.brs[listed.mode]} />
            </li>
          ))}
        </ul>
      )}

      {listed.results.length > shown.length ? (
        <div className="flex items-center gap-3 text-sm text-ink-faint">
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="card px-3 py-1.5 text-ink-dim hover:text-ink hover:border-line-bright transition motion-safe:active:scale-[0.97]"
          >
            {m.search.showMore}
          </button>
          <span className="nums">
            <Filled
              template={m.search.shownOf}
              slots={{ shown: <AnimatedNumber value={shown.length} />, total: <AnimatedNumber value={listed.results.length} /> }}
            />
          </span>
        </div>
      ) : (
        <p className="nums text-sm text-ink-faint">
          <Filled template={m.search.count} slots={{ count: <AnimatedNumber value={listed.results.length} /> }} />
        </p>
      )}
    </div>
  );
}

/** A labelled strip of chips — nation, type, class each get one of these. */
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs uppercase tracking-wider text-ink-faint">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/**
 * The inline mark used where there's no tile to badge — the compact list
 * rows. Premium only: a squad leader badge tried here read as clutter rather
 * than a marker, so squadron gets the tile's green tint and nothing else.
 */
function RewardMark() {
  const { m } = useI18n();
  return <Image src={TALISMAN_ICON_URL} alt={m.common.premiumVehicle} width={14} height={14} className="shrink-0" />;
}

/**
 * The talisman the tech tree itself pins to the top-centre of a premium
 * vehicle's tile, half overlapping the tile's own top edge — not a mark
 * sitting inline with the name.
 */
function RewardBadge() {
  const { m } = useI18n();
  return (
    <Image
      src={TALISMAN_ICON_URL}
      alt={m.common.premiumVehicle}
      width={22}
      height={22}
      className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 drop-shadow-md"
    />
  );
}

/**
 * One aircraft in the list view. Memoised, like `Tile`: a sort or filter only
 * reorders the same aircraft objects, so React moves rows rather than
 * re-rendering every one of them.
 */
const Row = memo(function Row({ plane, br }: { plane: AircraftSummary; br: number | null }) {
  const { m, fill, path, count } = useI18n();
  const reward = rewardKindOf(plane);
  return (
    <Link
      href={path(`/aircraft/${plane.id}/`)}
      transitionTypes={["nav-forward"]}
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 border-l-2 hover:bg-surface-2 transition-colors",
        reward === "premium" ? "border-l-premium" : reward === "squadron" ? "border-l-squadron" : "border-l-transparent",
      )}
    >
      {reward === "premium" ? <RewardMark /> : null}
      {plane.vehicleType ? <VehicleTypeIcon type={plane.vehicleType} size={16} className="hidden sm:block" /> : null}
      <span className="font-medium truncate">{plane.name}</span>
      <span className="nums text-sm text-accent shrink-0">{br?.toFixed(1)}</span>
      <span className="ml-auto flex items-center gap-3 shrink-0 text-sm text-ink-faint">
        <span className="hidden sm:inline">
          <Flag nation={plane.nation} /> {m.nations[plane.nation]}
        </span>
        <span className="hidden sm:inline">{fill(m.common.rank, { rank: RANK_LABELS[plane.rank] })}</span>
        <span className="nums text-ink-dim">{count(m.search.basesShort, plane.maxBases)}</span>
      </span>
    </Link>
  );
});

const Tile = memo(function Tile({ plane, br, bomb }: { plane: AircraftSummary; br: number | null; bomb?: BombGlyphData }) {
  const { m, fill, path, count } = useI18n();
  const reward = rewardKindOf(plane);
  return (
    <Link
      href={path(`/aircraft/${plane.id}/`)}
      transitionTypes={["nav-forward"]}
      className={cn(
        "relative card p-2.5 flex gap-3 hover:border-line-bright hover:bg-surface-2 transition-[color,background-color,border-color,translate,box-shadow]",
        "motion-safe:hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-14px] hover:shadow-accent/50",
        reward && REWARD_TINT[reward],
      )}
    >
      {/* The badge sits on the card itself, not the thumbnail, so it can overlap
          the tile's own top edge the way the tech tree's does. */}
      {reward === "premium" ? <RewardBadge /> : null}

      {/* Tech-tree style icon in a fixed box, so row height never depends on image shape.
          Paired with the aircraft page's render, so one grows into the other. */}
      <ViewTransition name={`aircraft-${plane.id}`} share="morph" default="none">
        <div className="relative w-20 h-14 shrink-0 rounded-md bg-surface-2 overflow-hidden">
          {plane.imageId ? (
            <Image
              src={iconUrl(plane.imageId)}
              alt=""
              fill
              sizes="120px"
              loading="lazy"
              className="object-contain"
            />
          ) : null}
        </div>
      </ViewTransition>

      <div className="min-w-0 flex-1 flex flex-col justify-between gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-ink-faint">
              <Flag nation={plane.nation} size={11} />
              <span className="truncate">
                {m.nations[plane.nation]} · {fill(m.common.rank, { rank: RANK_LABELS[plane.rank] })}
              </span>
            </p>
            <h3 className="font-medium text-sm truncate">{plane.name}</h3>
          </div>
          <span className="flex items-center gap-1.5 shrink-0">
            {plane.vehicleType ? <VehicleTypeIcon type={plane.vehicleType} size={16} /> : null}
            <span className="nums text-accent">{br?.toFixed(1)}</span>
          </span>
        </div>

        {/* What it mostly drops — the shape of the payload at a glance. Height is
            fixed and overflow hidden so a wide icon row can never stretch the card. */}
        <div className="h-5 overflow-hidden">
          {bomb && plane.preview ? (
            <BombRow bomb={bomb} count={plane.preview.count} size={16} max={6} />
          ) : null}
        </div>

        <p className="text-xs text-ink-dim nums truncate">
          {plane.preview && bomb ? (
            <>
              {plane.preview.count} × {bomb.chartName || bomb.fullName}
              <span className="text-ink-faint"> · </span>
            </>
          ) : null}
          {count(m.common.bases, plane.maxBases)}
        </p>
      </div>
    </Link>
  );
});

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "px-3 py-1.5 rounded-full text-sm border transition motion-safe:active:scale-[0.97] flex items-center gap-1.5",
        active
          ? "border-accent text-accent bg-accent-dim"
          : "border-line text-ink-dim hover:text-ink hover:border-line-bright",
      )}
    >
      {children}
    </button>
  );
}
