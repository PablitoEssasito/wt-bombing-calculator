"use client";

import Link from "next/link";
import { Flag } from "@/components/flag";
import { useI18n } from "@/i18n/client";
import type { AircraftSummary } from "@/lib/dataset";
import { useFavoriteAircraft, useRecentAircraft } from "@/lib/local-list";
import { rewardKindOf } from "@/lib/reward-kind";
import { cn } from "@/lib/utils";

/**
 * Both lists live in localStorage (see local-list.ts) — nothing here until
 * this browser has favorited or viewed something, which is why the whole
 * thing renders nothing rather than an empty-state message on a first visit.
 */
export function QuickAccess({ index }: { index: AircraftSummary[] }) {
  const { m } = useI18n();
  const favoriteIds = useFavoriteAircraft();
  const recentIds = useRecentAircraft();

  const byId = new Map(index.map((plane) => [plane.id, plane]));
  const resolve = (ids: string[]) => ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const favorites = resolve(favoriteIds);
  const recent = resolve(recentIds);

  if (favorites.length === 0 && recent.length === 0) return null;

  return (
    <div className="space-y-3">
      {favorites.length > 0 ? <Row label={m.common.favorites} planes={favorites} /> : null}
      {recent.length > 0 ? <Row label={m.common.recentlyViewed} planes={recent} /> : null}
    </div>
  );
}

function Row({ label, planes }: { label: string; planes: AircraftSummary[] }) {
  const { path } = useI18n();
  return (
    <div className="space-y-1.5">
      <p className="text-xs uppercase tracking-wider text-ink-faint">{label}</p>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {planes.map((plane) => {
          const reward = rewardKindOf(plane);
          return (
            <Link
              key={plane.id}
              href={path(`/aircraft/${plane.id}/`)}
              transitionTypes={["nav-forward"]}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors whitespace-nowrap shrink-0",
                reward === "premium"
                  ? "border-premium text-premium bg-premium/10 hover:bg-premium/20"
                  : reward === "squadron"
                    ? "border-squadron text-squadron bg-squadron/10 hover:bg-squadron/20"
                    : "border-line text-ink-dim hover:text-ink hover:border-line-bright",
              )}
            >
              <Flag nation={plane.nation} size={12} />
              {plane.name}
              <span className="nums text-accent">{plane.br.toFixed(1)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
