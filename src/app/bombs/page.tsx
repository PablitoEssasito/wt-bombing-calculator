import type { Metadata } from "next";
import { BombChart } from "@/components/bomb-chart";
import { bombs } from "@/lib/dataset";
import { canonicalOf, pageOpenGraph } from "@/lib/site";

const TITLE = "Bomb chart";
const DESCRIPTION =
  "Every bomb in War Thunder with its damage against bases, and how many it takes to flatten one at any battle rating.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...canonicalOf("/bombs"),
  ...pageOpenGraph(TITLE, DESCRIPTION),
};

export default function BombsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Bomb chart</h1>
        <p className="text-ink-dim max-w-2xl text-pretty">
          What one bomb does to a base, and how many of them a base takes. Set the conditions and
          the whole table answers at once. Damage here is base damage, not TNT equivalent — the
          two do not track each other, which is why both get their own column here instead of one
          standing in for the other.
        </p>
      </header>

      <BombChart bombs={bombs} />
    </div>
  );
}
