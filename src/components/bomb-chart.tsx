"use client";

import { Check } from "lucide-react";
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

const SORTS = ["needed", "damage", "efficiency", "mass", "name"] as const;
type Sort = (typeof SORTS)[number];

const SORT_LABELS: Record<Sort, string> = {
  needed: "Bombs per base",
  damage: "Damage",
  efficiency: "Damage per kg",
  mass: "Mass",
  name: "Name",
};

/** Every kind that can actually reach this table — rockets carry no damage value, so never do. */
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
] as const satisfies readonly BombKind[];

export function BombChart({ bombs }: { bombs: Bomb[] }) {
  const [query, setQuery] = useUrlState("q", urlText());
  const [hp, setHp] = useUrlState("hp", urlInteger(25900));
  const [mode, setMode] = useUrlState("mode", urlLiteral(GAME_MODES, "rb"));
  const [mapSize, setMapSize] = useUrlState("map", urlInteger(4));
  const [sort, setSort] = useUrlState("sort", urlLiteral(SORTS, "needed"));
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

  // Priced only — what's actually in this table — so the hint text under each
  // range input reflects what you can actually type, not the full 292 including
  // unpriced rockets.
  const bounds = useMemo(() => {
    const priced = bombs.filter((b) => b.damageValue !== null);
    const range = (values: number[]) =>
      values.length ? { min: Math.min(...values), max: Math.max(...values) } : { min: 0, max: 0 };
    return {
      mass: range(priced.flatMap((b) => (b.massKg !== null ? [Math.round(b.massKg)] : []))),
      tnt: range(priced.flatMap((b) => (b.tntKg !== null ? [Math.round(b.tntKg)] : []))),
      damage: range(priced.map((b) => b.damageValue!)),
    };
  }, [bombs]);

  const rows = useMemo(() => {
    const needle = deferred.trim().toLowerCase();
    const filtered = bombs.filter((bomb) => {
      if (bomb.damageValue === null) return false;
      if (needle && !bomb.chartName.toLowerCase().includes(needle) && !bomb.fullName.toLowerCase().includes(needle)) {
        return false;
      }
      if (nation !== "all" && bomb.nation !== nation) return false;
      if (kinds.size > 0 && !kinds.has(bomb.kind)) return false;
      if (massMin !== null && (bomb.massKg ?? -Infinity) < massMin) return false;
      if (massMax !== null && (bomb.massKg ?? Infinity) > massMax) return false;
      if (tntMin !== null && (bomb.tntKg ?? -Infinity) < tntMin) return false;
      if (tntMax !== null && (bomb.tntKg ?? Infinity) > tntMax) return false;
      if (dmgMin !== null && bomb.damageValue < dmgMin) return false;
      if (dmgMax !== null && bomb.damageValue > dmgMax) return false;
      return true;
    });

    return filtered
      .map((bomb) => ({ bomb, needed: bombsNeeded(effectiveHp, bomb.damageValue!) }))
      .sort((a, b) => {
        switch (sort) {
          case "needed":
            return a.needed - b.needed || b.bomb.damageValue! - a.bomb.damageValue!;
          case "damage":
            return b.bomb.damageValue! - a.bomb.damageValue!;
          case "efficiency":
            return (b.bomb.efficiency ?? 0) - (a.bomb.efficiency ?? 0);
          case "mass":
            return (a.bomb.massKg ?? 0) - (b.bomb.massKg ?? 0);
          default:
            return (a.bomb.chartName || a.bomb.fullName).localeCompare(
              b.bomb.chartName || b.bomb.fullName,
            );
        }
      });
  }, [bombs, deferred, effectiveHp, sort, nation, kinds, massMin, massMax, tntMin, tntMax, dmgMin, dmgMax]);

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
      <section className="card p-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
        <Segmented
          label="Sort by"
          value={sort}
          onChange={(v) => setSort(v as Sort)}
          options={SORTS.map((s) => ({ value: s, label: SORT_LABELS[s] }))}
        />
      </section>

      <section className="card p-4 space-y-4">
        <div className="space-y-1.5">
          <div className="text-xs uppercase tracking-wider text-ink-faint">Nation</div>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={nation === "all"} onClick={() => setNation("all")}>
              All nations
            </FilterChip>
            {NATIONS.map((n: Nation) => (
              <FilterChip key={n} active={nation === n} onClick={() => setNation(n)}>
                {NATION_LABELS[n]}
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter bombs…"
          aria-label="Filter bombs"
          className="card px-3 py-2 outline-none placeholder:text-ink-faint focus:border-accent transition-colors w-full sm:w-72"
        />
        <p className="nums text-sm text-ink-dim">
          {rows.length} bombs against {formatCount(effectiveHp)} HP bases
        </p>
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
                <Th className="text-left">Bomb</Th>
                <Th className="text-right">Per base</Th>
                <Th className="text-right">Damage</Th>
                <Th className="text-right hidden sm:table-cell">Mass</Th>
                <Th className="text-right hidden md:table-cell">TNT</Th>
                <Th className="text-right hidden md:table-cell">Dmg / kg</Th>
                <Th className="text-left hidden lg:table-cell">Type</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ bomb, needed }) => (
                <tr key={bomb.id} className="border-t border-line hover:bg-surface-2">
                  <td className="px-3 py-2">
                    <div className="font-medium">{bomb.chartName || bomb.fullName}</div>
                    <div className="text-xs text-ink-faint truncate max-w-[22rem]">
                      {bomb.fullName}
                    </div>
                  </td>
                  <td className="nums px-3 py-2 text-right text-accent font-semibold text-base">
                    {needed}
                  </td>
                  <td className="nums px-3 py-2 text-right text-ink-dim">
                    {formatCount(bomb.damageValue!)}
                  </td>
                  <td className="nums px-3 py-2 text-right text-ink-dim hidden sm:table-cell">
                    {bomb.massLabel || "—"}
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

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("font-normal px-3 py-2", className)}>{children}</th>;
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
