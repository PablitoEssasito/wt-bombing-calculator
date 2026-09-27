import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BombIcon } from "@/components/bomb-glyph";
import { Flag } from "@/components/flag";
import { PageTransition } from "@/components/page-transition";
import { VehicleTypeIcon } from "@/components/vehicle-type-icon";
import { bombsNeeded, effectiveBaseHp } from "@/domain/base-hp";
import { BASE_HP_TIERS, type BaseCount, type GameMode, type Nation } from "@/domain/constants";
import type { Bomb, BombKind, WeaponStats } from "@/domain/types";
import { fill, formatNumber, plural } from "@/i18n/format";
import { localePath, type Locale } from "@/i18n/locales";
import { messagesFor, type Messages } from "@/i18n/messages";
import {
  aircraftCarrying,
  aircraftName,
  bombsById,
  gameLabel,
  otherCarriersOf,
  pagedBombs,
  statsOf,
  type Carrier,
} from "@/lib/dataset";
import { RANK_LABELS } from "@/lib/labels";
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

/** Which kinds count as alike for "similar weapons": a guided bomb beside missiles, not beside iron bombs. */
const FAMILIES: BombKind[][] = [
  ["GP", "AP", "DRAG", "INC", "MINE"],
  ["GNSS", "LAS", "TV", "IR", "RC", "AGM"],
  ["ROCKET"],
  ["AAM"],
  ["TORPEDO"],
  ["GUN"],
];
const SIMILAR = 6;

/** The weapons most like this one: its family, nearest by damage to a base, or by mass where nothing prices it. */
function similarTo(bomb: Bomb): Bomb[] {
  const family = FAMILIES.find((kinds) => kinds.includes(bomb.kind)) ?? [bomb.kind];
  const measure = (b: Bomb) => (bomb.damageValue ? b.damageValue : b.massKg);
  const own = measure(bomb);
  if (own === null) return [];
  return pagedBombs
    .filter((b) => b.id !== bomb.id && family.includes(b.kind) && measure(b) !== null)
    .map((b) => ({ b, distance: Math.abs(Math.log(measure(b)! / own)) }))
    .filter(({ distance }) => Number.isFinite(distance))
    .sort((a, z) => a.distance - z.distance)
    .slice(0, SIMILAR)
    .map(({ b }) => b);
}

type StatLine = { label: string; value: string };

/**
 * The weapon's figures in the groups, words and units the game's own weapon
 * tooltip uses (`weaponryinfo.nut`), so the page reads like the hangar does.
 */
function statGroups(stats: WeaponStats, locale: Locale, m: Messages): { title: string; lines: StatLine[] }[] {
  const label = (key: string) => gameLabel(locale, key) ?? key;
  const n = (value: number, digits = 0) => formatNumber(locale, value, { maximumFractionDigits: digits });
  const distance = (meters: number) => (meters >= 1000 ? `${n(meters / 1000, 1)} km` : `${n(meters, 1)} m`);
  const line = (key: string, value: string | undefined): StatLine[] => (value ? [{ label: label(key), value }] : []);
  const some = <T,>(value: T | undefined, show: (v: T) => string) => (value !== undefined ? show(value) : undefined);
  const guided = Boolean(stats.guidance ?? stats.aiming);

  return [
    {
      title: m.bombPage.groups.guidance,
      lines: [
        ...line("missile/guidance", some(stats.guidance, (key) => label(`missile/guidance/${key}`))),
        ...line("missile/guidance", some(stats.aiming, (key) => label(`missile/aiming/${key}`))),
        ...line(
          "missile/aspect",
          some(stats.allAspect, (all) => label(all ? "missile/aspect/allAspect" : "missile/aspect/rearAspect")),
        ),
        ...line("missile/seekerRange", some(stats.seekerRangeM, distance)),
        ...line("missile/seekerRange/rearAspect", some(stats.seekerRangeRearM, distance)),
        ...line("missile/seekerRange/allAspect", some(stats.seekerRangeAllM, distance)),
        ...line("missile/launchRange", some(stats.launchRangeM, distance)),
        ...line("guaranteedRange", some(stats.guaranteedRangeM, distance)),
        ...line("firingRange", some(stats.operatedDistM, distance)),
        ...line(guided ? "missile/timeGuidance" : "missile/timeSelfdestruction", some(stats.timeLifeS, (s) => `${n(s, 1)} s`)),
      ],
    },
    {
      title: m.bombPage.groups.flight,
      lines: [
        ...line(
          "rocket/maxSpeed",
          stats.machMax !== undefined
            ? `${formatNumber(locale, stats.machMax, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`
            : some(stats.maxSpeedMs, (v) => `${n(v)} m/s`),
        ),
        ...line("missile/loadFactorMax", some(stats.loadFactorMax, (g) => `${n(g)} G`)),
        ...line("torpedo/maxSpeedInWater", some(stats.speedInWaterMs, (v) => `${n(v * 3.6)} km/h`)),
        ...line("torpedo/distanceToLive", some(stats.distToLiveM, distance)),
        ...line("bullet_properties/diveDepth", some(stats.diveDepthM, (v) => `${n(v, 1)} m`)),
        ...line(
          "weapons/drop_speed_range_text",
          some(stats.dropSpeedRange, ([min, max]) => `${n(min * 3.6)}–${n(max * 3.6)} km/h`),
        ),
        ...line("weapons/drop_height_range_text", some(stats.dropHeightRange, ([min, max]) => `${n(min)}–${n(max)} m`)),
        ...line(
          stats.speedInWaterMs !== undefined ? "torpedo/armingDistance" : "missile/armingDistance",
          some(stats.armDistanceM, (v) => `${n(v)} m`),
        ),
        ...line("bullet_properties/proximityFuze/triggerRadius", some(stats.proximityFuseM, (v) => `${n(v, 1)} m`)),
      ],
    },
    {
      title: m.bombPage.groups.warhead,
      lines: [
        ...line("bullet_properties/caliber", some(stats.caliberMm, (v) => `${n(v, 1)} mm`)),
        ...(stats.fireRate !== undefined ? [{ label: m.bombPage.fireRate, value: `${n(stats.fireRate)}` }] : []),
        ...line("rocket/warhead", some(stats.warhead, (key) => label(`rocket/warhead/${key}`))),
        ...line("bullet_properties/explosiveType", some(stats.explosiveType, (key) => label(`explosiveType/${key}`))),
        ...line("bullet_properties/explosiveMass", some(stats.explosiveMassKg, (v) => `${n(v, 2)} kg`)),
        ...line("bullet_properties/explosiveMassInTNTEquivalent", some(stats.tntKg, (v) => `${n(v, 2)} kg`)),
        ...line("bullet_properties/armorPiercing", some(stats.penetrationMm, (v) => `${n(v)} mm`)),
        ...(stats.nuclearYieldKt !== undefined
          ? [{ label: m.bombPage.nuclearYield, value: `${n(stats.nuclearYieldKt)} kt` }]
          : []),
      ],
    },
    {
      title: m.bombPage.groups.blast,
      lines: [
        ...line("bombProperties/maxArmorPenetration", some(stats.blastPenetrationMm, (v) => `${n(v)} mm`)),
        ...line("bombProperties/destroyRadiusArmored", some(stats.destroyRadiusArmoredM, (v) => `${n(v, 1)} m`)),
        ...line("bombProperties/destroyRadiusNotArmored", some(stats.destroyRadiusUnarmoredM, (v) => `${n(v, 1)} m`)),
      ],
    },
  ].filter((group) => group.lines.length > 0);
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
  const figures = [
    { label: m.bombPage.stats.mass, value: bomb.massLabel || (bomb.massKg !== null ? `${Math.round(bomb.massKg)} kg` : null) },
    { label: m.bombPage.stats.tnt, value: bomb.tntKg !== null ? `${Math.round(bomb.tntKg)} kg` : null },
    {
      label: m.bombPage.stats.damage,
      value: damage !== null ? `${estimated ? "≈ " : ""}${number(damage)}` : null,
    },
    { label: m.bombPage.stats.efficiency, value: bomb.efficiency !== null ? number(bomb.efficiency) : null },
  ];
  const groups = statGroups(statsOf(bomb.id), locale, m);
  const similar = similarTo(bomb);
  const sheetDamage = bomb.sheet?.damageValue;

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
            {m.bombKinds[bomb.kind]}
            {bomb.guidance ? ` · ${gameLabel(locale, `missile/guidance/${bomb.guidance}`) ?? bomb.guidance}` : null}
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

        <section className="space-y-3" aria-labelledby="per-base">
          <div className="space-y-1">
            <h2 id="per-base" className="text-lg font-semibold tracking-tight">
              {m.bombPage.perBase}
            </h2>
            {damage !== null && damage > 0 ? (
              <>
                <p className="text-sm text-ink-dim">{m.bombPage.perBaseHint}</p>
                <p className="text-sm text-ink-dim">
                  {estimated
                    ? m.bombPage.source.estimate
                    : bomb.damageSource === "sheet"
                      ? m.bombPage.source.sheet
                      : m.bombPage.source.game}
                  {sheetDamage !== undefined && sheetDamage !== damage
                    ? ` ${fill(m.bombPage.sheetGives, { damage: sheetDamage === null ? "—" : number(sheetDamage) })}`
                    : null}
                </p>
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

        {groups.length > 0 ? (
          <section className="space-y-3" aria-labelledby="figures">
            <div>
              <h2 id="figures" className="text-lg font-semibold tracking-tight">
                {m.bombPage.figures}
              </h2>
              <p className="text-sm text-ink-dim">{m.bombPage.figuresHint}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {groups.map((group) => (
                <div key={group.title} className="card px-4 py-3">
                  <h3 className="text-xs uppercase tracking-wider text-ink-faint pb-1">{group.title}</h3>
                  <dl className="divide-y divide-line text-sm">
                    {group.lines.map(({ label, value }) => (
                      <div key={label} className="flex items-baseline justify-between gap-4 py-1.5">
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
            <h2 id="similar" className="text-lg font-semibold tracking-tight">
              {m.bombPage.similar}
            </h2>
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
