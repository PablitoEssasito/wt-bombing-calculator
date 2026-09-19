import { AircraftSearch } from "@/components/aircraft-search";
import { BR_STEPS, RANK_STEPS, aircraftIndex, bombGlyphData, meta } from "@/lib/dataset";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14 space-y-10">
      <header className="space-y-3">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-balance">
          How many bombs do you actually need?
        </h1>
        <p className="text-ink-dim max-w-2xl text-pretty">
          Pick your aircraft and get the drop schedule: what to put on each base, how many bases
          it flattens, and which loadout earns the most while still doing the job. Covers{" "}
          {meta.aircraftCount} aircraft and {meta.bombCount} bombs.
        </p>
      </header>

      <AircraftSearch
        index={aircraftIndex}
        brSteps={BR_STEPS}
        rankSteps={RANK_STEPS}
        bombs={bombGlyphData}
      />

      <section className="grid gap-4 sm:grid-cols-3 text-sm">
        <Fact title="Small bombs hit harder">
          A pile of light bombs does far more to a base than one heavy one. Four 500 lb bombs
          beat a single 3000 kg, despite carrying less explosive.
        </Fact>
        <Fact title="Bases scale with BR">
          Base health steps up through six tiers, from 4 000 at the bottom to 25 900 at the top,
          so an uptier changes what you should carry.
        </Fact>
        <Fact title="Travel light">
          The reward multiplier drops as the payload grows. Taking more bombs than the bases need
          costs you research for nothing.
        </Fact>
      </section>
    </div>
  );
}

function Fact({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4 space-y-1.5">
      <h2 className="font-medium text-accent">{title}</h2>
      <p className="text-ink-dim leading-relaxed">{children}</p>
    </div>
  );
}
