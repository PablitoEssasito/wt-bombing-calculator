"use client";

import { useDeferredValue, useMemo } from "react";
import { bombsNeeded, effectiveBaseHp } from "@/domain/base-hp";
import {
  BASE_HP_TIERS,
  GAME_MODES,
  type BaseCount,
  type BaseHp,
  type GameMode,
} from "@/domain/constants";
import type { Bomb } from "@/domain/types";
import { Segmented } from "@/components/segmented";
import { BOMB_KIND_LABELS } from "@/lib/labels";
import { urlInteger, urlLiteral, urlText, useUrlState } from "@/lib/use-url-state";
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

export function BombChart({ bombs }: { bombs: Bomb[] }) {
  const [query, setQuery] = useUrlState("q", urlText());
  const [hp, setHp] = useUrlState("hp", urlInteger(25900));
  const [mode, setMode] = useUrlState("mode", urlLiteral(GAME_MODES, "rb"));
  const [mapSize, setMapSize] = useUrlState("map", urlInteger(4));
  const [sort, setSort] = useUrlState("sort", urlLiteral(SORTS, "needed"));

  const deferred = useDeferredValue(query);

  const baseHp = (BASE_HP_TIERS as readonly number[]).includes(hp) ? (hp as BaseHp) : 25900;
  const baseCount = (mapSize === 3 ? 3 : 4) as BaseCount;
  const effectiveHp = effectiveBaseHp(baseHp, mode as GameMode, baseCount);

  const rows = useMemo(() => {
    const needle = deferred.trim().toLowerCase();
    const filtered = bombs.filter(
      (bomb) =>
        bomb.damageValue !== null &&
        (!needle ||
          bomb.chartName.toLowerCase().includes(needle) ||
          bomb.fullName.toLowerCase().includes(needle)),
    );

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
  }, [bombs, deferred, effectiveHp, sort]);

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
