import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ViewTransition } from "react";
import { AircraftView } from "@/components/aircraft-view";
import { FavoriteToggle } from "@/components/favorite-toggle";
import { Flag } from "@/components/flag";
import { PageTransition } from "@/components/page-transition";
import { RecordRecentlyViewed } from "@/components/record-recently-viewed";
import rewardConstantsData from "@/data/reward-constants.json";
import { rewardLines, type RewardConstants } from "@/domain/reward";
import { fill, formatNumber } from "@/i18n/format";
import { localePath, type Locale } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import {
  aircraft,
  aircraftById,
  aircraftName,
  armamentFor,
  bombIconsFor,
  bombsById,
  carriesPartialLoad,
  economyFor,
  imagesByAircraft,
  meta,
  renderUrl,
  weaponNamesFor,
} from "@/lib/dataset";
import { withBasePath } from "@/lib/base-path";
import { RANK_LABELS } from "@/lib/labels";
import { canonicalOf, pageOpenGraph } from "@/lib/site";

export function aircraftIds(): string[] {
  return aircraft.map((plane) => plane.id);
}

export function aircraftMetadata(locale: Locale, id: string): Metadata {
  const plane = aircraftById.get(id);
  if (!plane) return {};
  const m = messagesFor(locale);
  const name = aircraftName(locale, plane);

  const title = fill(m.aircraftPage.metaTitle, { name });
  const description = fill(m.aircraftPage.metaDescription, {
    name,
    nation: m.nations[plane.nation],
    br: plane.br.toFixed(1),
  });

  const imageId = imagesByAircraft[plane.id];
  const image = imageId
    ? { url: renderUrl(imageId), width: 512, height: 256, alt: fill(m.aircraftPage.renderAlt, { name }) }
    : undefined;

  return {
    title,
    description,
    ...canonicalOf(`/aircraft/${plane.id}`, locale),
    ...pageOpenGraph(title, description, image, locale),
  };
}

export function AircraftPageView({ locale, id }: { locale: Locale; id: string }) {
  const plane = aircraftById.get(id);
  if (!plane) notFound();
  const m = messagesFor(locale);
  const name = aircraftName(locale, plane);

  const imageId = imagesByAircraft[plane.id] ?? null;
  const armament = armamentFor(plane.id);
  const economy = economyFor(plane.id);
  // As the game's aircraft card shows them for Air RB, before anything the
  // player brings: "SL ×3.1 ×2.0 · RP ×2.32".
  const multipliers = economy
    ? rewardLines(
        economy,
        1,
        { premiumAccount: false, talisman: false, boostersSl: [], boostersRp: [] },
        rewardConstantsData as RewardConstants,
      )
    : null;

  // Ship only the bombs this aircraft can actually carry, not all 292 of them —
  // from the sheet's own schedules, and from every hardpoint the creator offers.
  const referenced = new Set(
    plane.options.flatMap((option) =>
      option.schedules.flatMap((schedule) =>
        schedule.bases.flatMap((base) => base.items.map((item) => item.bombId)),
      ),
    ),
  );
  for (const hardpoint of armament?.hardpoints ?? []) {
    for (const option of hardpoint.options) {
      for (const { store } of option.stores) {
        if (store.bomb) referenced.add(store.bomb.id);
      }
    }
  }
  const bombs = [...referenced].flatMap((bombId) => {
    const bomb = bombsById.get(bombId);
    return bomb ? [bomb] : [];
  });

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        <header className="space-y-3">
          <Link
            href={localePath(locale, "/")}
            transitionTypes={["nav-back"]}
            className="text-sm text-ink-faint hover:text-accent transition-colors inline-block"
          >
            {m.aircraftPage.back}
          </Link>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight">
              <Flag nation={plane.nation} size={26} />
              {name}
            </h1>
            <span className="nums text-2xl text-accent">{plane.br.toFixed(1)}</span>
            <FavoriteToggle id={plane.id} />
          </div>
          <RecordRecentlyViewed id={plane.id} />
          <p className="text-sm text-ink-dim">
            {m.nations[plane.nation]} · {fill(m.common.rank, { rank: RANK_LABELS[plane.rank] })} ·{" "}
            {m.categories[plane.category]}
          </p>
          {multipliers ? (
            <p className="nums text-sm text-ink-dim">
              {fill(m.rewards.multipliers, { mode: m.search.modes["air-rb"] })}:{" "}
              <span className="text-ink">
                {m.rewards.sl} ×{formatNumber(locale, multipliers.sl.multiplier)}
                {multipliers.sl.special !== 1 ? (
                  <span className="text-premium">
                    {" "}
                    ×{formatNumber(locale, multipliers.sl.special, { minimumFractionDigits: 1 })}
                  </span>
                ) : null}
              </span>
              {" · "}
              <span className="text-ink">
                {m.rewards.rp} ×{formatNumber(locale, multipliers.rp.multiplier)}
              </span>
            </p>
          ) : null}
        </header>

        {imageId ? (
          // Paired with the tile's icon on the list, so one grows into the other.
          <ViewTransition name={`aircraft-${plane.id}`} share="morph" default="none">
            <Image
              src={withBasePath(renderUrl(imageId))}
              alt={fill(m.aircraftPage.renderAlt, { name })}
              width={512}
              height={256}
              priority
              className="w-full max-w-md h-auto -my-2"
            />
          </ViewTransition>
        ) : null}

        {plane.options.length === 0 ? (
          <p className="text-ink-dim">{m.aircraftPage.noLoadout}</p>
        ) : (
          <AircraftView
            plane={plane}
            displayName={name}
            bombs={bombs}
            sourceUrl={meta.sourceUrl}
            splittable={carriesPartialLoad(plane.id)}
            armament={armament}
            bombIcons={bombIconsFor(plane.id)}
            weaponNames={weaponNamesFor(locale, armament)}
            economy={economy}
          />
        )}
      </div>
    </PageTransition>
  );
}
