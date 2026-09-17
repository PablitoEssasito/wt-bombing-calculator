"use client";

import { Check, ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { useDeferredValue, useMemo } from "react";
import { bombsNeeded, effectiveBaseHp } from "@/domain/base-hp";
import {
  BASE_HP_TIERS,
  GAME_MODES,
  NATION_LABELS,
  NATIONS,
  type BaseCount,
  type BaseHp,
  type GameMode,
  type Nation,
} from "@/domain/constants";
import type { Bomb, BombKind } from "@/domain/types";
import { Flag } from "@/components/flag";
import { Segmented } from "@/components/segmented";
import { BOMB_KIND_LABELS } from "@/lib/labels";
import {
  urlInteger,
  urlLiteral,
  urlOptionalInteger,
  urlStringSet,
  urlText,
  useUrlState,
} from "@/lib/use-url-state";
import { cn, formatCount } from "@/lib/utils";

const SORTS = ["name", "needed", "damage", "mass", "tnt", "efficiency", "kind"] as const;
type Sort = (typeof SORTS)[number];
type SortDir = "asc" | "desc";

/**
 * Which direction a column starts in on its first click.
 *
 * Text columns start A-Z; for numbers, whichever end is more interesting to see
 * first — cheapest bombs-per-base, heaviest hitters by damage/mass/TNT — rather
 * than defaulting every column to the same direction.
 */
const DEFAULT_DIR: Record<Sort, SortDir> = {
  name: "asc",
  needed: "asc",
  damage: "desc",
  mass: "desc",
  tnt: "desc",
  efficiency: "desc",
  kind: "asc",
};

/**
 * How the Mass column reads. "Original" is whatever the source itself printed —
 * nations mix lb and kg depending on which one they historically used — the
 * other two force everything to one unit so a whole column can be compared
 * directly, or converted at a glance without doing the maths by hand.
 */
const MASS_UNITS = ["original", "kg", "lb"] as const;
type MassUnit = (typeof MASS_UNITS)[number];

const MASS_UNIT_LABELS: Record<MassUnit, string> = {
  original: "Original",
  kg: "kg",
  lb: "lb",
};

const LB_PER_KG = 1 / 0.45359237;

function formatMass(bomb: Bomb, unit: MassUnit): string {
  if (unit === "original") return bomb.massLabel || "—";
  if (bomb.massKg === null) return "—";
  return unit === "kg"
    ? `${Math.round(bomb.massKg)} kg`
    : `${Math.round(bomb.massKg * LB_PER_KG)} lb`;
}

/**
 * Every kind that can actually reach this table.
 *
 * Rockets carry no damage value — nobody publishes one, see
 * `scripts/etl/rockets.ts` — but they do carry real mass and TNT figures, so
 * they still get a row; the damage and per-base columns just read "—" for them.
 */
const PRICED_KINDS = [
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
] as const satisfies readonly BombKind[];

export function BombChart({ bombs }: { bombs: Bomb[] }) {
  const [query, setQuery] = useUrlState("q", urlText());
  const [hp, setHp] = useUrlState("hp", urlInteger(25900));
  const [mode, setMode] = useUrlState("mode", urlLiteral(GAME_MODES, "rb"));
  const [mapSize, setMapSize] = useUrlState("map", urlInteger(4));
  const [sort, setSort] = useUrlState("sort", urlLiteral(SORTS, "needed"));
  const [massUnit, setMassUnit] = useUrlState("massUnit", urlLiteral(MASS_UNITS, "original"));
  const [dir, setDir] = useUrlState("dir", urlLiteral<SortDir>(["asc", "desc"], DEFAULT_DIR.needed));
  const [nation, setNation] = useUrlState("nation", urlLiteral(["all", ...NATIONS] as const, "all"));
  const [kinds, setKinds] = useUrlState("kinds", urlStringSet<BombKind>(PRICED_KINDS));
  const [massMin, setMassMin] = useUrlState("massMin", urlOptionalInteger());
  const [massMax, setMassMax] = useUrlState("massMax", urlOptionalInteger());
  const [tntMin, setTntMin] = useUrlState("tntMin", urlOptionalInteger());
  const [tntMax, setTntMax] = useUrlState("tntMax", urlOptionalInteger());
  const [dmgMin, setDmgMin] = useUrlState("dmgMin", urlOptionalInteger());
  const [dmgMax, setDmgMax] = useUrlState("dmgMax", urlOptionalInteger());

  const deferred = useDeferredValue(query);

  const baseHp = (BASE_HP_TIERS as readonly number[]).includes(hp) ? (hp as BaseHp) : 25900;
  const baseCount = (mapSize === 3 ? 3 : 4) as BaseCount;
  const effectiveHp = effectiveBaseHp(baseHp, mode as GameMode, baseCount);

  // Mass and TNT bounds read from every bomb and rocket that states one; damage
  // only from what the chart actually prices — a rocket's blank damage column
  // must not collapse this range to nothing.
  const bounds = useMemo(() => {
    const priced = bombs.filter((b) => b.damageValue !== null);
    const range = (values: number[]) =>
      values.length ? { min: Math.min(...values), max: Math.max(...values) } : { min: 0, max: 0 };
    return {
      mass: range(bombs.flatMap((b) => (b.massKg !== null ? [Math.round(b.massKg)] : []))),
      tnt: range(bombs.flatMap((b) => (b.tntKg !== null ? [Math.round(b.tntKg)] : []))),
      damage: range(priced.map((b) => b.damageValue!)),
    };
  }, [bombs]);

  const rows = useMemo(() => {
    const needle = deferred.trim().toLowerCase();
    const filtered = bombs.filter((bomb) => {
      // Rockets carry no damage value anywhere in the source — see
      // scripts/etl/rockets.ts — but still belong in the table for their mass
      // and TNT figures. Everything else with no damage value has nothing to
      // show at all, so it stays out.
      if (bomb.damageValue === null && bomb.kind !== "ROCKET") return false;
      if (needle && !bomb.chartName.toLowerCase().includes(needle) && !bomb.fullName.toLowerCase().includes(needle)) {
        return false;
      }
      if (nation !== "all" && bomb.nation !== nation) return false;
      if (kinds.size > 0 && !kinds.has(bomb.kind)) return false;
      if (massMin !== null && (bomb.massKg ?? -Infinity) < massMin) return false;
      if (massMax !== null && (bomb.massKg ?? Infinity) > massMax) return false;
      if (tntMin !== null && (bomb.tntKg ?? -Infinity) < tntMin) return false;
      if (tntMax !== null && (bomb.tntKg ?? Infinity) > tntMax) return false;
      // A damage-range filter can't be tested against a rocket's blank value —
      // treat "no data" as failing the filter rather than coercing null to 0.
      if ((dmgMin !== null || dmgMax !== null) && bomb.damageValue === null) return false;
      if (dmgMin !== null && bomb.damageValue !== null && bomb.damageValue < dmgMin) return false;
      if (dmgMax !== null && bomb.damageValue !== null && bomb.damageValue > dmgMax) return false;
      return true;
    });

    return filtered
      .map((bomb) => ({
        bomb,
        needed: bomb.damageValue !== null ? bombsNeeded(effectiveHp, bomb.damageValue) : null,
      }))
      .sort((a, b) => compareRows(a, b, sort, dir));
  }, [
    bombs,
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
  ]);

  const handleSort = (column: Sort) => {
    if (column === sort) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(column);
      setDir(DEFAULT_DIR[column]);
    }
  };

  const toggleKind = (kind: BombKind) => {
    const next = new Set(kinds);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    setKinds(next);
  };

  const clearRanges = () => {
    setMassMin(null);
    setMassMax(null);
    setTntMin(null);
    setTntMax(null);
    setDmgMin(null);
    setDmgMax(null);
  };
  const rangesActive =
    massMin !== null || massMax !== null || tntMin !== null || tntMax !== null || dmgMin !== null || dmgMax !== null;

  return (
    <div className="space-y-6">
      <section className="card p-4 grid gap-5 sm:grid-cols-3">
        <Segmented
          label="Match BR"
          value={String(baseHp)}
          onChange={(v) => setHp(Number(v))}
          options={BASE_HP_TIERS.map((tier) => ({
            value: String(tier),
            label: BR_RANGE_LABELS[tier],
            hint: `${formatCount(tier)} HP`,
          }))}
        />
        <Segmented
          label="Game mode"
          value={mode}
          onChange={(v) => setMode(v as GameMode)}
          options={[
            { value: "rb", label: "Realistic / Sim" },
            { value: "ab", label: "Arcade", hint: "double health" },
          ]}
        />
        <Segmented
          label="Bases on the map"
          value={String(baseCount)}
          onChange={(v) => setMapSize(Number(v))}
          options={[
            { value: "4", label: "Four" },
            { value: "3", label: "Three", hint: "half payload" },
          ]}
        />
      </section>

      <section className="card p-4 space-y-4">
        <div className="space-y-1.5">
          <div className="text-xs uppercase tracking-wider text-ink-faint">Nation</div>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={nation === "all"} onClick={() => setNation("all")}>
              <span aria-hidden>🌐</span> All nations
            </FilterChip>
            {NATIONS.map((n: Nation) => (
              <FilterChip key={n} active={nation === n} onClick={() => setNation(n)}>
                <Flag nation={n} /> {NATION_LABELS[n]}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs uppercase tracking-wider text-ink-faint">Type</div>
          <div className="flex flex-wrap gap-1.5">
            {PRICED_KINDS.map((kind) => (
              <CheckChip key={kind} checked={kinds.has(kind)} onClick={() => toggleKind(kind)}>
                {BOMB_KIND_LABELS[kind]}
              </CheckChip>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <RangeField
            label="Mass (kg)"
            bounds={bounds.mass}
            min={massMin}
            max={massMax}
            onMinChange={setMassMin}
            onMaxChange={setMassMax}
          />
          <RangeField
            label="TNT equivalent (kg)"
            bounds={bounds.tnt}
            min={tntMin}
            max={tntMax}
            onMinChange={setTntMin}
            onMaxChange={setTntMax}
          />
          <RangeField
            label="Damage"
            bounds={bounds.damage}
            min={dmgMin}
            max={dmgMax}
            onMinChange={setDmgMin}
            onMaxChange={setDmgMax}
          />
        </div>

        {rangesActive ? (
          <button
            type="button"
            onClick={clearRanges}
            className="text-sm text-accent underline underline-offset-4"
          >
            clear mass / TNT / damage filters
          </button>
        ) : null}
      </section>

      <div className="space-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter bombs…"
          aria-label="Filter bombs"
          className="card px-3 py-2 outline-none placeholder:text-ink-faint focus:border-accent transition-colors w-full sm:w-72"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-ink-faint">Mass shown in</span>
            <div role="group" aria-label="Mass unit" className="flex gap-1">
              {MASS_UNITS.map((u) => (
                <FilterChip key={u} active={massUnit === u} onClick={() => setMassUnit(u)}>
                  {MASS_UNIT_LABELS[u]}
                </FilterChip>
              ))}
            </div>
          </div>
          <p className="nums text-sm text-ink-dim">
            {rows.length} bombs against {formatCount(effectiveHp)} HP bases
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="card p-6 text-ink-dim text-center">
          Nothing matches these filters.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-ink-faint">
              <tr className="hairline">
                <SortTh column="name" label="Bomb" sort={sort} dir={dir} onSort={handleSort} />
                <SortTh column="needed" label="Per base" align="right" sort={sort} dir={dir} onSort={handleSort} />
                <SortTh column="damage" label="Damage" align="right" sort={sort} dir={dir} onSort={handleSort} />
                <SortTh
                  column="mass"
                  label="Mass"
                  align="right"
                  className="hidden sm:table-cell"
                  sort={sort}
                  dir={dir}
                  onSort={handleSort}
                />
                <SortTh
                  column="tnt"
                  label="TNT"
                  align="right"
                  className="hidden md:table-cell"
                  sort={sort}
                  dir={dir}
                  onSort={handleSort}
                />
                <SortTh
                  column="efficiency"
                  label="Dmg / kg"
                  align="right"
                  className="hidden md:table-cell"
                  sort={sort}
                  dir={dir}
                  onSort={handleSort}
                />
                <SortTh
                  column="kind"
                  label="Type"
                  className="hidden lg:table-cell"
                  sort={sort}
                  dir={dir}
                  onSort={handleSort}
                />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ bomb, needed }) => (
                <tr key={bomb.id} className="border-t border-line hover:bg-surface-2">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 font-medium">
                      {bomb.nation ? <Flag nation={bomb.nation} size={13} /> : null}
                      {bomb.chartName || bomb.fullName}
                    </div>
                    <div className="text-xs text-ink-faint truncate max-w-[22rem]">
                      {bomb.fullName}
                    </div>
                  </td>
                  <td className="nums px-3 py-2 text-right text-accent font-semibold text-base">
                    {needed ?? "—"}
                  </td>
                  <td className="nums px-3 py-2 text-right text-ink-dim">
                    {bomb.damageValue !== null ? formatCount(bomb.damageValue) : "—"}
                  </td>
                  <td className="nums px-3 py-2 text-right text-ink-dim hidden sm:table-cell">
                    {formatMass(bomb, massUnit)}
                  </td>
                  <td className="nums px-3 py-2 text-right text-ink-dim hidden md:table-cell">
                    {bomb.tntKg !== null ? `${Math.round(bomb.tntKg)} kg` : "—"}
                  </td>
                  <td className="nums px-3 py-2 text-right text-ink-dim hidden md:table-cell">
                    {bomb.efficiency ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-ink-faint hidden lg:table-cell">
                    {BOMB_KIND_LABELS[bomb.kind]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const BR_RANGE_LABELS: Record<BaseHp, string> = {
  4000: "up to 2.0",
  6000: "2.3 – 3.3",
  10000: "3.7 – 4.7",
  16000: "5.0 – 6.3",
  22000: "6.7 – 7.7",
  25900: "8.0 and up",
};

type SortableRow = { bomb: Bomb; needed: number | null };

function sortKeyOf(row: SortableRow, column: Sort): number | string | null {
  switch (column) {
    case "name":
      return row.bomb.chartName || row.bomb.fullName;
    case "needed":
      return row.needed;
    case "damage":
      return row.bomb.damageValue;
    case "mass":
      return row.bomb.massKg;
    case "tnt":
      return row.bomb.tntKg;
    case "efficiency":
      return row.bomb.efficiency;
    case "kind":
      return BOMB_KIND_LABELS[row.bomb.kind];
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
function compareRows(a: SortableRow, b: SortableRow, column: Sort, dir: SortDir): number {
  const av = sortKeyOf(a, column);
  const bv = sortKeyOf(b, column);

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
  return compareRows(a, b, "name", "asc");
}

function SortTh({
  column,
  label,
  sort,
  dir,
  onSort,
  align = "left",
  className,
}: {
  column: Sort;
  label: string;
  sort: Sort;
  dir: SortDir;
  onSort: (column: Sort) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort === column;
  return (
    <th
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("font-normal px-3 py-2", align === "right" && "text-right", className)}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "group inline-flex items-center gap-1 transition-colors hover:text-ink",
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
        "px-3 py-1.5 rounded-full text-sm border transition-colors",
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
        "flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full text-sm border transition-colors",
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
          aria-label={`${label} minimum`}
          className="w-full min-w-0 card px-2.5 py-1.5 text-sm outline-none placeholder:text-ink-faint focus:border-accent transition-colors"
        />
        <span className="text-ink-faint text-sm shrink-0">–</span>
        <input
          type="number"
          inputMode="numeric"
          value={max ?? ""}
          onChange={(e) => onMaxChange(parse(e.target.value))}
          placeholder={String(bounds.max)}
          aria-label={`${label} maximum`}
          className="w-full min-w-0 card px-2.5 py-1.5 text-sm outline-none placeholder:text-ink-faint focus:border-accent transition-colors"
        />
      </div>
    </div>
  );
}
