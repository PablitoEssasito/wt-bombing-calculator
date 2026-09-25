import type { Metadata } from "next";
import { Bomb } from "lucide-react";
import { BombChart } from "@/components/bomb-chart";
import { PageHeader } from "@/components/page-header";
import { PageTransition } from "@/components/page-transition";
import { inBombChart } from "@/domain/bomb-chart";
import { fill, plural } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { bombs, changelog, meta } from "@/lib/dataset";
import { canonicalOf, pageOpenGraph } from "@/lib/site";

export function bombsMetadata(locale: Locale): Metadata {
  const m = messagesFor(locale).bombChart;
  return {
    title: m.title,
    description: m.metaDescription,
    ...canonicalOf("/bombs", locale),
    ...pageOpenGraph(m.title, m.metaDescription, undefined, locale),
  };
}

export function BombsView({ locale }: { locale: Locale }) {
  const m = messagesFor(locale);
  const shown = bombs.filter(inBombChart);
  const patch = changelog[0]?.gameVersion;

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
        <PageHeader
          icon={Bomb}
          title={m.bombChart.title}
          stats={[
            plural(locale, m.stats.bombsAndRockets, shown.length),
            plural(locale, m.stats.nations, new Set(shown.flatMap((b) => b.usedByNations)).size),
            ...(meta.sheetVersion ? [fill(m.stats.sheet, { version: meta.sheetVersion })] : []),
            ...(patch ? [fill(m.stats.patch, { version: patch })] : []),
          ]}
        />
        <div className="enter" style={{ "--i": 2 } as React.CSSProperties}>
          <BombChart bombs={bombs} />
        </div>
      </div>
    </PageTransition>
  );
}
