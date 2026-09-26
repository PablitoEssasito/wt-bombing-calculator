import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BombIcon } from "@/components/bomb-glyph";
import { Flag } from "@/components/flag";
import { PageTransition } from "@/components/page-transition";
import { VehicleTypeIcon } from "@/components/vehicle-type-icon";
import { bombsNeeded, effectiveBaseHp } from "@/domain/base-hp";
import { BASE_HP_TIERS, type BaseCount, type GameMode, type Nation } from "@/domain/constants";
import { fill, formatNumber, plural } from "@/i18n/format";
import { localePath, type Locale } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { aircraftCarrying, aircraftName, bombsById, pagedBombs, type Carrier } from "@/lib/dataset";
import { RANK_LABELS } from "@/lib/labels";
import { canonicalOf, pageOpenGraph } from "@/lib/site";

export function bombIds(): string[] {
  return pagedBombs.map((bomb) => bomb.id);
}

const nameOf = (bomb: { chartName: string; fullName: string }) => bomb.chartName || bomb.fullName;

export function bombMetadata(locale: Locale, id: string): Metadata {
  const bomb = bombsById.get(id);
  if (!bomb) return {};
  const m = messagesFor(locale).bombPage;
  const title = fill(m.metaTitle, { name: nameOf(bomb) });
  const description = fill(m.metaDescription, { name: nameOf(bomb) });
  return {
    title,
    description,
    ...canonicalOf(`/bombs/${bomb.id}`, locale),
    ...pageOpenGraph(title, description, undefined, locale),
  };
}

/** Columns of the bombs-per-base table: both modes, on four- and three-base maps. */
const LAYOUTS: { mode: GameMode; bases: BaseCount }[] = [
  { mode: "rb", bases: 4 },
  { mode: "rb", bases: 3 },
  { mode: "ab", bases: 4 },
  { mode: "ab", bases: 3 },
];

/**
 * One bomb: its figures, how many of it a base takes at every BR, and every
 * aircraft that can carry it — the bomb chart's row, opened up.
 */
export function BombPageView({ locale, id }: { locale: Locale; id: string }) {
  const bomb = bombsById.get(id);
  if (!bomb || !pagedBombs.includes(bomb)) notFound();
  const m = messagesFor(locale);
  const number = (value: number) => formatNumber(locale, value);

  const carriers = aircraftCarrying(bomb.id);
  const byNation = new Map<Nation, Carrier[]>();
  for (const carrier of carriers) {
    const group = byNation.get(carrier.plane.nation) ?? [];
    group.push(carrier);
    byNation.set(carrier.plane.nation, group);
  }

  const figures = [
    { label: m.bombPage.stats.mass, value: bomb.massLabel || (bomb.massKg !== null ? `${Math.round(bomb.massKg)} kg` : null) },
    { label: m.bombPage.stats.tnt, value: bomb.tntKg !== null ? `${Math.round(bomb.tntKg)} kg` : null },
    { label: m.bombPage.stats.damage, value: bomb.damageValue !== null ? number(bomb.damageValue) : null },
    { label: m.bombPage.stats.efficiency, value: bomb.efficiency !== null ? number(bomb.efficiency) : null },
  ];
  const damage = bomb.damageValue;

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        <header className="space-y-3">
          <Link
            href={localePath(locale, "/bombs/")}
            transitionTypes={["nav-back"]}
            className="text-sm text-ink-faint hover:text-accent transition-colors inline-block"
          >
            {m.bombPage.back}
          </Link>
          <div className="flex items-center gap-3">
            <BombIcon bomb={bomb} size={44} />
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold tracking-tight">{nameOf(bomb)}</h1>
              {bomb.chartName && bomb.fullName !== bomb.chartName ? (
                <p className="text-sm text-ink-dim">{bomb.fullName}</p>
              ) : null}
            </div>
          </div>
          <p className="flex items-center gap-1.5 text-sm text-ink-dim">
            {bomb.nation ? (
              <>
                <Flag nation={bomb.nation} size={13} /> {m.nations[bomb.nation]} ·
              </>
            ) : null}{" "}
            {m.bombKinds[bomb.kind]}
          </p>
        </header>

        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {figures.map(({ label, value }) => (
            <div key={label} className="card px-3 py-2.5">
              <dt className="text-xs uppercase tracking-wider text-ink-faint">{label}</dt>
              <dd className="nums text-lg font-semibold">{value ?? "—"}</dd>
            </div>
          ))}
        </dl>

        {damage !== null && damage > 0 ? (
          <section className="space-y-3" aria-labelledby="per-base">
            <div>
              <h2 id="per-base" className="text-lg font-semibold tracking-tight">
                {m.bombPage.perBase}
              </h2>
              <p className="text-sm text-ink-dim">{m.bombPage.perBaseHint}</p>
            </div>
            <div className="card overflow-x-auto max-w-2xl">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="text-ink-faint">
                  <tr>
                    <th rowSpan={2} className="px-2 sm:px-3 py-2 text-left font-normal align-bottom">
                      {m.conditions.matchBr}
                    </th>
                    <th colSpan={2} className="px-2 sm:px-3 pt-2 text-center font-normal whitespace-normal">
                      {m.conditions.realistic}
                    </th>
                    <th colSpan={2} className="px-2 sm:px-3 pt-2 text-center font-normal whitespace-normal">
                      {m.conditions.arcade}
                    </th>
                  </tr>
                  <tr>
                    {LAYOUTS.map(({ mode, bases }) => (
                      <th key={`${mode}-${bases}`} className="px-2 sm:px-3 pb-2 text-right font-normal text-xs">
                        {bases === 4 ? m.bombPage.fourBases : m.bombPage.threeBases}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {BASE_HP_TIERS.map((tier) => (
                    <tr key={tier} className="border-t border-line">
                      <td className="nums px-2 sm:px-3 py-2 text-ink-dim">{m.conditions.brRanges[tier]}</td>
                      {LAYOUTS.map(({ mode, bases }) => (
                        <td
                          key={`${mode}-${bases}`}
                          className="nums px-2 sm:px-3 py-2 text-right text-accent font-semibold text-base"
                        >
                          {bombsNeeded(effectiveBaseHp(tier, mode, bases), damage)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="space-y-4" aria-labelledby="carriers">
          <h2 id="carriers" className="text-lg font-semibold tracking-tight">
            {m.bombPage.aircraft}
            {carriers.length > 0 ? (
              <span className="nums text-sm font-normal text-ink-faint">
                {" "}
                {plural(locale, m.stats.aircraft, carriers.length)}
              </span>
            ) : null}
          </h2>
          {carriers.length === 0 ? (
            <p className="card p-6 text-center text-ink-dim">{m.bombPage.noAircraft}</p>
          ) : (
            [...byNation].map(([nation, planes]) => (
              <div key={nation} className="space-y-2">
                <h3 className="flex items-center gap-2 text-xs uppercase tracking-wider text-ink-faint">
                  <Flag nation={nation} size={12} /> {m.nations[nation]}
                  <span className="nums opacity-60">{planes.length}</span>
                </h3>
                <ul className="card grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
                  {planes.map(({ plane, inSheet }) => (
                    <li key={plane.id}>
                      <Link
                        href={localePath(locale, `/aircraft/${plane.id}/`)}
                        transitionTypes={["nav-forward"]}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-surface-2 transition-colors"
                      >
                        {plane.vehicleType ? <VehicleTypeIcon type={plane.vehicleType} size={14} /> : null}
                        <span className="font-medium truncate">{aircraftName(locale, plane)}</span>
                        <span className="nums text-sm text-accent shrink-0">
                          {(plane.brs["air-rb"] ?? plane.br).toFixed(1)}
                        </span>
                        <span className="ml-auto flex items-center gap-2 shrink-0 text-xs text-ink-faint">
                          {inSheet ? (
                            <span
                              title={m.bombPage.inSheetTitle}
                              className="rounded-full border border-accent/40 bg-accent-dim px-1.5 py-0.5 text-accent"
                            >
                              {m.bombPage.inSheet}
                            </span>
                          ) : null}
                          {RANK_LABELS[plane.rank]}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>
    </PageTransition>
  );
}
