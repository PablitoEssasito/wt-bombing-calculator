"use client";

import { Check, ChevronDown, ChevronUp, ChevronsUpDown, Columns3 } from "lucide-react";
import Link from "next/link";
import { memo, useCallback, useDeferredValue, useEffect, useMemo } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { BombIcon } from "@/components/bomb-glyph";
import { Count } from "@/components/filter-count";
import { Filled } from "@/components/filled";
import { bombsNeeded, effectiveBaseHp } from "@/domain/base-hp";
import {
  groupValues,
  inTab,
  TAB_GROUPS,
  TABS,
  type ChartRow,
  type ChartTab,
  type FilterGroup,
} from "@/domain/bomb-chart";
import {
  BASE_HP_TIERS,
  GAME_MODES,
  NATIONS,
  type BaseCount,
  type BaseHp,
  type GameMode,
  type Nation,
} from "@/domain/constants";
import {
  COLUMN_IDS,
  columnsFor,
  compareRows,
  DEFAULT_DIR,
  EXTRA_COLUMNS,
  extrasFor,
  sortFor,
  TAB_COLUMNS,
  type ColumnId,
  type ExtraColumn,
  type Sort,
  type SortableRow,
  type SortDir,
} from "@/domain/chart-columns";
import {
  BOMB_TYPES,
  WARHEADS,
  WEAPON_CATEGORIES,
  WEAPON_TAGS,
  type WeaponCategory,
  type WeaponTag,
} from "@/domain/weapon-tags";
import type { ClientMessages } from "@/i18n/messages";
import { Flag } from "@/components/flag";
import { Segmented } from "@/components/segmented";
import { ShareButton } from "@/components/share-button";
import { TriChip } from "@/components/tri-chip";
import { track } from "@/lib/analytics";
import { useI18n } from "@/i18n/client";
import { FACET_TRACKED, facetState, matchesFacet, nextFacet, type FacetState } from "@/lib/facet";
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

const SORTS = ["name", ...COLUMN_IDS] as const satisfies readonly Sort[];

/** Below which width a column gives way, so a phone keeps the name and what matters most. */
function hideOf(column: ColumnId, tab: ChartTab): string {
  // The seeker is what a radar missile is picked by, a phone too; an air-to-ground one's, from a tablet up.
  if (column === "kind") return tab === "aamRadar" ? "" : tab === "agm" ? "hidden sm:table-cell" : "hidden lg:table-cell";
  if (column === "mass" || column === "seeker") return "hidden sm:table-cell";
  // A phone has room beside the name for what sets a tab apart, not a missile's reach too —
  // unless it was asked for as an extra column.
  if (column === "range" && TAB_COLUMNS[tab].includes("range")) return "hidden sm:table-cell";
  if (column === "tnt" || column === "efficiency" || column === "speed" || column === "loadFactor") return "hidden md:table-cell";
  return "";
}

/** Columns of words, which wrap and sit left; the rest are figures. */
const WORDS: ReadonlySet<ColumnId> = new Set(["kind", "aspect", "warhead", "explosive"]);

/**
 * The Type column's wording: the game's own guidance label for a guided
 * weapon, how one flown by wire or radio is flown, a bomb's type, a rocket's
 * warhead, else the sheet's kind.
 */
function typeOf(bomb: ChartRow, m: ClientMessages, guidanceLabels: Record<string, string>): string {
  if (bomb.guidance) return guidanceLabels[bomb.guidance] ?? bomb.guidance;
  const flown = bomb.tags.find((tag) => tag === "mclos" || tag === "saclos" || tag === "beamRiding");
  if (flown) return m.weaponTags[flown];
  // The chips' own words, so the column reads as the filters above it do.
  const own = bomb.category === "bomb" ? BOMB_TYPES : bomb.category === "rocket" ? WARHEADS : [];
  const tag = bomb.tags.find((t) => (own as readonly string[]).includes(t));
  return tag ? m.weaponTags[tag] : m.bombKinds[bomb.kind];
}

/**
 * How the Mass column reads. "Original" is whatever the source itself printed —
 * nations mix lb and kg depending on which one they historically used — the
 * other two force everything to one unit so a whole column can be compared
 * directly, or converted at a glance without doing the maths by hand.
 */
const MASS_UNITS = ["original", "kg", "lb"] as const;
type MassUnit = (typeof MASS_UNITS)[number];

const LB_PER_KG = 1 / 0.45359237;

function formatMass(bomb: ChartRow, unit: MassUnit): string {
  if (unit === "original") return bomb.massLabel || "—";
  if (bomb.massKg === null) return "—";
  return unit === "kg"
    ? `${Math.round(bomb.massKg)} kg`
    : `${Math.round(bomb.massKg * LB_PER_KG)} lb`;
}

const SOURCES = ["all", "game"] as const;

/** The weapons ticked for the comparison, in the order they were ticked. */
const COMPARED = urlList();
// Made once, so the parsed sets keep their identity from render to render.
const CATEGORY_FILTER = urlStringSet<WeaponCategory>(WEAPON_CATEGORIES);
const TAG_FILTER = urlStringSet<WeaponTag>(WEAPON_TAGS);
const COLUMNS = urlStringSet<ExtraColumn>(EXTRA_COLUMNS);

/** The ticked and crossed-out values a group of chips reads, cut to its own. */
function facetOf(group: FilterGroup, ticked: ReadonlySet<string>, crossed: ReadonlySet<string>) {
  const values = group.values as readonly string[];
  const own = (set: ReadonlySet<string>) => new Set([...set].filter((value) => values.includes(value)));
  return { ticked: own(ticked), crossed: own(crossed) };
}

export function ArmamentChart({ bombs, guidanceLabels }: { bombs: ChartRow[]; guidanceLabels: Record<string, string> }) {
  const { m, number, fill, path } = useI18n();
  const [tab, setTab] = useUrlState("view", urlLiteral(TABS, "bases"));
  const [query, setQuery] = useUrlState("q", urlText());
  const [hp, setHp] = useUrlState("hp", urlInteger(25900));
  const [mode, setMode] = useUrlState("mode", urlLiteral(GAME_MODES, "rb"));
  const [mapSize, setMapSize] = useUrlState("map", urlInteger(4));
  const [sort, setSort] = useUrlState("sort", urlLiteral(SORTS, "needed"));
  const [massUnit, setMassUnit] = useUrlState("massUnit", urlLiteral(MASS_UNITS, "original"));
  const [dir, setDir] = useUrlState("dir", urlLiteral<SortDir>(["asc", "desc"], DEFAULT_DIR.needed));
  const [nation, setNation] = useUrlState("nation", urlLiteral(["all", ...NATIONS] as const, "all"));
  const [cats, setCats] = useUrlState("cat", CATEGORY_FILTER);
  const [notCats, setNotCats] = useUrlState("notCat", CATEGORY_FILTER);
  const [tags, setTags] = useUrlState("tags", TAG_FILTER);
  const [notTags, setNotTags] = useUrlState("notTags", TAG_FILTER);
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

  // Mass and TNT bounds read from every row on the tab that states one;
  // damage only from what has a price — an air-to-air missile's blank damage
  // must not collapse this range to nothing, nor a megaton bomb stretch it.
  // A tab with no damage to show — air-to-air missiles — gets no damage filter.
  const bounds = useMemo(() => {
    const shown = bombs.filter((b) => inTab(b, tab));
    const priced = shown.filter((b) => b.damageValue !== null);
    const range = (values: number[]) =>
      values.length ? { min: Math.min(...values), max: Math.max(...values) } : { min: 0, max: 0 };
    return {
      mass: range(shown.flatMap((b) => (b.massKg !== null ? [Math.round(b.massKg)] : []))),
      tnt: range(shown.flatMap((b) => (b.tntKg !== null ? [Math.round(b.tntKg)] : []))),
      damage: range(priced.map((b) => b.damageValue!)),
      priced: priced.length > 0,
      estimated: priced.some((b) => b.damageSource === "estimate"),
    };
  }, [bombs, tab]);

  const shownColumns = useDeferredValue(columns);
  // The page's sort where the tab shows that column, else the tab's own order.
  const order = sortFor(tab, sort, dir, columns);
  const typeLabel = useCallback((bomb: ChartRow) => typeOf(bomb, m, guidanceLabels), [m, guidanceLabels]);

  // The tab's chip rows, each with only the values that split its rows: no
  // "Unguided" chip where every rocket is, no row at all with nothing to pick.
  const groups = useMemo(() => {
    const shown = bombs.filter((b) => inTab(b, tab));
    return TAB_GROUPS[tab].flatMap((group) => {
      const values = group.values.filter((value) => {
        const having = shown.filter((b) => groupValues(b, group).includes(value)).length;
        return having > 0 && having < shown.length;
      });
      return values.length > 0 ? [{ group, values }] : [];
    });
  }, [bombs, tab]);

  // The rows, and for the facet counts — how many rows each option would
  // leave — the rows with every *other* filter applied but that axis's own,
  // same idea as the aircraft page's chip counts. A feature (IOG, a data
  // link) narrows alongside the others ticked in its row, so its count keeps
  // them and sets aside only its own chip.
  const { rows, withoutNation, counts } = useMemo(() => {
    const needle = deferred.trim().toLowerCase();
    const setsOf = (group: FilterGroup, without?: string) => {
      const sets =
        group.axis === "category"
          ? facetOf(group, cats as ReadonlySet<string>, notCats as ReadonlySet<string>)
          : facetOf(group, tags as ReadonlySet<string>, notTags as ReadonlySet<string>);
      if (without !== undefined) {
        sets.ticked.delete(without);
        sets.crossed.delete(without);
      }
      return sets;
    };
    const passes = (bomb: ChartRow, except?: "nation" | FilterGroup["id"], without?: string) => {
      if (!inTab(bomb, tab)) return false;
      if (bounds.estimated && source === "game" && bomb.damageSource === "estimate") return false;
      if (needle && !bomb.chartName.toLowerCase().includes(needle) && !bomb.fullName.toLowerCase().includes(needle)) {
        return false;
      }
      if (except !== "nation" && nation !== "all" && !bomb.usedByNations.includes(nation)) return false;
      for (const group of TAB_GROUPS[tab]) {
        if (group.id === except) continue;
        const { ticked, crossed } = setsOf(group, without);
        if (!matchesFacet(groupValues(bomb, group), ticked, crossed, group.mode)) return false;
      }
      if (massMin !== null && (bomb.massKg ?? -Infinity) < massMin) return false;
      if (massMax !== null && (bomb.massKg ?? Infinity) > massMax) return false;
      if (tntMin !== null && (bomb.tntKg ?? -Infinity) < tntMin) return false;
      if (tntMax !== null && (bomb.tntKg ?? Infinity) > tntMax) return false;
      // A damage-range filter can't be tested against a blank value — treat
      // "no data" as failing the filter rather than coercing null to 0. On a
      // tab with no damage at all it is not on the page, so it filters nothing.
      if (bounds.priced) {
        if ((dmgMin !== null || dmgMax !== null) && bomb.damageValue === null) return false;
        if (dmgMin !== null && bomb.damageValue !== null && bomb.damageValue < dmgMin) return false;
        if (dmgMax !== null && bomb.damageValue !== null && bomb.damageValue > dmgMax) return false;
      }
      return true;
    };

    const sorted = bombs
      .filter((bomb) => passes(bomb))
      .map((bomb) => ({
        bomb,
        needed: bomb.damageValue ? bombsNeeded(effectiveHp, bomb.damageValue) : null,
      }))
      .sort((a, b) => compareRows(a, b, order.sort, order.dir, typeLabel));
    const counts = new Map<string, number>();
    for (const group of TAB_GROUPS[tab]) {
      const alternatives = group.mode === "any" ? bombs.filter((bomb) => passes(bomb, group.id)) : null;
      for (const value of group.values) {
        const pool = alternatives ?? bombs.filter((bomb) => passes(bomb, undefined, value));
        counts.set(`${group.id}:${value}`, pool.filter((bomb) => groupValues(bomb, group).includes(value)).length);
      }
    }
    return { rows: sorted, withoutNation: bombs.filter((bomb) => passes(bomb, "nation")), counts };
  }, [
    bombs,
    tab,
    source,
    deferred,
    effectiveHp,
    order.sort,
    order.dir,
    nation,
    cats,
    notCats,
    tags,
    notTags,
    massMin,
    massMax,
    tntMin,
    tntMax,
    dmgMin,
    dmgMax,
    bounds.priced,
    bounds.estimated,
    typeLabel,
  ]);

  // The table redraws a few hundred rows on every filter, sort or unit change;
  // deferred, so the control itself answers the click first.
  const listed = useDeferredValue(rows);
  const shownUnit = useDeferredValue(massUnit);
  const shownTab = useDeferredValue(tab);
  const tableColumns = useMemo(() => columnsFor(shownTab, shownColumns), [shownTab, shownColumns]);
  // More than the six columns against a base: set tighter, and held in a window of its own.
  const wide = tableColumns.length > 6;
  // A header cell stays at the top of the table's own scroll window — see the table below.
  const headCell = wide ? "sm:sticky sm:top-0 sm:z-10 bg-surface sm:shadow-[inset_0_-1px_0_var(--color-line)]" : undefined;

  const nationCount = (n: Nation | "all") =>
    n === "all" ? withoutNation.length : withoutNation.filter((b) => b.usedByNations.includes(n)).length;
  const valueCount = (group: FilterGroup, value: string) => counts.get(`${group.id}:${value}`) ?? 0;

  const clearFacets = () => {
    setCats(new Set());
    setNotCats(new Set());
    setTags(new Set());
    setNotTags(new Set());
  };

  const selectTab = (next: ChartTab) => {
    setTab(next);
    // A value picked on one tab may have no chip on the next.
    clearFacets();
    track("filter_applied", { surface: "bombs", filter: "tab", value: next });
  };

  const selectNation = (n: Nation | "all") => {
    setNation(n);
    track("filter_applied", { surface: "bombs", filter: "nation", value: n });
  };

  const handleSort = (column: Sort) => {
    if (column === order.sort) {
      setSort(column);
      setDir(order.dir === "asc" ? "desc" : "asc");
    } else {
      setSort(column);
      setDir(DEFAULT_DIR[column]);
    }
    track("filter_applied", { surface: "bombs", filter: "sort", value: column });
  };

  const toggleValue = (group: FilterGroup, value: string) => {
    let state: FacetState;
    if (group.axis === "category") {
      const next = nextFacet(value as WeaponCategory, cats, notCats);
      setCats(next.ticked);
      setNotCats(next.crossed);
      state = next.state;
    } else {
      const next = nextFacet(value as WeaponTag, tags, notTags);
      setTags(next.ticked);
      setNotTags(next.crossed);
      state = next.state;
    }
    track("filter_applied", { surface: "bombs", filter: group.axis, value, state: FACET_TRACKED[state] });
  };
  const stateOf = (group: FilterGroup, value: string) =>
    group.axis === "category"
      ? facetState(value as WeaponCategory, cats, notCats)
      : facetState(value as WeaponTag, tags, notTags);

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

  const filtersActive =
    query.trim() !== "" ||
    nation !== "all" ||
    cats.size > 0 ||
    notCats.size > 0 ||
    tags.size > 0 ||
    notTags.size > 0 ||
    source !== "all" ||
    rangesActive;
  const clearFilters = () => {
    setQuery("");
    setNation("all");
    clearFacets();
    setSource("all");
    clearRanges();
  };

  const extraHeaders: Record<ExtraColumn, string> = m.bombChart.extraColumns;
  const headerOf = (column: ColumnId, onTab: ChartTab): string => {
    switch (column) {
      case "kind":
        // What sets these apart is what steers them.
        return onTab === "agm" || onTab === "aamRadar" ? m.bombChart.groups.guidance : m.bombChart.columns.kind;
      case "aspect":
        return m.bombChart.groups.aspect;
      case "irccm":
        return m.weaponTags.irccm;
      case "needed":
      case "damage":
      case "mass":
      case "tnt":
      case "efficiency":
      case "seeker":
      case "loadFactor":
        return m.bombChart.columns[column];
      default:
        return extraHeaders[column];
    }
  };
  // Match BR, mode and bases on the map mean something only where a row counts per base.
  const againstBases = TAB_COLUMNS[tab].includes("needed");

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
      <section className={cn("card p-4 grid gap-5 sm:grid-cols-3", !againstBases && "hidden")}>
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
          value={tab}
          onChange={selectTab}
          options={TABS.map((t) => ({ value: t, label: m.bombChart.tabs[t] }))}
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

        {groups.map(({ group, values }, index) => (
          <div key={group.id} className="space-y-1.5">
            <div className="text-xs text-ink-faint">
              <span className="uppercase tracking-wider">{m.bombChart.groups[group.id]}</span>
              {index === 0 ? ` · ${m.common.excludeHint}` : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {values.map((value) => (
                <TriChip key={value} state={stateOf(group, value)} onClick={() => toggleValue(group, value)}>
                  {group.axis === "category"
                    ? m.weaponCategories[value as WeaponCategory]
                    : m.weaponTags[value as WeaponTag]}
                  <Count>{valueCount(group, value)}</Count>
                </TriChip>
              ))}
            </div>
          </div>
        ))}

        <div className={cn("grid gap-4", bounds.priced ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
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
          {bounds.priced ? (
            <RangeField
              label={m.bombChart.damage}
              bounds={bounds.damage}
              min={dmgMin}
              max={dmgMax}
              onMinChange={setDmgMin}
              onMaxChange={setDmgMax}
            />
          ) : null}
        </div>

        {bounds.estimated ? (
          <CheckChip
            checked={source === "game"}
            onClick={() => {
              setSource(source === "game" ? "all" : "game");
              track("filter_applied", { surface: "bombs", filter: "source", value: source === "game" ? "all" : "game" });
            }}
          >
            {m.bombChart.gameOnly}
          </CheckChip>
        ) : null}
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
            {extrasFor(tab).map((column) => (
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
              template={againstBases ? m.bombChart.summary : m.bombChart.summaryCount}
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
                    sort={order.sort}
                    dir={order.dir}
                    onSort={handleSort}
                    compact={wide}
                  />
                  {tableColumns.map((column) => (
                    <SortTh
                      key={column}
                      column={column}
                      label={headerOf(column, shownTab)}
                      align={WORDS.has(column) ? "left" : "right"}
                      className={cn(hideOf(column, shownTab), headCell)}
                      sort={order.sort}
                      dir={order.dir}
                      onSort={handleSort}
                      compact={wide}
                    />
                  ))}
                </tr>
              </thead>
              <BombRows
                rows={listed}
                massUnit={shownUnit}
                columns={tableColumns}
                tab={shownTab}
                wide={wide}
                typeOf={typeLabel}
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

/** The table's body, apart so the rest of the page can re-render without it. */
const BombRows = memo(function BombRows({
  rows,
  massUnit,
  columns,
  tab,
  wide,
  typeOf,
  compared,
  onCompare,
}: {
  rows: SortableRow[];
  massUnit: MassUnit;
  /** The tab's columns, then the extras ticked — see chart-columns.ts. */
  columns: readonly ColumnId[];
  tab: ChartTab;
  /**
   * More columns than the six against a base: set tighter, words free to wrap,
   * and the name column held in place while the table scrolls sideways — see ArmamentChart.
   */
  wide: boolean;
  typeOf: (bomb: ChartRow) => string;
  compared: ReadonlySet<string>;
  onCompare: (id: string) => void;
}) {
  const { m, number, path, fill } = useI18n();
  const full = compared.size >= MAX_COMPARED;
  const decimal = (value: number, digits: number) => number(value, { maximumFractionDigits: digits });
  const km = (metres: number) => `${decimal(metres / 1000, 1)} km`;
  const figure = (bomb: ChartRow, column: ColumnId): string | null => {
    switch (column) {
      case "mass":
        return formatMass(bomb, massUnit);
      case "tnt":
        return bomb.tntKg !== null ? `${Math.round(bomb.tntKg)} kg` : null;
      case "efficiency":
        return bomb.efficiency !== null ? String(bomb.efficiency) : null;
      case "kind":
        // "ARH+IOG+GNSS+DL" is one word to a browser: let it break after a plus on a phone.
        return typeOf(bomb).replaceAll("+", "+​");
      case "aspect":
        return bomb.tags.includes("allAspect")
          ? m.weaponTags.allAspect
          : bomb.tags.includes("rearAspect")
            ? m.weaponTags.rearAspect
            : null;
      case "seeker":
        return bomb.seekerRangeM !== undefined ? km(bomb.seekerRangeM) : null;
      case "loadFactor":
        return bomb.loadFactorMax !== undefined ? `${decimal(bomb.loadFactorMax, 1)} G` : null;
      case "range":
        return bomb.launchRangeM !== undefined ? km(bomb.launchRangeM) : null;
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
      default:
        return null;
    }
  };
  // Tighter on a phone too, where the name, the count and the damage have to share 360 px.
  const pad = wide ? "px-2" : "px-2 sm:px-3";

  return (
    <tbody>
      {rows.map(({ bomb, needed }) => (
        <tr key={bomb.id} className="group border-t border-line hover:bg-surface-2">
          <td className={cn("py-2", pad, wide && "sm:sticky sm:left-0 sm:z-[5] bg-surface group-hover:bg-surface-2")}>
            <div className="flex items-center gap-2 sm:gap-2.5">
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
                {/* The full name has no room on a phone; the weapon's page gives it. */}
                <div
                  className={cn(
                    "hidden sm:block text-xs text-ink-faint truncate",
                    wide ? "sm:max-w-[12rem]" : "sm:max-w-[22rem]",
                  )}
                >
                  {bomb.fullName}
                </div>
              </div>
            </div>
          </td>
          {columns.map((column) => {
            const hide = hideOf(column, tab);
            if (column === "needed") {
              return (
                <td key={column} className={cn("nums py-2 text-right text-accent font-semibold text-base whitespace-nowrap", pad, hide)}>
                  {needed !== null && Number.isFinite(needed) ? (
                    <>
                      {bomb.damageSource === "estimate" ? <span className="font-normal text-ink-faint">≈ </span> : null}
                      {needed}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              );
            }
            if (column === "damage") {
              return (
                <td key={column} className={cn("nums py-2 text-right text-ink-dim whitespace-nowrap", pad, hide)}>
                  <DamageValue bomb={bomb} />
                </td>
              );
            }
            if (column === "irccm") {
              return (
                <td key={column} className={cn("py-2 text-right text-ink-dim", pad, hide)}>
                  {bomb.tags.includes("irccm") ? (
                    <Check size={15} strokeWidth={2.5} className="ml-auto text-accent" aria-label={m.weaponTags.irccm} />
                  ) : (
                    "—"
                  )}
                </td>
              );
            }
            return (
              <td
                key={column}
                className={cn(
                  "py-2",
                  pad,
                  hide,
                  column === "kind" ? "text-ink-faint" : "text-ink-dim",
                  // Words wrap where the table is tight — a phone, or many columns; a figure stays whole.
                  WORDS.has(column) ? cn("text-left", !wide && "sm:whitespace-nowrap") : "nums text-right whitespace-nowrap",
                )}
              >
                {figure(bomb, column) ?? "—"}
              </td>
            );
          })}
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
  /** Set tighter, the label free to wrap — for the table with extra columns. A phone gets that anyway. */
  compact?: boolean;
}) {
  const active = sort === column;
  return (
    <th
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "font-normal py-2",
        compact ? "px-2" : "px-2 sm:px-3",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "group inline-flex items-center gap-1 transition-colors hover:text-ink",
          !compact && "sm:whitespace-nowrap",
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
          // Shown on hover, so no room kept for it on a phone, which has none.
          <ChevronsUpDown size={13} className="hidden sm:block opacity-0 group-hover:opacity-60 transition-opacity" />
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
