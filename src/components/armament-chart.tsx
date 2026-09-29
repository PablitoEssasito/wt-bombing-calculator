"use client";

import { Check, ChevronDown, ChevronUp, ChevronsUpDown, Columns3 } from "lucide-react";
import Link from "next/link";
import { memo, useCallback, useDeferredValue, useEffect, useMemo } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { BombIcon } from "@/components/bomb-glyph";
import { Count } from "@/components/filter-count";
import { Filled } from "@/components/filled";
import { bombsNeeded, effectiveBaseHp } from "@/domain/base-hp";
import { CHART_VIEWS, inView, kindsOf, type ChartRow, type ChartView } from "@/domain/bomb-chart";
import {
  BASE_HP_TIERS,
  GAME_MODES,
  NATIONS,
  type BaseCount,
  type BaseHp,
  type GameMode,
  type Nation,
} from "@/domain/constants";
import type { BombKind } from "@/domain/types";
import { Flag } from "@/components/flag";
import { Segmented } from "@/components/segmented";
import { ShareButton } from "@/components/share-button";
import { track } from "@/lib/analytics";
import { useI18n } from "@/i18n/client";
import {
  readUrlState,
  urlInteger,
  urlList,
  urlLiteral,
  urlOptionalInteger,
  urlStringSet,
  urlText,
  useUrlState,
  writeUrlState,
} from "@/lib/use-url-state";
import { cn } from "@/lib/utils";
import { MAX_COMPARED } from "@/lib/weapon-figures";

/**
 * Columns off the weapon's own file, shown on request — the table is wide
 * enough with the base figures alone, and most of these mean nothing for a
 * plain bomb.
 */
const EXTRA_COLUMNS = ["range", "speed", "guidanceTime", "warhead", "explosive", "charge"] as const;
type ExtraColumn = (typeof EXTRA_COLUMNS)[number];

const SORTS = ["name", "needed", "damage", "mass", "tnt", "efficiency", "kind", ...EXTRA_COLUMNS] as const;
type Sort = (typeof SORTS)[number];
type SortDir = "asc" | "desc";

/**
 * Which direction a column starts in on its first click.
 *
 * Text columns start A-Z; for numbers, whichever end is more interesting to see
 * first — cheapest bombs-per-base, heaviest hitters by damage/mass/TNT, longest
 * reach — rather than defaulting every column to the same direction.
 */
const DEFAULT_DIR: Record<Sort, SortDir> = {
  name: "asc",
  needed: "asc",
  damage: "desc",
  mass: "desc",
  tnt: "desc",
  efficiency: "desc",
  kind: "asc",
  range: "desc",
  speed: "desc",
  guidanceTime: "desc",
  warhead: "asc",
  explosive: "asc",
  charge: "desc",
};

/**
 * How the Mass column reads. "Original" is whatever the source itself printed —
 * nations mix lb and kg depending on which one they historically used — the
 * other two force everything to one unit so a whole column can be compared
 * directly, or converted at a glance without doing the maths by hand.
 */
const MASS_UNITS = ["original", "kg", "lb"] as const;
type MassUnit = (typeof MASS_UNITS)[number];

const LB_PER_KG = 1 / 0.45359237;

/** The speed of sound the game's Mach figures are read against, for sorting them beside m/s ones. */
const MACH_MS = 343;

function formatMass(bomb: ChartRow, unit: MassUnit): string {
  if (unit === "original") return bomb.massLabel || "—";
  if (bomb.massKg === null) return "—";
  return unit === "kg"
    ? `${Math.round(bomb.massKg)} kg`
    : `${Math.round(bomb.massKg * LB_PER_KG)} lb`;
}

/** Every kind a row can have, in the order the chips list them. */
const KINDS = [
  "GP",
  "AP",
  "DRAG",
  "INC",
  "MINE",
  "GNSS",
  "LAS",
  "TV",
  "IR",
  "RC",
  "ROCKET",
  "AGM",
  "AAM",
  "TORPEDO",
  "GUN",
] as const satisfies readonly BombKind[];

const SOURCES = ["all", "game"] as const;

/** The weapons ticked for the comparison, in the order they were ticked. */
const COMPARED = urlList();
// Made once, so the parsed sets keep their identity from render to render.
const KIND_FILTER = urlStringSet<BombKind>(KINDS);
const COLUMNS = urlStringSet<ExtraColumn>(EXTRA_COLUMNS);

export function ArmamentChart({ bombs, guidanceLabels }: { bombs: ChartRow[]; guidanceLabels: Record<string, string> }) {
  const { m, number, fill, path } = useI18n();
  const [view, setView] = useUrlState("view", urlLiteral(CHART_VIEWS, "bases"));
  const [query, setQuery] = useUrlState("q", urlText());
  const [hp, setHp] = useUrlState("hp", urlInteger(25900));
  const [mode, setMode] = useUrlState("mode", urlLiteral(GAME_MODES, "rb"));
  const [mapSize, setMapSize] = useUrlState("map", urlInteger(4));
  const [sort, setSort] = useUrlState("sort", urlLiteral(SORTS, "needed"));
  const [massUnit, setMassUnit] = useUrlState("massUnit", urlLiteral(MASS_UNITS, "original"));
  const [dir, setDir] = useUrlState("dir", urlLiteral<SortDir>(["asc", "desc"], DEFAULT_DIR.needed));
  const [nation, setNation] = useUrlState("nation", urlLiteral(["all", ...NATIONS] as const, "all"));
  const [kinds, setKinds] = useUrlState("kinds", KIND_FILTER);
  const [source, setSource] = useUrlState("src", urlLiteral(SOURCES, "all"));
  const [columns, setColumns] = useUrlState("cols", COLUMNS);
  const [compared, setCompared] = useUrlState("cmp", COMPARED);
  const [massMin, setMassMin] = useUrlState("massMin", urlOptionalInteger());
  const [massMax, setMassMax] = useUrlState("massMax", urlOptionalInteger());
  const [tntMin, setTntMin] = useUrlState("tntMin", urlOptionalInteger());
  const [tntMax, setTntMax] = useUrlState("tntMax", urlOptionalInteger());
  const [dmgMin, setDmgMin] = useUrlState("dmgMin", urlOptionalInteger());
  const [dmgMax, setDmgMax] = useUrlState("dmgMax", urlOptionalInteger());

  const deferred = useDeferredValue(query);

  // Debounced so a full search term is what lands in GA4, not one event per
  // keystroke.
  useEffect(() => {
    const term = deferred.trim();
    if (!term) return;
    const id = setTimeout(() => track("search", { search_term: term, surface: "bombs" }), 700);
    return () => clearTimeout(id);
  }, [deferred]);

  const baseHp = (BASE_HP_TIERS as readonly number[]).includes(hp) ? (hp as BaseHp) : 25900;
  const baseCount = (mapSize === 3 ? 3 : 4) as BaseCount;
  const effectiveHp = effectiveBaseHp(baseHp, mode as GameMode, baseCount);

  // Mass and TNT bounds read from every row in the view that states one;
  // damage only from what has a price — an air-to-air missile's blank damage
  // must not collapse this range to nothing, nor a megaton bomb stretch it.
  const bounds = useMemo(() => {
    const shown = bombs.filter((b) => inView(b, view));
    const priced = shown.filter((b) => b.damageValue !== null);
    const range = (values: number[]) =>
      values.length ? { min: Math.min(...values), max: Math.max(...values) } : { min: 0, max: 0 };
    return {
      mass: range(shown.flatMap((b) => (b.massKg !== null ? [Math.round(b.massKg)] : []))),
      tnt: range(shown.flatMap((b) => (b.tntKg !== null ? [Math.round(b.tntKg)] : []))),
      damage: range(priced.map((b) => b.damageValue!)),
    };
  }, [bombs, view]);

  // Only the kinds the view has at all get a chip: no "Air-to-air missile"
  // offered under what can hit a base.
  const viewKinds = useMemo(
    () => KINDS.filter((kind) => bombs.some((bomb) => inView(bomb, view) && kindsOf(bomb).includes(kind))),
    [bombs, view],
  );

  // The rows, and for the facet counts — how many rows each Nation/Type option
  // would leave — the rows with every *other* filter applied but that axis's
  // own, same idea as the aircraft page's chip counts.
  const { rows, withoutNation, withoutKind } = useMemo(() => {
    const needle = deferred.trim().toLowerCase();
    const passes = (bomb: ChartRow, except?: "nation" | "kind") => {
      if (!inView(bomb, view)) return false;
      if (source === "game" && bomb.damageSource === "estimate") return false;
      if (needle && !bomb.chartName.toLowerCase().includes(needle) && !bomb.fullName.toLowerCase().includes(needle)) {
        return false;
      }
      if (except !== "nation" && nation !== "all" && !bomb.usedByNations.includes(nation)) return false;
      if (except !== "kind" && kinds.size > 0 && !kindsOf(bomb).some((k) => kinds.has(k))) return false;
      if (massMin !== null && (bomb.massKg ?? -Infinity) < massMin) return false;
      if (massMax !== null && (bomb.massKg ?? Infinity) > massMax) return false;
      if (tntMin !== null && (bomb.tntKg ?? -Infinity) < tntMin) return false;
      if (tntMax !== null && (bomb.tntKg ?? Infinity) > tntMax) return false;
      // A damage-range filter can't be tested against a blank value — treat
      // "no data" as failing the filter rather than coercing null to 0.
      if ((dmgMin !== null || dmgMax !== null) && bomb.damageValue === null) return false;
      if (dmgMin !== null && bomb.damageValue !== null && bomb.damageValue < dmgMin) return false;
      if (dmgMax !== null && bomb.damageValue !== null && bomb.damageValue > dmgMax) return false;
      return true;
    };

    const sorted = bombs
      .filter((bomb) => passes(bomb))
      .map((bomb) => ({
        bomb,
        needed: bomb.damageValue ? bombsNeeded(effectiveHp, bomb.damageValue) : null,
      }))
      .sort((a, b) => compareRows(a, b, sort, dir, m.bombKinds));
    return {
      rows: sorted,
      withoutNation: bombs.filter((bomb) => passes(bomb, "nation")),
      withoutKind: bombs.filter((bomb) => passes(bomb, "kind")),
    };
  }, [
    bombs,
    view,
    source,
    deferred,
    effectiveHp,
    sort,
    dir,
    nation,
    kinds,
    massMin,
    massMax,
    tntMin,
    tntMax,
    dmgMin,
    dmgMax,
    m.bombKinds,
  ]);

  // The table redraws a few hundred rows on every filter, sort or unit change;
  // deferred, so the control itself answers the click first.
  const listed = useDeferredValue(rows);
  const shownUnit = useDeferredValue(massUnit);
  const shownColumns = useDeferredValue(columns);
  const wide = shownColumns.size > 0;
  // A header cell stays at the top of the table's own scroll window — see the table below.
  const headCell = wide ? "sm:sticky sm:top-0 sm:z-10 bg-surface sm:shadow-[inset_0_-1px_0_var(--color-line)]" : undefined;

  const nationCount = (n: Nation | "all") =>
    n === "all" ? withoutNation.length : withoutNation.filter((b) => b.usedByNations.includes(n)).length;
  const kindCount = (k: BombKind) => withoutKind.filter((b) => kindsOf(b).includes(k)).length;

  const selectView = (next: ChartView) => {
    setView(next);
    // A kind picked under one view may not exist under the next.
    setKinds(new Set());
    track("filter_applied", { surface: "bombs", filter: "view", value: next });
  };

  const selectNation = (n: Nation | "all") => {
    setNation(n);
    track("filter_applied", { surface: "bombs", filter: "nation", value: n });
  };

  const handleSort = (column: Sort) => {
    if (column === sort) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(column);
      setDir(DEFAULT_DIR[column]);
    }
    track("filter_applied", { surface: "bombs", filter: "sort", value: column });
  };

  const toggleKind = (kind: BombKind) => {
    const next = new Set(kinds);
    const turningOn = !next.has(kind);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    setKinds(next);
    track("filter_applied", { surface: "bombs", filter: "kind", value: kind, state: turningOn ? "on" : "off" });
  };

  const toggleColumn = (column: ExtraColumn) => {
    const next = new Set(columns);
    if (next.has(column)) next.delete(column);
    else next.add(column);
    setColumns(next);
    track("filter_applied", { surface: "bombs", filter: "column", value: column });
  };

  const rangesActive =
    massMin !== null || massMax !== null || tntMin !== null || tntMax !== null || dmgMin !== null || dmgMax !== null;
  const clearRanges = () => {
    setMassMin(null);
    setMassMax(null);
    setTntMin(null);
    setTntMax(null);
    setDmgMin(null);
    setDmgMax(null);
  };

  const filtersActive = query.trim() !== "" || nation !== "all" || kinds.size > 0 || source !== "all" || rangesActive;
  const clearFilters = () => {
    setQuery("");
    setNation("all");
    setKinds(new Set());
    setSource("all");
    clearRanges();
  };

  const extraHeaders: Record<ExtraColumn, string> = m.bombChart.extraColumns;

  // Stable, so ticking one row doesn't redraw the other six hundred.
  const comparedKey = compared.join(",");
  const comparedSet = useMemo(() => new Set(comparedKey ? comparedKey.split(",") : []), [comparedKey]);
  const toggleCompared = useCallback((id: string) => {
    const now = readUrlState("cmp", COMPARED);
    if (now.includes(id)) writeUrlState("cmp", COMPARED, now.filter((other) => other !== id));
    else if (now.length < MAX_COMPARED) writeUrlState("cmp", COMPARED, [...now, id]);
  }, []);
  const shownSources = new Set(listed.map(({ bomb }) => bomb.damageSource));

  return (
    <div className="space-y-6">
      <section className="card p-4 grid gap-5 sm:grid-cols-3">
        <Segmented
          label={m.conditions.matchBr}
          value={String(baseHp)}
          onChange={(v) => setHp(Number(v))}
          options={BASE_HP_TIERS.map((tier) => ({
            value: String(tier),
            label: m.conditions.brRanges[tier],
            hint: fill(m.conditions.hp, { hp: number(tier) }),
          }))}
        />
        <Segmented
          label={m.conditions.gameMode}
          value={mode}
          onChange={(v) => setMode(v as GameMode)}
          options={[
            { value: "rb", label: m.conditions.realistic },
            { value: "ab", label: m.conditions.arcade, hint: m.conditions.doubleHealth },
          ]}
        />
        <Segmented
          label={m.conditions.basesOnMap}
          value={String(baseCount)}
          onChange={(v) => setMapSize(Number(v))}
          options={[
            { value: "4", label: m.conditions.four },
            { value: "3", label: m.conditions.three },
          ]}
        />
      </section>

      <section className="card p-4 space-y-4">
        <Segmented
          label={m.bombChart.show}
          value={view}
          onChange={selectView}
          options={CHART_VIEWS.map((v) => ({ value: v, label: m.bombChart.views[v] }))}
        />

        <div className="space-y-1.5">
          <div className="text-xs uppercase tracking-wider text-ink-faint">{m.common.nation}</div>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={nation === "all"} onClick={() => selectNation("all")}>
              <span aria-hidden>🌐</span> {m.common.allNations}
              <Count>{nationCount("all")}</Count>
            </FilterChip>
            {NATIONS.map((n: Nation) => (
              <FilterChip key={n} active={nation === n} onClick={() => selectNation(n)}>
                <Flag nation={n} /> {m.nations[n]}
                <Count>{nationCount(n)}</Count>
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs uppercase tracking-wider text-ink-faint">{m.common.type}</div>
          <div className="flex flex-wrap gap-1.5">
            {viewKinds.map((kind) => (
              <CheckChip key={kind} checked={kinds.has(kind)} onClick={() => toggleKind(kind)}>
                {m.bombKinds[kind]}
                <Count>{kindCount(kind)}</Count>
              </CheckChip>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <RangeField
            label={m.bombChart.massKg}
            bounds={bounds.mass}
            min={massMin}
            max={massMax}
            onMinChange={setMassMin}
            onMaxChange={setMassMax}
          />
          <RangeField
            label={m.bombChart.tntKg}
            bounds={bounds.tnt}
            min={tntMin}
            max={tntMax}
            onMinChange={setTntMin}
            onMaxChange={setTntMax}
          />
          <RangeField
            label={m.bombChart.damage}
            bounds={bounds.damage}
            min={dmgMin}
            max={dmgMax}
            onMinChange={setDmgMin}
            onMaxChange={setDmgMax}
          />
        </div>

        <CheckChip
          checked={source === "game"}
          onClick={() => {
            setSource(source === "game" ? "all" : "game");
            track("filter_applied", { surface: "bombs", filter: "source", value: source === "game" ? "all" : "game" });
          }}
        >
          {m.bombChart.gameOnly}
        </CheckChip>
      </section>

      <div className="space-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={m.bombChart.filterPlaceholder}
          aria-label={m.bombChart.filterLabel}
          className="card px-3 py-2 outline-none placeholder:text-ink-faint focus:border-accent transition-colors w-full sm:w-72"
        />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-ink-faint">{m.bombChart.moreColumns}</span>
          <div role="group" aria-label={m.bombChart.moreColumns} className="flex flex-wrap gap-1">
            {EXTRA_COLUMNS.map((column) => (
              <CheckChip key={column} checked={columns.has(column)} onClick={() => toggleColumn(column)}>
                {extraHeaders[column]}
              </CheckChip>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-ink-faint">{m.bombChart.massShownIn}</span>
              <div role="group" aria-label={m.bombChart.massUnit} className="flex gap-1">
                {MASS_UNITS.map((u) => (
                  <FilterChip key={u} active={massUnit === u} onClick={() => setMassUnit(u)}>
                    {u === "original" ? m.bombChart.original : u}
                  </FilterChip>
                ))}
              </div>
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
            <ShareButton surface="bomb_chart" />
          </div>
          <p className="nums text-sm text-ink-dim">
            <Filled
              template={m.bombChart.summary}
              slots={{ count: <AnimatedNumber value={listed.length} />, hp: <AnimatedNumber value={effectiveHp} /> }}
            />
          </p>
        </div>
      </div>

      {listed.length === 0 ? (
        <p className="card p-6 text-ink-dim text-center">
          {m.bombChart.empty}
        </p>
      ) : (
        <div className={cn("space-y-2", wide && "mx-[min(0px,calc(50%_-_50vw_+_1.5rem))]")}>
          {/* With extra columns the table outgrows the page. It takes the window's
              width then, set tighter, labels and words wrapping, so every column
              fits on a wide enough screen. Where it still doesn't, it scrolls in a
              window of its own, so the sideways scrollbar is in sight rather than
              under the last of a few hundred rows, with the header and the
              weapon's name held in place. Not on a phone, where a swipe scrolls
              it sideways and a pinned name would leave no room. */}
          <div className={cn("card overflow-x-auto", wide && "sm:max-h-[calc(100dvh-5rem)] sm:overflow-y-auto")}>
            <table className="w-full text-sm">
              <thead className="text-ink-faint">
                <tr className="hairline">
                  <SortTh
                    column="name"
                    label={m.bombChart.columns.name}
                    className={cn(headCell, wide && "sm:left-0 sm:z-20")}
                    sort={sort}
                    dir={dir}
                    onSort={handleSort}
                    compact={wide}
                  />
                  <SortTh
                    column="needed"
                    label={m.bombChart.columns.needed}
                    align="right"
                    className={headCell}
                    sort={sort}
                    dir={dir}
                    onSort={handleSort}
                    compact={wide}
                  />
                  <SortTh
                    column="damage"
                    label={m.bombChart.columns.damage}
                    align="right"
                    className={headCell}
                    sort={sort}
                    dir={dir}
                    onSort={handleSort}
                    compact={wide}
                  />
                  <SortTh
                    column="mass"
                    label={m.bombChart.columns.mass}
                    align="right"
                    className={cn("hidden sm:table-cell", headCell)}
                    sort={sort}
                    dir={dir}
                    onSort={handleSort}
                    compact={wide}
                  />
                  <SortTh
                    column="tnt"
                    label={m.bombChart.columns.tnt}
                    align="right"
                    className={cn("hidden md:table-cell", headCell)}
                    sort={sort}
                    dir={dir}
                    onSort={handleSort}
                    compact={wide}
                  />
                  <SortTh
                    column="efficiency"
                    label={m.bombChart.columns.efficiency}
                    align="right"
                    className={cn("hidden md:table-cell", headCell)}
                    sort={sort}
                    dir={dir}
                    onSort={handleSort}
                    compact={wide}
                  />
                  <SortTh
                    column="kind"
                    label={m.bombChart.columns.kind}
                    className={cn("hidden lg:table-cell", headCell)}
                    sort={sort}
                    dir={dir}
                    onSort={handleSort}
                    compact={wide}
                  />
                  {EXTRA_COLUMNS.filter((column) => shownColumns.has(column)).map((column) => (
                    <SortTh
                      key={column}
                      column={column}
                      label={extraHeaders[column]}
                      align={column === "warhead" || column === "explosive" ? "left" : "right"}
                      className={headCell}
                      sort={sort}
                      dir={dir}
                      onSort={handleSort}
                      compact={wide}
                    />
                  ))}
                </tr>
              </thead>
              <BombRows
                rows={listed}
                massUnit={shownUnit}
                columns={shownColumns}
                wide={wide}
                guidanceLabels={guidanceLabels}
                compared={comparedSet}
                onCompare={toggleCompared}
              />
            </table>
          </div>
          {shownSources.has("estimate") ? (
            <p className="text-xs text-ink-faint">
              <span className="text-ink-dim">≈</span> {m.bombChart.estimateLegend}
            </p>
          ) : null}
        </div>
      )}

      {compared.length > 0 ? (
        <div className="sticky bottom-4 z-30 flex justify-center">
          <div className="card flex items-center gap-3 px-3 py-2 shadow-lg">
            <Link
              href={`${path("/armament/compare/")}?ids=${compared.join(",")}`}
              transitionTypes={["nav-forward"]}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent-dim px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/20"
            >
              <Columns3 size={15} aria-hidden /> {fill(m.compare.compareSelected, { n: compared.length })}
            </Link>
            <button
              type="button"
              onClick={() => setCompared([])}
              className="text-sm text-ink-faint underline underline-offset-4 hover:text-accent"
            >
              {m.compare.clear}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type SortableRow = { bomb: ChartRow; needed: number | null };

/** The table's body, apart so the rest of the page can re-render without it. */
const BombRows = memo(function BombRows({
  rows,
  massUnit,
  columns,
  wide,
  guidanceLabels,
  compared,
  onCompare,
}: {
  rows: SortableRow[];
  massUnit: MassUnit;
  columns: ReadonlySet<ExtraColumn>;
  /**
   * Extra columns are on: set tighter, words free to wrap, and the name column
   * held in place while the table scrolls sideways — see ArmamentChart.
   */
  wide: boolean;
  guidanceLabels: Record<string, string>;
  compared: ReadonlySet<string>;
  onCompare: (id: string) => void;
}) {
  const { m, number, path, fill } = useI18n();
  const full = compared.size >= MAX_COMPARED;
  const decimal = (value: number, digits: number) => number(value, { maximumFractionDigits: digits });
  const extraCell = (bomb: ChartRow, column: ExtraColumn): string | null => {
    switch (column) {
      case "range":
        return bomb.launchRangeM !== undefined ? `${decimal(bomb.launchRangeM / 1000, 1)} km` : null;
      case "speed":
        // As the game's tooltip gives it: Mach to one decimal, else m/s.
        if (bomb.machMax !== undefined) return `${number(bomb.machMax, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`;
        return bomb.maxSpeedMs !== undefined ? `${decimal(bomb.maxSpeedMs, 0)} m/s` : null;
      case "guidanceTime":
        return bomb.guidanceTimeS !== undefined ? `${decimal(bomb.guidanceTimeS, 1)} s` : null;
      case "warhead":
        return bomb.warhead ?? null;
      case "explosive":
        return bomb.explosive ?? null;
      case "charge":
        return bomb.explosiveMassKg !== undefined ? `${decimal(bomb.explosiveMassKg, 2)} kg` : null;
    }
  };
  const extras = EXTRA_COLUMNS.filter((column) => columns.has(column));
  const pad = wide ? "px-2" : "px-3";

  return (
    <tbody>
      {rows.map(({ bomb, needed }) => (
        <tr key={bomb.id} className="group border-t border-line hover:bg-surface-2">
          <td className={cn("py-2", pad, wide && "sm:sticky sm:left-0 sm:z-[5] bg-surface group-hover:bg-surface-2")}>
            <div className="flex items-center gap-2.5">
              <CompareToggle
                on={compared.has(bomb.id)}
                disabled={full && !compared.has(bomb.id)}
                label={fill(compared.has(bomb.id) ? m.compare.removeFromCompare : m.compare.addToCompare, {
                  name: bomb.chartName || bomb.fullName,
                })}
                onClick={() => onCompare(bomb.id)}
              />
              <BombIcon bomb={bomb} size={28} />
              <div className="min-w-0">
                <Link
                  href={path(`/armament/${bomb.id}/`)}
                  transitionTypes={["nav-forward"]}
                  className="flex items-center gap-1.5 font-medium hover:text-accent transition-colors"
                >
                  {bomb.nation ? <Flag nation={bomb.nation} size={13} /> : null}
                  {bomb.chartName || bomb.fullName}
                </Link>
                <div
                  className={cn(
                    "text-xs text-ink-faint truncate max-w-[9rem]",
                    wide ? "sm:max-w-[12rem]" : "sm:max-w-[22rem]",
                  )}
                >
                  {bomb.fullName}
                </div>
              </div>
            </div>
          </td>
          <td className={cn("nums py-2 text-right text-accent font-semibold text-base whitespace-nowrap", pad)}>
            {needed !== null && Number.isFinite(needed) ? (
              <>
                {bomb.damageSource === "estimate" ? <span className="font-normal text-ink-faint">≈ </span> : null}
                {needed}
              </>
            ) : (
              "—"
            )}
          </td>
          <td className={cn("nums py-2 text-right text-ink-dim whitespace-nowrap", pad)}>
            <DamageValue bomb={bomb} />
          </td>
          <td className={cn("nums py-2 text-right text-ink-dim whitespace-nowrap hidden sm:table-cell", pad)}>
            {formatMass(bomb, massUnit)}
          </td>
          <td className={cn("nums py-2 text-right text-ink-dim whitespace-nowrap hidden md:table-cell", pad)}>
            {bomb.tntKg !== null ? `${Math.round(bomb.tntKg)} kg` : "—"}
          </td>
          <td className={cn("nums py-2 text-right text-ink-dim whitespace-nowrap hidden md:table-cell", pad)}>
            {bomb.efficiency ?? "—"}
          </td>
          <td className={cn("py-2 text-ink-faint hidden lg:table-cell", pad, !wide && "whitespace-nowrap")}>
            {bomb.guidance ? (guidanceLabels[bomb.guidance] ?? bomb.guidance) : m.bombKinds[bomb.kind]}
          </td>
          {extras.map((column) => (
            <td
              key={column}
              className={cn(
                "py-2 text-ink-dim",
                pad,
                // The words of a warhead or a filler wrap; a figure stays whole.
                column === "warhead" || column === "explosive" ? "text-left" : "nums text-right whitespace-nowrap",
              )}
            >
              {extraCell(bomb, column) ?? "—"}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
});

/**
 * A row's damage to a base: the price bare, an estimate from the explosion
 * model marked "≈" — it counts towards the bases but not the reward.
 */
function DamageValue({ bomb }: { bomb: Pick<ChartRow, "damageValue" | "damageSource"> }) {
  const { m, number } = useI18n();
  if (bomb.damageValue === null) return <>—</>;
  if (bomb.damageSource === "estimate") {
    return (
      <span title={m.bombChart.estimateLegend} className="underline decoration-dotted underline-offset-4 cursor-help">
        ≈ {number(bomb.damageValue)}
      </span>
    );
  }
  return <>{number(bomb.damageValue)}</>;
}

/** Ticks a row for the comparison: a box, not a switch, as more than one can be on. */
function CompareToggle({
  on,
  disabled,
  label,
  onClick,
}: {
  on: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors disabled:opacity-30",
        on ? "border-accent bg-accent text-ground" : "border-line-bright hover:border-accent",
      )}
    >
      {on ? <Check size={12} strokeWidth={3} /> : null}
    </button>
  );
}

type KindLabels = Record<BombKind, string>;

function sortKeyOf(row: SortableRow, column: Sort, kinds: KindLabels): number | string | null {
  const { bomb } = row;
  switch (column) {
    case "name":
      return bomb.chartName || bomb.fullName;
    case "needed":
      return row.needed;
    case "damage":
      return bomb.damageValue;
    case "mass":
      return bomb.massKg;
    case "tnt":
      return bomb.tntKg;
    case "efficiency":
      return bomb.efficiency;
    case "kind":
      return kinds[bomb.kind];
    case "range":
      return bomb.launchRangeM ?? null;
    case "speed":
      return bomb.machMax !== undefined ? bomb.machMax * MACH_MS : (bomb.maxSpeedMs ?? null);
    case "guidanceTime":
      return bomb.guidanceTimeS ?? null;
    case "warhead":
      return bomb.warhead ?? null;
    case "explosive":
      return bomb.explosive ?? null;
    case "charge":
      return bomb.explosiveMassKg ?? null;
  }
}

/**
 * Orders two rows by one column, nulls always last regardless of direction —
 * a bomb missing a TNT figure (incendiaries have none) shouldn't jump to the
 * top just because you flipped to "smallest first".
 *
 * Ties fall back to name, so equal values still land in a stable, readable
 * order rather than whatever the previous sort happened to leave them in.
 */
function compareRows(a: SortableRow, b: SortableRow, column: Sort, dir: SortDir, kinds: KindLabels): number {
  const av = sortKeyOf(a, column, kinds);
  const bv = sortKeyOf(b, column, kinds);

  let cmp: number;
  if (av === null || bv === null) {
    if (av === null && bv === null) cmp = 0;
    else return av === null ? 1 : -1;
  } else if (typeof av === "string" || typeof bv === "string") {
    cmp = String(av).localeCompare(String(bv));
  } else {
    cmp = av - bv;
  }

  const directed = dir === "asc" ? cmp : -cmp;
  if (directed !== 0 || column === "name") return directed;
  return compareRows(a, b, "name", "asc", kinds);
}

function SortTh({
  column,
  label,
  sort,
  dir,
  onSort,
  align = "left",
  className,
  compact,
}: {
  column: Sort;
  label: string;
  sort: Sort;
  dir: SortDir;
  onSort: (column: Sort) => void;
  align?: "left" | "right";
  className?: string;
  /** Set tighter, the label free to wrap — for the table with extra columns. */
  compact?: boolean;
}) {
  const active = sort === column;
  return (
    <th
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("font-normal py-2", compact ? "px-2" : "px-3", align === "right" ? "text-right" : "text-left", className)}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "group inline-flex items-center gap-1 transition-colors hover:text-ink",
          !compact && "whitespace-nowrap",
          align === "right" && "flex-row-reverse",
          active && "text-ink",
        )}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ChevronUp size={13} className="text-accent" />
          ) : (
            <ChevronDown size={13} className="text-accent" />
          )
        ) : (
          <ChevronsUpDown size={13} className="opacity-0 group-hover:opacity-60 transition-opacity" />
        )}
      </button>
    </th>
  );
}

function FilterChip({
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

/** Same idea as FilterChip, but for a multi-select — a checkmark, not a highlight, says "on". */
function CheckChip({
  checked,
  onClick,
  children,
}: {
  checked: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="checkbox"
      aria-checked={checked}
      className={cn(
        "flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full text-sm border transition motion-safe:active:scale-[0.97]",
        checked
          ? "border-accent text-accent bg-accent-dim"
          : "border-line text-ink-dim hover:text-ink hover:border-line-bright",
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center w-4 h-4 rounded-sm border shrink-0",
          checked ? "border-accent bg-accent text-ground" : "border-line-bright",
        )}
      >
        {checked ? <Check size={12} strokeWidth={3} /> : null}
      </span>
      {children}
    </button>
  );
}

function RangeField({
  label,
  bounds,
  min,
  max,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  bounds: { min: number; max: number };
  min: number | null;
  max: number | null;
  onMinChange: (v: number | null) => void;
  onMaxChange: (v: number | null) => void;
}) {
  const { m, fill } = useI18n();
  const parse = (raw: string) => (raw.trim() === "" ? null : Number(raw));
  return (
    <div className="space-y-1.5">
      <div className="text-xs uppercase tracking-wider text-ink-faint">{label}</div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={min ?? ""}
          onChange={(e) => onMinChange(parse(e.target.value))}
          placeholder={String(bounds.min)}
          aria-label={fill(m.bombChart.minimum, { label })}
          // text-base, not text-sm — iOS Safari zooms the whole page in on
          // focus for any input under 16px, which text-sm's 14px is.
          className="w-full min-w-0 card px-2.5 py-1.5 text-base outline-none placeholder:text-ink-faint focus:border-accent transition-colors"
        />
        <span className="text-ink-faint text-sm shrink-0">–</span>
        <input
          type="number"
          inputMode="numeric"
          value={max ?? ""}
          onChange={(e) => onMaxChange(parse(e.target.value))}
          placeholder={String(bounds.max)}
          aria-label={fill(m.bombChart.maximum, { label })}
          className="w-full min-w-0 card px-2.5 py-1.5 text-base outline-none placeholder:text-ink-faint focus:border-accent transition-colors"
        />
      </div>
    </div>
  );
}
