import type { Metadata } from "next";
import { History } from "lucide-react";
import Link from "next/link";
import { BombIcon } from "@/components/bomb-glyph";
import { Flag } from "@/components/flag";
import { PageHeader } from "@/components/page-header";
import { PageTransition } from "@/components/page-transition";
import { ChangelogSeen, NewTag } from "@/components/whats-new";
import type { ChangelogEntry } from "@/domain/types";
import { fill, formatDay, formatNumber, plural } from "@/i18n/format";
import { localePath, type Locale } from "@/i18n/locales";
import { messagesFor, type Messages } from "@/i18n/messages";
import { aircraftName, changelog, changelogKey } from "@/lib/dataset";
import { canonicalOf, pageOpenGraph } from "@/lib/site";

export function changelogMetadata(locale: Locale): Metadata {
  const m = messagesFor(locale).changelog;
  return {
    title: m.title,
    description: m.metaDescription,
    ...canonicalOf("/changelog", locale),
    ...pageOpenGraph(m.title, m.metaDescription, undefined, locale),
  };
}

/** Past this many, an aircraft list folds away behind its count. */
const FOLD_AFTER = 12;

type AircraftRef = ChangelogEntry["aircraft"]["added"][number];
type BombChange = ChangelogEntry["bombs"]["changed"][number];

export function ChangelogView({ locale }: { locale: Locale }) {
  const m = messagesFor(locale);
  const latest = changelog[0];

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl px-4 py-10 space-y-8 leading-relaxed">
        <PageHeader
          icon={History}
          title={m.changelog.title}
          stats={
            latest
              ? [
                  fill(m.stats.latest, {
                    what: latest.gameVersion
                      ? fill(m.stats.latestPatch, { version: latest.gameVersion, date: formatDay(locale, latest.date) })
                      : formatDay(locale, latest.date),
                  }),
                  plural(locale, m.stats.updates, changelog.length),
                ]
              : []
          }
        />

        {changelog.length === 0 ? (
          <p className="text-ink-dim">{m.changelog.empty}</p>
        ) : (
          <ChangelogSeen keys={changelog.map(changelogKey)}>
            {changelog.map((entry) => (
              <Entry key={`${entry.gameVersion} ${entry.date}`} entry={entry} locale={locale} m={m} />
            ))}
          </ChangelogSeen>
        )}
      </div>
    </PageTransition>
  );
}

function Entry({ entry, locale, m }: { entry: ChangelogEntry; locale: Locale; m: Messages }) {
  const { aircraft, bombs } = entry;
  const groups = m.changelog.groups;

  return (
    <section className="enter card p-4 sm:p-5 space-y-5" style={{ "--i": 2 } as React.CSSProperties}>
      <h2 className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold">
        {entry.gameVersion ? (
          <span className="nums">{fill(m.changelog.patch, { version: entry.gameVersion })}</span>
        ) : null}
        <NewTag entryKey={changelogKey(entry)} />
        <span className="nums text-sm font-normal text-ink-faint">{formatDay(locale, entry.date)}</span>
      </h2>

      {bombs.changed.length > 0 ? (
        <Group title={groups.bombValues} count={bombs.changed.length}>
          <ul className="space-y-2">
            {bombs.changed.map((bomb) => (
              <li key={bomb.id} className="flex items-center gap-2.5">
                <BombIcon bomb={{ id: bomb.id, chartName: "", fullName: bomb.name }} size={24} />
                <div className="min-w-0">
                  <p className="text-ink">{bomb.name}</p>
                  <p className="nums text-sm text-ink-dim">{describeChange(bomb, locale, m)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Group>
      ) : null}

      {bombs.added.length > 0 ? (
        <Group title={groups.newBombs} count={bombs.added.length}>
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
        <Group title={groups.bombsRemoved} count={bombs.removed.length}>
          <p className="text-ink-dim">{bombs.removed.map((b) => b.name).join(", ")}</p>
        </Group>
      ) : null}

      {aircraft.added.length > 0 ? (
        <Group title={groups.newAircraft} count={aircraft.added.length}>
          <AircraftList planes={aircraft.added} locale={locale} m={m} />
        </Group>
      ) : null}

      {aircraft.br.length > 0 ? (
        <Group title={groups.brChanges} count={aircraft.br.length}>
          <ul className="space-y-1">
            {aircraft.br.map((plane) => (
              <li key={plane.id} className="flex items-center gap-2">
                <AircraftLink plane={plane} locale={locale} />
                <span className="nums text-sm text-ink-dim">
                  {plane.from.toFixed(1)} → {plane.to.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        </Group>
      ) : null}

      {aircraft.loadouts.length > 0 ? (
        <Group title={groups.loadouts} count={aircraft.loadouts.length}>
          <AircraftList planes={aircraft.loadouts} locale={locale} m={m} />
        </Group>
      ) : null}

      {aircraft.removed.length > 0 ? (
        <Group title={groups.aircraftRemoved} count={aircraft.removed.length}>
          <p className="text-ink-dim">{aircraft.removed.map((a) => aircraftName(locale, a)).join(", ")}</p>
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
function AircraftList({ planes, locale, m }: { planes: AircraftRef[]; locale: Locale; m: Messages }) {
  const list = (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {planes.map((plane) => (
        <li key={plane.id}>
          <AircraftLink plane={plane} locale={locale} />
        </li>
      ))}
    </ul>
  );
  if (planes.length <= FOLD_AFTER) return list;
  return (
    <details>
      <summary className="cursor-pointer text-sm text-ink-dim hover:text-accent">
        {fill(m.changelog.showAll, { n: planes.length })}
      </summary>
      <div className="pt-2">{list}</div>
    </details>
  );
}

function AircraftLink({ plane, locale }: { plane: AircraftRef; locale: Locale }) {
  return (
    <Link
      href={localePath(locale, `/aircraft/${plane.id}/`)}
      className="inline-flex items-center gap-1.5 text-ink hover:text-accent underline-offset-4 hover:underline"
    >
      <Flag nation={plane.nation} size={13} />
      {aircraftName(locale, plane)}
    </Link>
  );
}

function describeChange(bomb: BombChange, locale: Locale, m: Messages): string {
  return bomb.fields
    .map(({ field, from, to }) => {
      const unit = field === "damageValue" ? "" : " kg";
      const show = (v: number | null) => (v === null ? "—" : formatNumber(locale, Math.round(v)));
      return `${m.changelog.fields[field]} ${show(from)} → ${show(to)}${unit}`;
    })
    .join(" · ");
}
