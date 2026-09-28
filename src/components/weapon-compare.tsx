"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BombIcon } from "@/components/bomb-glyph";
import { Flag } from "@/components/flag";
import { useI18n } from "@/i18n/client";
import { withBasePath } from "@/lib/base-path";
import { urlList, useUrlState } from "@/lib/use-url-state";
import { cn } from "@/lib/utils";
import {
  MAX_COMPARED,
  figureGroups,
  type CompareData,
  type CompareRow,
  type FigureGroup,
  type FigureLine,
} from "@/lib/weapon-figures";

const nameOf = (row: Pick<CompareRow, "chartName" | "fullName">) => row.chartName || row.fullName;

/** How many search matches to offer at once. */
const MATCHES = 8;
const IDS = urlList();

type Row = { key: string; label: string; cells: (FigureLine | null)[] };

/**
 * Weapons side by side, one column each, their figures lined up row by row
 * and the best of each marked. Which weapons is the address (`?ids=`), so a
 * comparison is one link to share; the figures come from one static file,
 * fetched the first time the page opens.
 */
export function WeaponCompare({
  labels,
  words,
}: {
  /** The game's own words for the figures, in the page's language — see figureLabels. */
  labels: Record<string, string>;
  words: { groups: Record<FigureGroup, string>; fireRate: string; nuclearYield: string };
}) {
  const { m, number, fill, path } = useI18n();
  const [ids, setIds] = useUrlState("ids", IDS);
  const [data, setData] = useState<CompareData | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch(withBasePath("/armament-data.json"))
      .then((response) => response.json() as Promise<CompareData>)
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  const byId = useMemo(() => new Map((data?.rows ?? []).map((row) => [row.id, row])), [data]);
  const key = ids.join(",");
  const chosen = useMemo(
    () => key.split(",").flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])).slice(0, MAX_COMPARED),
    [key, byId],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || !data) return [];
    return data.rows
      .filter((row) => !key.split(",").includes(row.id))
      .filter((row) => `${row.chartName} ${row.fullName}`.toLowerCase().includes(needle))
      .slice(0, MATCHES);
  }, [query, data, key]);

  const label = (lang: string) => labels[lang] ?? lang;

  // Every figure any of them has, in the tooltip's own order, a blank where one lacks it.
  const table = useMemo(() => {
    if (!data || chosen.length === 0) return null;
    const figureWords = { label: (lang: string) => labels[lang] ?? lang, number, ...words };
    const perWeapon = chosen.map((row) => figureGroups(data.stats[row.id] ?? {}, figureWords));
    const groups: { key: FigureGroup; title: string; rows: Row[] }[] = [];
    for (const [column, weaponGroups] of perWeapon.entries()) {
      for (const group of weaponGroups) {
        let target = groups.find((g) => g.key === group.key);
        if (!target) {
          target = { key: group.key, title: group.title, rows: [] };
          groups.push(target);
        }
        for (const line of group.lines) {
          let row = target.rows.find((r) => r.key === line.key);
          if (!row) {
            row = { key: line.key, label: line.label, cells: chosen.map(() => null) };
            target.rows.push(row);
          }
          row.cells[column] = line;
        }
      }
    }
    const order: FigureGroup[] = ["guidance", "flight", "warhead", "blast"];
    return groups.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }, [data, chosen, labels, number, words]);

  const add = (id: string) => {
    if (chosen.length >= MAX_COMPARED) return;
    setIds([...chosen.map((row) => row.id), id]);
    setQuery("");
  };
  const remove = (id: string) => setIds(chosen.map((row) => row.id).filter((other) => other !== id));

  // The rows every weapon has, before the file's own figures.
  const overview: Row[] = chosen.length
    ? [
        {
          key: "damage",
          label: m.bombChart.columns.damage,
          cells: chosen.map((row) =>
            row.damageValue !== null && row.damageValue > 0
              ? {
                  key: "damage",
                  label: "",
                  value: `${row.damageSource === "estimate" ? "≈ " : ""}${number(row.damageValue)}`,
                  raw: row.damageValue,
                  better: "higher" as const,
                }
              : null,
          ),
        },
        {
          key: "mass",
          label: m.bombChart.columns.mass,
          cells: chosen.map((row) =>
            row.massLabel ? { key: "mass", label: "", value: row.massLabel, raw: row.massKg } : null,
          ),
        },
        {
          key: "efficiency",
          label: m.bombChart.columns.efficiency,
          cells: chosen.map((row) =>
            row.efficiency !== null
              ? { key: "efficiency", label: "", value: number(row.efficiency), raw: row.efficiency, better: "higher" as const }
              : null,
          ),
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!data || chosen.length >= MAX_COMPARED}
          placeholder={chosen.length >= MAX_COMPARED ? m.compare.full : m.compare.searchPlaceholder}
          aria-label={m.compare.add}
          className="card w-full px-3 py-2 text-base outline-none placeholder:text-ink-faint focus:border-accent transition-colors disabled:opacity-60"
        />
        {matches.length > 0 ? (
          <ul className="card absolute z-20 mt-1 w-full divide-y divide-line shadow-lg">
            {matches.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => add(row.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2"
                >
                  <BombIcon bomb={row} size={22} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-medium">
                      {row.nation ? <Flag nation={row.nation} size={12} /> : null}
                      {nameOf(row)}
                    </span>
                    <span className="block truncate text-xs text-ink-faint">{row.fullName}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {failed ? (
        <p className="card p-6 text-center text-ink-dim">{m.compare.failed}</p>
      ) : !data ? (
        <p className="card p-6 text-center text-ink-dim">{m.palette.loading}</p>
      ) : chosen.length === 0 ? (
        <p className="card p-6 text-center text-ink-dim">{m.compare.empty}</p>
      ) : (
        <div className="space-y-2">
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="hairline align-top">
                  <th className="sticky left-0 z-10 bg-surface px-3 py-2" />
                  {chosen.map((row) => (
                    <th key={row.id} className="min-w-[9rem] px-3 py-2 text-left font-normal">
                      <div className="flex items-start gap-2">
                        <BombIcon bomb={row} size={28} />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={path(`/armament/${row.id}/`)}
                            className="flex items-center gap-1.5 font-medium text-ink hover:text-accent"
                          >
                            {row.nation ? <Flag nation={row.nation} size={12} /> : null}
                            {nameOf(row)}
                          </Link>
                          <div className="text-xs text-ink-faint">
                            {row.guidance ? label(`missile/guidance/${row.guidance}`) : m.bombKinds[row.kind]}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(row.id)}
                          aria-label={fill(m.compare.remove, { name: nameOf(row) })}
                          title={fill(m.compare.remove, { name: nameOf(row) })}
                          className="shrink-0 text-ink-faint hover:text-accent"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Rows rows={overview} />
                {table?.map((group) => (
                  <GroupRows key={group.key} title={group.title} rows={group.rows} span={chosen.length + 1} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-faint">
            <span className="text-accent">■</span> {m.compare.bestHint}
            {chosen.some((row) => row.damageSource === "estimate") ? <> · ≈ {m.bombChart.estimateLegend}</> : null}
          </p>
        </div>
      )}
    </div>
  );
}

function GroupRows({ title, rows, span }: { title: string; rows: Row[]; span: number }) {
  return (
    <>
      <tr className="border-t border-line">
        <th colSpan={span} className="px-3 pb-1 pt-3 text-left text-xs font-normal uppercase tracking-wider text-ink-faint">
          {title}
        </th>
      </tr>
      <Rows rows={rows} />
    </>
  );
}

/** A figure per weapon, the best marked where more is plainly better and they differ at all. */
function Rows({ rows }: { rows: Row[] }) {
  return (
    <>
      {rows.map((row) => {
        const ranked = row.cells.flatMap((cell) => (cell?.better && cell.raw !== null ? [cell.raw] : []));
        const best = ranked.length >= 2 && Math.max(...ranked) !== Math.min(...ranked) ? Math.max(...ranked) : null;
        return (
          <tr key={row.key} className="border-t border-line/60">
            <th className="sticky left-0 z-10 min-w-[9rem] max-w-[11rem] bg-surface px-3 py-1.5 text-left font-normal text-ink-dim">
              {row.label}
            </th>
            {row.cells.map((cell, i) => (
              <td
                key={i}
                className={cn(
                  "px-3 py-1.5",
                  // Numbers stay on one line; a warhead's name wraps rather than widening every column.
                  cell?.raw != null ? "nums whitespace-nowrap" : "min-w-[8rem]",
                  cell && best !== null && cell.raw === best ? "font-semibold text-accent" : "text-ink",
                )}
              >
                {cell?.value ?? <span className="text-ink-faint">—</span>}
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}
