"use client";

import Fuse from "fuse.js";
import { ArrowDown, ArrowUp } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { BombRow } from "@/components/bomb-glyph";
import { Count } from "@/components/filter-count";
import { Flag } from "@/components/flag";
import { RangeSlider } from "@/components/range-slider";
import { ShareButton } from "@/components/share-button";
import { VehicleTypeIcon } from "@/components/vehicle-type-icon";
import {
  NATION_LABELS,
  NATIONS,
  VEHICLE_TYPE_LABELS,
  VEHICLE_TYPES,
  type VehicleType,
} from "@/domain/constants";
import { track } from "@/lib/analytics";
import { iconUrl, TALISMAN_ICON_URL } from "@/lib/assets";
import type { AircraftSummary, BombGlyphData } from "@/lib/dataset";
import { RANK_LABELS } from "@/lib/labels";
import { REWARD_TINT, rewardKindOf } from "@/lib/reward-kind";
import { urlInteger, urlLiteral, urlStringSet, urlText, useUrlState } from "@/lib/use-url-state";
import { cn } from "@/lib/utils";

/** Reward class a tile is picked out for — the same two the game colours. */
const REWARD_KINDS = ["premium", "squadron"] as const;
const REWARD_LABELS: Record<(typeof REWARD_KINDS)[number], string> = {
  premium: "Premium",
  squadron: "Squadron",
};

/**
 * Ordering results moves premium or squadron aircraft to the front of their
 * battle rating — nothing drops out of the list, so "sort by class" is a way
 * to actually see the premium/squadron and the ordinary tech-tree vehicles
 * side by side rather than a filter that hides two of the three.
 */
const SORTS = ["br", "name", "premium-first", "squadron-first"] as const;
const SORT_LABELS: Record<(typeof SORTS)[number], string> = {
  br: "Battle rating",
  name: "Name",
  "premium-first": "Premium first",
  "squadron-first": "Squadron first",
};

/** Direction only means anything for the two sorts with an inherent order. */
const DIRECTIONAL_SORTS = new Set<(typeof SORTS)[number]>(["br", "name"]);
const SORT_DIRS = ["asc", "desc"] as const;

/**
 * A first screenful, not a cap — filtering by nation alone can run past 100
 * (USA is 113), so the page loads more in batches instead of hiding the rest.
 */
const PAGE_SIZE = 90;

const VIEWS = ["tiles", "list"] as const;

export function AircraftSearch({
  index,
  brSteps,
  rankSteps,
  bombs,
}: {
  index: AircraftSummary[];
  /** Every battle rating present, ascending — the slider snaps to these. */
  brSteps: number[];
  /** Every rank present, ascending — the slider snaps to these. */
  rankSteps: number[];
  bombs: BombGlyphData[];
}) {
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
  const [brFrom, setBrFrom] = useUrlState("brFrom", urlInteger(0));
  const [brTo, setBrTo] = useUrlState("brTo", urlInteger(brSteps.length - 1));
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

  const from = Math.min(Math.max(brFrom, 0), brSteps.length - 1);
  const to = Math.min(Math.max(brTo, from), brSteps.length - 1);
  const rankLo = Math.min(Math.max(rankFrom, 0), rankSteps.length - 1);
  const rankHi = Math.min(Math.max(rankTo, rankLo), rankSteps.length - 1);

  const fuse = useMemo(
    () => new Fuse(index, { keys: ["name"], threshold: 0.35, ignoreLocation: true }),
    [index],
  );

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
    const matched = deferred.trim() ? fuse.search(deferred.trim()).map((r) => r.item) : index;
    let filtered = matched.filter(
      (a) =>
        (nation === "all" || a.nation === nation) &&
        (types.size === 0 || (a.vehicleType !== null && types.has(a.vehicleType))) &&
        (rewards.size === 0 ||
          (rewards.has("premium") && a.premium) ||
          (rewards.has("squadron") && a.squadron)) &&
        a.br >= brSteps[from] &&
        a.br <= brSteps[to] &&
        a.rank >= rankSteps[rankLo] &&
        a.rank <= rankSteps[rankHi],
    );
    if (sort === "name") {
      filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "premium-first" || sort === "squadron-first") {
      // A stable sort, so ties keep the underlying battle-rating order.
      const key = sort === "premium-first" ? "premium" : "squadron";
      filtered = [...filtered].sort((x, y) => Number(y[key]) - Number(x[key]));
    }
    if (sortDir === "desc" && DIRECTIONAL_SORTS.has(sort)) filtered = [...filtered].reverse();
    return filtered;
  }, [
    deferred,
    fuse,
    index,
    nation,
    types,
    rewards,
    sort,
    sortDir,
    brSteps,
    from,
    to,
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
      (deferred.trim() ? fuse.search(deferred.trim()).map((r) => r.item) : index).filter(
        (a) =>
          (types.size === 0 || (a.vehicleType !== null && types.has(a.vehicleType))) &&
          (rewards.size === 0 ||
            (rewards.has("premium") && a.premium) ||
            (rewards.has("squadron") && a.squadron)) &&
          a.br >= brSteps[from] &&
          a.br <= brSteps[to] &&
          a.rank >= rankSteps[rankLo] &&
          a.rank <= rankSteps[rankHi],
      ),
    [deferred, fuse, index, types, rewards, brSteps, from, to, rankSteps, rankLo, rankHi],
  );
  const withoutType = useMemo(
    () =>
      (deferred.trim() ? fuse.search(deferred.trim()).map((r) => r.item) : index).filter(
        (a) =>
          (nation === "all" || a.nation === nation) &&
          (rewards.size === 0 ||
            (rewards.has("premium") && a.premium) ||
            (rewards.has("squadron") && a.squadron)) &&
          a.br >= brSteps[from] &&
          a.br <= brSteps[to] &&
          a.rank >= rankSteps[rankLo] &&
          a.rank <= rankSteps[rankHi],
      ),
    [deferred, fuse, index, nation, rewards, brSteps, from, to, rankSteps, rankLo, rankHi],
  );
  const withoutReward = useMemo(
    () =>
      (deferred.trim() ? fuse.search(deferred.trim()).map((r) => r.item) : index).filter(
        (a) =>
          (nation === "all" || a.nation === nation) &&
          (types.size === 0 || (a.vehicleType !== null && types.has(a.vehicleType))) &&
          a.br >= brSteps[from] &&
          a.br <= brSteps[to] &&
          a.rank >= rankSteps[rankLo] &&
          a.rank <= rankSteps[rankHi],
      ),
    [deferred, fuse, index, nation, types, brSteps, from, to, rankSteps, rankLo, rankHi],
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
    from !== 0 ||
    to !== brSteps.length - 1 ||
    rankLo !== 0 ||
    rankHi !== rankSteps.length - 1;

  const clearFilters = () => {
    setQuery("");
    setNation("all");
    setTypes(new Set());
    setRewards(new Set());
    setBrFrom(0);
    setBrTo(brSteps.length - 1);
    setRankFrom(0);
    setRankTo(rankSteps.length - 1);
  };

  // Reset the reveal count when the filters change, without an effect —
  // adjusting state during render is the pattern React itself recommends for
  // "this derived value resets when its inputs change".
  const filterKey = `${deferred} ${nation} ${[...types].sort().join(",")} ${[...rewards].sort().join(",")} ${sort} ${sortDir} ${from} ${to} ${rankLo} ${rankHi}`;
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [seenFilterKey, setSeenFilterKey] = useState(filterKey);
  if (filterKey !== seenFilterKey) {
    setSeenFilterKey(filterKey);
    setVisible(PAGE_SIZE);
  }

  const shown = results.slice(0, visible);

  return (
    <div className="space-y-5">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${index.length} aircraft — try “Pe-8”, “Ju 88”, “A-10”`}
        aria-label="Search aircraft"
        autoComplete="off"
        className="w-full card px-4 py-3.5 text-base outline-none placeholder:text-ink-faint focus:border-accent transition-colors"
      />

      <div className="card p-4 space-y-4">
        <FilterRow label="Nation">
          <Chip active={nation === "all"} onClick={() => selectNation("all")}>
            <span aria-hidden>🌐</span> All nations
            <Count>{nationCount("all")}</Count>
          </Chip>
          {NATIONS.map((n) => (
            <Chip key={n} active={nation === n} onClick={() => selectNation(n)}>
              <Flag nation={n} /> {NATION_LABELS[n]}
              <Count>{nationCount(n)}</Count>
            </Chip>
          ))}
        </FilterRow>

        <FilterRow label="Type">
          {VEHICLE_TYPES.map((t) => (
            <Chip key={t} active={types.has(t)} onClick={() => toggleType(t)}>
              <VehicleTypeIcon type={t} size={18} />
              {VEHICLE_TYPE_LABELS[t]}
              <Count>{typeCount(t)}</Count>
            </Chip>
          ))}
        </FilterRow>

        <FilterRow label="Class">
          {REWARD_KINDS.map((r) => (
            <Chip key={r} active={rewards.has(r)} onClick={() => toggleReward(r)}>
              <span
                aria-hidden
                className={cn("size-2 rounded-full", r === "premium" ? "bg-premium" : "bg-squadron")}
              />
              {REWARD_LABELS[r]}
              <Count>{rewardCount(r)}</Count>
            </Chip>
          ))}
        </FilterRow>

        <div className="grid gap-4 sm:grid-cols-2">
          <RangeSlider
            label="Battle rating"
            steps={brSteps}
            from={from}
            to={to}
            format={(v) => v.toFixed(1)}
            onChange={(f, t) => {
              setBrFrom(f);
              setBrTo(t);
            }}
          />
          <RangeSlider
            label="Rank"
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
          <div className="flex items-center gap-1.5 text-sm text-ink-faint">
            <span className="text-xs uppercase tracking-wider">Sort</span>
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
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>
            {DIRECTIONAL_SORTS.has(sort) ? (
              <button
                type="button"
                onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
                aria-label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
                className="p-1.5 rounded-md border border-line text-ink-dim hover:text-ink hover:border-line-bright transition-colors"
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
                {v === "tiles" ? "Tiles" : "List"}
              </Chip>
            ))}
          </div>

          {filtersActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-ink-faint hover:text-accent transition-colors underline underline-offset-4"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {results.length === 0 ? (
        <p className="text-ink-dim py-12 text-center">
          Nothing matches these filters. Coverage includes bombers, attackers and any fighter that
          can carry bombs — pure interceptors aren&apos;t included.
        </p>
      ) : view === "tiles" ? (
        <ul className="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(270px,1fr))]">
          {shown.map((plane) => (
            <li key={plane.id}>
              <Tile
                plane={plane}
                bomb={plane.preview ? bombsById.get(plane.preview.bombId) : undefined}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {shown.map((plane) => {
            const reward = rewardKindOf(plane);
            return (
              <li key={plane.id}>
                <Link
                  href={`/aircraft/${plane.id}`}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 border-l-2 hover:bg-surface-2 transition-colors",
                    reward === "premium"
                      ? "border-l-premium"
                      : reward === "squadron"
                        ? "border-l-squadron"
                        : "border-l-transparent",
                  )}
                >
                  {reward === "premium" ? <RewardMark /> : null}
                  {plane.vehicleType ? (
                    <VehicleTypeIcon
                      type={plane.vehicleType}
                      size={16}
                      className="hidden sm:block"
                    />
                  ) : null}
                  <span className="font-medium truncate">{plane.name}</span>
                  <span className="nums text-sm text-accent shrink-0">{plane.br.toFixed(1)}</span>
                  <span className="ml-auto flex items-center gap-3 shrink-0 text-sm text-ink-faint">
                    <span className="hidden sm:inline">
                      <Flag nation={plane.nation} /> {NATION_LABELS[plane.nation]}
                    </span>
                    <span className="hidden sm:inline">Rank {RANK_LABELS[plane.rank]}</span>
                    <span className="nums text-ink-dim">{plane.maxBases} bases</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {results.length > shown.length ? (
        <div className="flex items-center gap-3 text-sm text-ink-faint">
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="card px-3 py-1.5 text-ink-dim hover:text-ink hover:border-line-bright transition-colors"
          >
            Show more
          </button>
          <span>
            {shown.length} of {results.length}
          </span>
        </div>
      ) : (
        <p className="text-sm text-ink-faint">{results.length} aircraft.</p>
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
  return <Image src={TALISMAN_ICON_URL} alt="Premium vehicle" width={14} height={14} className="shrink-0" />;
}

/**
 * The talisman the tech tree itself pins to the top-centre of a premium
 * vehicle's tile, half overlapping the tile's own top edge — not a mark
 * sitting inline with the name.
 */
function RewardBadge() {
  return (
    <Image
      src={TALISMAN_ICON_URL}
      alt="Premium vehicle"
      width={22}
      height={22}
      className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 drop-shadow-md"
    />
  );
}

function Tile({ plane, bomb }: { plane: AircraftSummary; bomb?: BombGlyphData }) {
  const reward = rewardKindOf(plane);
  return (
    <Link
      href={`/aircraft/${plane.id}`}
      className={cn(
        "relative card p-2.5 flex gap-3 hover:border-line-bright hover:bg-surface-2 transition-colors",
        reward && REWARD_TINT[reward],
      )}
    >
      {/* The badge sits on the card itself, not the thumbnail, so it can overlap
          the tile's own top edge the way the tech tree's does. */}
      {reward === "premium" ? <RewardBadge /> : null}

      {/* Tech-tree style icon in a fixed box, so row height never depends on image shape. */}
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

      <div className="min-w-0 flex-1 flex flex-col justify-between gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-ink-faint">
              <Flag nation={plane.nation} size={11} />
              <span className="truncate">
                {NATION_LABELS[plane.nation]} · Rank {RANK_LABELS[plane.rank]}
              </span>
            </p>
            <h3 className="font-medium text-sm truncate">{plane.name}</h3>
          </div>
          <span className="flex items-center gap-1.5 shrink-0">
            {plane.vehicleType ? <VehicleTypeIcon type={plane.vehicleType} size={16} /> : null}
            <span className="nums text-accent">{plane.br.toFixed(1)}</span>
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
          {plane.maxBases} base{plane.maxBases === 1 ? "" : "s"}
        </p>
      </div>
    </Link>
  );
}

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
        "px-3 py-1.5 rounded-full text-sm border transition-colors flex items-center gap-1.5",
        active
          ? "border-accent text-accent bg-accent-dim"
          : "border-line text-ink-dim hover:text-ink hover:border-line-bright",
      )}
    >
      {children}
    </button>
  );
}
