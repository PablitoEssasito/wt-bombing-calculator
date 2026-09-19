import type { Metadata } from "next";
import { Coffee } from "lucide-react";
import { BASE_BLEED, BASE_HP_TIERS } from "@/domain/constants";
import { meta } from "@/lib/dataset";
import { canonicalOf, KOFI_URL, pageOpenGraph } from "@/lib/site";
import { formatCount } from "@/lib/utils";

const TITLE = "About";
const DESCRIPTION = "What the calculator does, and how the numbers are worked out.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...canonicalOf("/about"),
  ...pageOpenGraph(TITLE, DESCRIPTION),
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-8 leading-relaxed">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">About</h1>
        <p className="text-ink-dim">
          What to load, per aircraft, per base — worked out for the battle rating and game mode
          you&apos;re actually in.
        </p>
      </header>

      <a
        href={KOFI_URL}
        target="_blank"
        rel="noreferrer"
        className="card flex items-center gap-3 px-4 py-3.5 border-accent/30 hover:border-accent/60 hover:bg-accent-dim transition-colors"
      >
        <Coffee className="text-accent shrink-0" size={22} />
        <div className="min-w-0">
          <p className="font-medium">Buy me a coffee</p>
          <p className="text-sm text-ink-dim">
            Free, no ads — if it saved you a trip to the spreadsheet, a coffee is always
            appreciated.
          </p>
        </div>
      </a>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-accent">What&apos;s here</h2>
        <ul className="text-ink-dim space-y-2 list-disc pl-5">
          <li>
            Search across {meta.aircraftCount} aircraft, filterable by nation and battle rating,
            with a per-aircraft drop schedule that recalculates as you change BR, game mode, or
            base count.
          </li>
          <li>
            Every loadout note sorted into what it actually means — recommended, worth knowing,
            heads up, or advised against — instead of a bare marker you have to hover to read.
          </li>
          <li>
            A loadout creator modelled on the game&apos;s own weapon menu: pylon by pylon, with
            mass limits and mutual exclusions enforced and unmet dependencies flagged, built from
            the game&apos;s own data files rather than guessed from the loadouts alone.
          </li>
          <li>
            A sortable bomb chart with a standalone calculator for any bomb against any base
            health — rockets included, priced by hand against the game&apos;s own hangar figures
            rather than left blank.
          </li>
          <li>
            Premium and squadron aircraft picked out the way the game itself does — gold and
            green — so a search result does not need a click to tell which is which.
          </li>
          <li>Every control lives in the URL, so a specific setup is one link to share.</li>
        </ul>
        <p className="text-ink-faint text-sm">
          Loadouts and bomb figures started from{" "}
          <a
            href={meta.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-accent"
          >
            LEGION&apos;s Loadouts
          </a>
          {meta.sheetVersion ? ` (v${meta.sheetVersion})` : null}, last pulled{" "}
          {new Date(meta.generatedAt).toISOString().slice(0, 10)}.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-accent">How the numbers work</h2>
        <p className="text-ink-dim">
          A base burns down on its own once most of its health is gone, so you only have to
          deliver a fraction of it — {BASE_BLEED} of the total. The count for a single bomb type
          is therefore:
        </p>
        <pre className="card px-4 py-3 text-sm overflow-x-auto text-ink-dim">
          <code>bombs = ceil(base health × {BASE_BLEED} ÷ bomb damage)</code>
        </pre>
        <p className="text-ink-dim">
          Base health depends on the battle rating of the match, not of your aircraft, stepping
          through {BASE_HP_TIERS.length} tiers from {formatCount(BASE_HP_TIERS[0])} to{" "}
          {formatCount(BASE_HP_TIERS[BASE_HP_TIERS.length - 1])}. Arcade bases carry double
          health; three-base maps take about half the payload.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-accent">What it cannot tell you</h2>
        <ul className="text-ink-dim space-y-2 list-disc pl-5">
          <li>
            Which loadouts the game actually offers. The drop schedules account for that because
            they were written by hand; the recalculated ones assume you can take any mix.
          </li>
          <li>
            The per-wing and balance limits the game states alongside the overall mass one.
            Nothing in the flight model says which wing a hardpoint sits on, and guessing would
            block loadouts that are perfectly legal — so the loadout creator checks the total
            only.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-accent">Aircraft renders</h2>
        <p className="text-ink-dim">
          The pictures are the game&apos;s own encyclopedia renders, the same ones the War
          Thunder wiki uses. They are Gaijin&apos;s artwork, shown here to make the aircraft
          easier to recognise.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-accent">Legal</h2>
        <p className="text-ink-faint text-sm">
          Not affiliated with, endorsed by, or connected to Gaijin Entertainment. War Thunder and
          all related marks are property of their respective owners.
        </p>
      </section>
    </div>
  );
}
