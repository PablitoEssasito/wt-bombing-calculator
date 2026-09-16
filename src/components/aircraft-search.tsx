"use client";

import Fuse from "fuse.js";
import Image from "next/image";
import Link from "next/link";
import { useDeferredValue, useMemo } from "react";
import { BombRow } from "@/components/bomb-glyph";
import { BrRange } from "@/components/br-range";
import { Flag } from "@/components/flag";
import { NATION_LABELS, NATIONS } from "@/domain/constants";
import { iconUrl } from "@/lib/assets";
import type { AircraftSummary, BombGlyphData } from "@/lib/dataset";
import { RANK_LABELS } from "@/lib/labels";
import { urlInteger, urlLiteral, urlText, useUrlState } from "@/lib/use-url-state";
import { cn } from "@/lib/utils";

/** Enough to scroll without asking the browser to lay out 635 tiles at once. */
const PAGE_SIZE = 60;

const VIEWS = ["tiles", "list"] as const;

export function AircraftSearch({
  index,
  nationNotes,
  brSteps,
  bombs,
}: {
  index: AircraftSummary[];
  /** The source's commentary on each nation's bombing, keyed by nation. */
  nationNotes: Record<string, string>;
  /** Every battle rating present, ascending — the slider snaps to these. */
  brSteps: number[];
  bombs: BombGlyphData[];
}) {
  const [query, setQuery] = useUrlState("q", urlText());
  const [nation, setNation] = useUrlState(
    "nation",
    urlLiteral(["all", ...NATIONS] as const, "all"),
  );
  const [view, setView] = useUrlState("view", urlLiteral(VIEWS, "tiles"));
  const [brFrom, setBrFrom] = useUrlState("brFrom", urlInteger(0));
  const [brTo, setBrTo] = useUrlState("brTo", urlInteger(brSteps.length - 1));

  const deferred = useDeferredValue(query);
  const bombsById = useMemo(() => new Map(bombs.map((b) => [b.id, b])), [bombs]);

  const from = Math.min(Math.max(brFrom, 0), brSteps.length - 1);
  const to = Math.min(Math.max(brTo, from), brSteps.length - 1);

  const fuse = useMemo(
    () => new Fuse(index, { keys: ["name"], threshold: 0.35, ignoreLocation: true }),
    [index],
  );

  const results = useMemo(() => {
    const matched = deferred.trim() ? fuse.search(deferred.trim()).map((r) => r.item) : index;
    return matched.filter(
      (a) =>
        (nation === "all" || a.nation === nation) && a.br >= brSteps[from] && a.br <= brSteps[to],
    );
  }, [deferred, fuse, index, nation, brSteps, from, to]);

  const shown = results.slice(0, PAGE_SIZE);

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
        <div className="flex flex-wrap gap-1.5">
          <Chip active={nation === "all"} onClick={() => setNation("all")}>
            <span aria-hidden>🌐</span> All nations
          </Chip>
          {NATIONS.map((n) => (
            <Chip key={n} active={nation === n} onClick={() => setNation(n)}>
              <Flag nation={n} /> {NATION_LABELS[n]}
            </Chip>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <BrRange
            steps={brSteps}
            from={from}
            to={to}
            onChange={(f, t) => {
              setBrFrom(f);
              setBrTo(t);
            }}
          />
          <div className="flex gap-1">
            {VIEWS.map((v) => (
              <Chip key={v} active={view === v} onClick={() => setView(v)}>
                {v === "tiles" ? "Tiles" : "Compact"}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {nation !== "all" && nationNotes[nation] ? (
        <aside className="card px-3 py-2.5 text-sm space-y-1">
          <p className="text-xs uppercase tracking-wider text-ink-faint">
            <Flag nation={nation} /> {NATION_LABELS[nation]} — from the source
          </p>
          <p className="text-ink-dim whitespace-pre-line leading-relaxed">{nationNotes[nation]}</p>
        </aside>
      ) : null}

      {results.length === 0 ? (
        <p className="text-ink-dim py-12 text-center">
          Nothing matches these filters. The source covers bombers, attackers and any fighter that
          can carry bombs — pure interceptors are not in it.
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
          {shown.map((plane) => (
            <li key={plane.id}>
              <Link
                href={`/aircraft/${plane.id}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 transition-colors"
              >
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
          ))}
        </ul>
      )}

      <p className="text-sm text-ink-faint">
        {results.length > PAGE_SIZE
          ? `Showing ${PAGE_SIZE} of ${results.length} — narrow it down to see the rest.`
          : `${results.length} aircraft.`}
      </p>
    </div>
  );
}

function Tile({ plane, bomb }: { plane: AircraftSummary; bomb?: BombGlyphData }) {
  return (
    <Link
      href={`/aircraft/${plane.id}`}
      className="card p-2.5 flex gap-3 hover:border-line-bright hover:bg-surface-2 transition-colors"
    >
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
          <span className="nums text-accent shrink-0">{plane.br.toFixed(1)}</span>
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
