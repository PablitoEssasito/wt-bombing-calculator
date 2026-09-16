import type { Metadata } from "next";
import { BASE_BLEED, BASE_HP_TIERS } from "@/domain/constants";
import { meta } from "@/lib/dataset";
import { formatCount } from "@/lib/utils";

export const metadata: Metadata = {
  title: "About",
  description: "Where the data comes from and how the numbers are worked out.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-8 leading-relaxed">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">About</h1>
        <p className="text-ink-dim">
          A faster way to read a spreadsheet that already had the answers.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-accent">Where the data comes from</h2>
        <p className="text-ink-dim">
          Every loadout and every bomb figure on this site is imported from{" "}
          <a
            href={meta.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-ink underline underline-offset-4 hover:text-accent"
          >
            LEGION&apos;s Loadouts
          </a>
          {meta.sheetVersion ? `, version ${meta.sheetVersion}` : null}. The research is theirs.
          This site adds search, reacts to your battle rating and game mode, and nothing else.
        </p>
        <p className="text-ink-faint text-sm">
          Last imported {new Date(meta.generatedAt).toISOString().slice(0, 10)} —{" "}
          {meta.aircraftCount} aircraft, {meta.bombCount} bombs.
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
            Rocket damage. The source chart prices bombs only, so rockets appear in loadouts
            without a damage figure.
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
