import type { Metadata } from "next";
import Link from "next/link";
import { BombIcon } from "@/components/bomb-glyph";
import { Flag } from "@/components/flag";
import type { ChangelogEntry } from "@/domain/types";
import { changelog } from "@/lib/dataset";
import { canonicalOf, pageOpenGraph } from "@/lib/site";
import { formatCount } from "@/lib/utils";

const TITLE = "Changelog";
const DESCRIPTION = "What each data update changed: new aircraft and bombs, BR moves, and bomb values.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...canonicalOf("/changelog"),
  ...pageOpenGraph(TITLE, DESCRIPTION),
};

/** Past this many, an aircraft list folds away behind its count. */
const FOLD_AFTER = 12;

const FIELD_LABELS = { damageValue: "Damage", tntKg: "TNT", massKg: "Mass" } as const;

type AircraftRef = ChangelogEntry["aircraft"]["added"][number];
type BombChange = ChangelogEntry["bombs"]["changed"][number];

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-8 leading-relaxed">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Changelog</h1>
      </header>

      {changelog.length === 0 ? (
        <p className="text-ink-dim">Nothing yet — the first entry lands with the next update.</p>
      ) : (
        changelog.map((entry) => <Entry key={entry.date} entry={entry} />)
      )}
    </div>
  );
}

function Entry({ entry }: { entry: ChangelogEntry }) {
  const { aircraft, bombs } = entry;
  const date = new Date(entry.date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <section className="card p-4 sm:p-5 space-y-5">
      <h2 className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold">
        {entry.gameVersion ? <span className="nums">Patch {entry.gameVersion}</span> : null}
        <span className="nums text-sm font-normal text-ink-faint">{date}</span>
      </h2>

      {bombs.changed.length > 0 ? (
        <Group title="Bomb values changed" count={bombs.changed.length}>
          <ul className="space-y-2">
            {bombs.changed.map((bomb) => (
              <li key={bomb.id} className="flex items-center gap-2.5">
                <BombIcon bomb={{ id: bomb.id, chartName: "", fullName: bomb.name }} size={24} />
                <div className="min-w-0">
                  <p className="text-ink">{bomb.name}</p>
                  <p className="nums text-sm text-ink-dim">{describeChange(bomb)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Group>
      ) : null}

      {bombs.added.length > 0 ? (
        <Group title="New bombs & rockets" count={bombs.added.length}>
          <ul className="space-y-1.5">
            {bombs.added.map((bomb) => (
              <li key={bomb.id} className="flex items-center gap-2.5 text-ink">
                <BombIcon bomb={{ id: bomb.id, chartName: "", fullName: bomb.name }} size={24} />
                {bomb.name}
              </li>
            ))}
          </ul>
        </Group>
      ) : null}

      {bombs.removed.length > 0 ? (
        <Group title="Bombs removed" count={bombs.removed.length}>
          <p className="text-ink-dim">{bombs.removed.map((b) => b.name).join(", ")}</p>
        </Group>
      ) : null}

      {aircraft.added.length > 0 ? (
        <Group title="New aircraft" count={aircraft.added.length}>
          <AircraftList planes={aircraft.added} />
        </Group>
      ) : null}

      {aircraft.br.length > 0 ? (
        <Group title="BR changes" count={aircraft.br.length}>
          <ul className="space-y-1">
            {aircraft.br.map((plane) => (
              <li key={plane.id} className="flex items-center gap-2">
                <AircraftLink plane={plane} />
                <span className="nums text-sm text-ink-dim">
                  {plane.from.toFixed(1)} → {plane.to.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        </Group>
      ) : null}

      {aircraft.loadouts.length > 0 ? (
        <Group title="Loadouts updated" count={aircraft.loadouts.length}>
          <AircraftList planes={aircraft.loadouts} />
        </Group>
      ) : null}

      {aircraft.removed.length > 0 ? (
        <Group title="Aircraft removed" count={aircraft.removed.length}>
          <p className="text-ink-dim">{aircraft.removed.map((a) => a.name).join(", ")}</p>
        </Group>
      ) : null}
    </section>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs uppercase tracking-wider text-accent">
        {title} <span className="nums text-ink-faint">{count}</span>
      </h3>
      {children}
    </div>
  );
}

/** Long lists — a whole nation's loadouts rewritten at once — fold behind their count. */
function AircraftList({ planes }: { planes: AircraftRef[] }) {
  const list = (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {planes.map((plane) => (
        <li key={plane.id}>
          <AircraftLink plane={plane} />
        </li>
      ))}
    </ul>
  );
  if (planes.length <= FOLD_AFTER) return list;
  return (
    <details>
      <summary className="cursor-pointer text-sm text-ink-dim hover:text-accent">
        Show all {planes.length}
      </summary>
      <div className="pt-2">{list}</div>
    </details>
  );
}

function AircraftLink({ plane }: { plane: AircraftRef }) {
  return (
    <Link
      href={`/aircraft/${plane.id}`}
      className="inline-flex items-center gap-1.5 text-ink hover:text-accent underline-offset-4 hover:underline"
    >
      <Flag nation={plane.nation} size={13} />
      {plane.name}
    </Link>
  );
}

function describeChange(bomb: BombChange): string {
  return bomb.fields
    .map(({ field, from, to }) => {
      const unit = field === "damageValue" ? "" : " kg";
      const show = (v: number | null) => (v === null ? "—" : formatCount(Math.round(v)));
      return `${FIELD_LABELS[field]} ${show(from)} → ${show(to)}${unit}`;
    })
    .join(" · ");
}
