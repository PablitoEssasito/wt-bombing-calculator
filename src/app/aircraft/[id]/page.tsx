import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AircraftView } from "@/components/aircraft-view";
import { Flag } from "@/components/flag";
import { CATEGORY_LABELS, NATION_LABELS } from "@/domain/constants";
import {
  aircraft,
  aircraftById,
  armamentFor,
  bombsById,
  carriesPartialLoad,
  imagesByAircraft,
  meta,
  renderUrl,
} from "@/lib/dataset";
import { RANK_LABELS } from "@/lib/labels";
import { canonicalOf, pageOpenGraph } from "@/lib/site";

export function generateStaticParams() {
  return aircraft.map((plane) => ({ id: plane.id }));
}

export async function generateMetadata({ params }: PageProps<"/aircraft/[id]">): Promise<Metadata> {
  const { id } = await params;
  const plane = aircraftById.get(id);
  if (!plane) return {};

  const title = `${plane.name} bomb loadout`;
  const description =
    `How many bombs to take on the ${plane.name} (${NATION_LABELS[plane.nation]}, BR ` +
    `${plane.br.toFixed(1)}) in War Thunder, and what to drop on each base.`;

  const imageId = imagesByAircraft[plane.id];
  const image = imageId
    ? { url: renderUrl(imageId), width: 512, height: 256, alt: `${plane.name} in War Thunder` }
    : undefined;

  return {
    title,
    description,
    ...canonicalOf(`/aircraft/${plane.id}`),
    ...pageOpenGraph(title, description, image),
  };
}

export default async function AircraftPage({ params }: PageProps<"/aircraft/[id]">) {
  const { id } = await params;
  const plane = aircraftById.get(id);
  if (!plane) notFound();

  const imageId = imagesByAircraft[plane.id] ?? null;
  const armament = armamentFor(plane.id);

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
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
      <header className="space-y-3">
        <Link
          href="/"
          className="text-sm text-ink-faint hover:text-accent transition-colors inline-block"
        >
          ← All aircraft
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight">
            <Flag nation={plane.nation} size={26} />
            {plane.name}
          </h1>
          <span className="nums text-2xl text-accent">{plane.br.toFixed(1)}</span>
        </div>
        <p className="text-sm text-ink-dim">
          {NATION_LABELS[plane.nation]} · Rank {RANK_LABELS[plane.rank]} ·{" "}
          {CATEGORY_LABELS[plane.category]}
        </p>
      </header>

      {imageId ? (
        <Image
          src={renderUrl(imageId)}
          alt={`${plane.name} in War Thunder`}
          width={512}
          height={256}
          priority
          className="w-full max-w-md h-auto -my-2"
        />
      ) : null}

      {plane.options.length === 0 ? (
        <p className="text-ink-dim">
          No bombing loadout is listed for this aircraft.
        </p>
      ) : (
        <AircraftView
          plane={plane}
          bombs={bombs}
          sourceUrl={meta.sourceUrl}
          splittable={carriesPartialLoad(plane.id)}
          armament={armament}
        />
      )}
    </div>
  );
}
