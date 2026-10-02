import type { Metadata } from "next";
import { Columns3 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BombIcon } from "@/components/bomb-glyph";
import { Flag } from "@/components/flag";
import { PageTransition } from "@/components/page-transition";
import { VehicleTypeIcon } from "@/components/vehicle-type-icon";
import { bombsNeeded, effectiveBaseHp } from "@/domain/base-hp";
import { familyOf, isNuclear } from "@/domain/bomb-chart";
import { BASE_HP_TIERS, type BaseCount, type GameMode, type Nation } from "@/domain/constants";
import type { Bomb } from "@/domain/types";
import { fill, formatNumber, plural } from "@/i18n/format";
import { localePath, type Locale } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import {
  aircraftCarrying,
  aircraftName,
  bombsById,
  filingOf,
  gameLabel,
  otherCarriersOf,
  pagedBombs,
  statsOf,
  type Carrier,
} from "@/lib/dataset";
import { RANK_LABELS } from "@/lib/labels";
import { MAX_COMPARED, figureGroups } from "@/lib/weapon-figures";
import { canonicalOf, pageOpenGraph } from "@/lib/site";

export function weaponIds(): string[] {
  return pagedBombs.map((bomb) => bomb.id);
}

const nameOf = (bomb: { chartName: string; fullName: string }) => bomb.chartName || bomb.fullName;

export function weaponMetadata(locale: Locale, id: string): Metadata {
  const bomb = bombsById.get(id);
  if (!bomb) return {};
  const m = messagesFor(locale).bombPage;
  const title = fill(m.metaTitle, { name: nameOf(bomb) });
  const description = fill(m.metaDescription, { name: nameOf(bomb) });
  return {
    title,
    description,
    ...canonicalOf(`/armament/${bomb.id}`, locale),
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

const SIMILAR = 6;

const familyOfBomb = (bomb: Bomb) => familyOf({ ...bomb, ...filingOf(bomb) });

/** The weapons most like this one: its family, nearest by damage to a base, or by mass where nothing prices it. */
function similarTo(bomb: Bomb): Bomb[] {
  const family = familyOfBomb(bomb);
  const measure = (b: Bomb) => (bomb.damageValue ? b.damageValue : b.massKg);
  const own = measure(bomb);
  if (own === null) return [];
  return pagedBombs
    .filter((b) => b.id !== bomb.id && familyOfBomb(b) === family && measure(b) !== null)
    .map((b) => ({ b, distance: Math.abs(Math.log(measure(b)! / own)) }))
    .filter(({ distance }) => Number.isFinite(distance))
    .sort((a, z) => a.distance - z.distance)
    .slice(0, SIMILAR)
    .map(({ b }) => b);
}

/**
 * One weapon: its figures as the game gives them, what it does to a base and
 * how many of it a base takes at every BR, and every aircraft that carries
 * it — the armament chart's row, opened up.
 */
export function WeaponPageView({ locale, id }: { locale: Locale; id: string }) {
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
  const others = otherCarriersOf(locale, bomb.id);

  const damage = bomb.damageValue;
  const estimated = bomb.damageSource === "estimate";
  // A nuclear bomb whose file gives no yield: its blast is not in the file, so
  // there is nothing to say per base — not that it does nothing to one.
  const perBase = damage !== null || !isNuclear(bomb);
  const figures = [
    { label: m.bombPage.stats.mass, value: bomb.massLabel || (bomb.massKg !== null ? `${Math.round(bomb.massKg)} kg` : null) },
    { label: m.bombPage.stats.tnt, value: bomb.tntKg !== null ? `${Math.round(bomb.tntKg)} kg` : null },
    {
      label: m.bombPage.stats.damage,
      value: damage !== null ? `${estimated ? "≈ " : ""}${number(damage)}` : null,
    },
    { label: m.bombPage.stats.efficiency, value: bomb.efficiency !== null ? number(bomb.efficiency) : null },
  ];
  const groups = figureGroups(statsOf(bomb.id), {
    label: (key) => gameLabel(locale, key) ?? key,
    number: (value, options) => formatNumber(locale, value, options),
    groups: m.bombPage.groups,
    fireRate: m.bombPage.fireRate,
    nuclearYield: m.bombPage.nuclearYield,
    yes: m.bombPage.yes,
  });
  const { category, tags } = filingOf(bomb);
  const similar = similarTo(bomb);

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        <header className="space-y-3">
          <Link
            href={localePath(locale, "/armament/")}
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
            {m.weaponCategory[category]}
            {" · "}
            <Link
              href={`${localePath(locale, "/armament/compare/")}?ids=${bomb.id}`}
              className="inline-flex items-center gap-1 text-accent hover:underline underline-offset-4"
            >
              <Columns3 size={13} aria-hidden /> {m.compare.compareThis}
            </Link>
          </p>
          {tags.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li key={tag} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-dim">
                  {m.weaponTags[tag]}
                </li>
              ))}
            </ul>
          ) : null}
        </header>

        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {figures.map(({ label, value }) => (
            <div key={label} className="card px-3 py-2.5">
              <dt className="text-xs uppercase tracking-wider text-ink-faint">{label}</dt>
              <dd className="nums text-lg font-semibold">{value ?? "—"}</dd>
            </div>
          ))}
        </dl>

        {perBase ? (
          <section className="space-y-3" aria-labelledby="per-base">
            <div className="space-y-1">
              <h2 id="per-base" className="text-lg font-semibold tracking-tight">
                {m.bombPage.perBase}
              </h2>
              {damage !== null && damage > 0 ? (
                <>
                  <p className="text-sm text-ink-dim">{m.bombPage.perBaseHint}</p>
                  {estimated ? <p className="text-sm text-ink-dim">≈ {m.bombPage.estimated}</p> : null}
                </>
              ) : (
                <p className="text-sm text-ink-dim">{m.bombPage.noDamage}</p>
              )}
            </div>
            {damage !== null && damage > 0 ? (
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
                            {estimated ? <span className="font-normal text-ink-faint">≈ </span> : null}
                            {bombsNeeded(effectiveBaseHp(tier, mode, bases), damage)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ) : null}

        {groups.length > 0 ? (
          <section className="space-y-3" aria-labelledby="figures">
            <div>
              <h2 id="figures" className="text-lg font-semibold tracking-tight">
                {m.bombPage.figures}
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {groups.map((group) => (
                <div key={group.key} className="card px-4 py-3">
                  <h3 className="text-xs uppercase tracking-wider text-ink-faint pb-1">{group.title}</h3>
                  <dl className="divide-y divide-line text-sm">
                    {group.lines.map(({ key, label, value }) => (
                      <div key={key} className="flex items-baseline justify-between gap-4 py-1.5">
                        <dt className="text-ink-dim">{label}</dt>
                        <dd className="nums text-right font-medium">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
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
          {carriers.length === 0 && others.length === 0 ? (
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
          {others.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-xs uppercase tracking-wider text-ink-faint">
                {m.bombPage.otherAircraft} <span className="nums opacity-60">{others.length}</span>
              </h3>
              <p className="text-sm text-ink-dim leading-relaxed">{others.join(" · ")}</p>
            </div>
          ) : null}
        </section>

        {similar.length > 0 ? (
          <section className="space-y-3" aria-labelledby="similar">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="similar" className="text-lg font-semibold tracking-tight">
                {m.bombPage.similar}
              </h2>
              <Link
                href={`${localePath(locale, "/armament/compare/")}?ids=${[bomb, ...similar]
                  .slice(0, MAX_COMPARED)
                  .map((b) => b.id)
                  .join(",")}`}
                className="inline-flex items-center gap-1 text-sm text-accent hover:underline underline-offset-4"
              >
                <Columns3 size={14} aria-hidden /> {m.compare.withSimilar}
              </Link>
            </div>
            <ul className="card grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
              {similar.map((other) => (
                <li key={other.id}>
                  <Link
                    href={localePath(locale, `/armament/${other.id}/`)}
                    transitionTypes={["nav-forward"]}
                    className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-2 transition-colors"
                  >
                    <BombIcon bomb={other} size={24} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-medium">
                        {other.nation ? <Flag nation={other.nation} size={12} /> : null}
                        <span className="truncate">{nameOf(other)}</span>
                      </span>
                      {other.chartName && other.fullName !== other.chartName ? (
                        <span className="block text-xs text-ink-faint truncate">{other.fullName}</span>
                      ) : null}
                    </span>
                    <span className="nums ml-auto shrink-0 text-sm text-ink-dim">
                      {other.damageValue !== null && other.damageValue > 0
                        ? `${other.damageSource === "estimate" ? "≈ " : ""}${number(other.damageValue)}`
                        : (other.massLabel || null)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </PageTransition>
  );
}
