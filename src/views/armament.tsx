import type { Metadata } from "next";
import { Bomb } from "lucide-react";
import { ArmamentChart } from "@/components/armament-chart";
import { PageHeader } from "@/components/page-header";
import { PageTransition } from "@/components/page-transition";
import { fill, plural } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { changelog, chartRowsFor, guidanceLabels, pagedBombs } from "@/lib/dataset";
import { canonicalOf, pageOpenGraph } from "@/lib/site";

export function armamentMetadata(locale: Locale): Metadata {
  const m = messagesFor(locale).bombChart;
  return {
    title: m.title,
    description: m.metaDescription,
    ...canonicalOf("/armament", locale),
    ...pageOpenGraph(m.title, m.metaDescription, undefined, locale),
  };
}

export function ArmamentView({ locale }: { locale: Locale }) {
  const m = messagesFor(locale);
  const patch = changelog[0]?.gameVersion;

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
        <PageHeader
          icon={Bomb}
          title={m.bombChart.title}
          stats={[
            plural(locale, m.stats.weapons, pagedBombs.length),
            plural(locale, m.stats.nations, new Set(pagedBombs.flatMap((b) => b.usedByNations)).size),
            ...(patch ? [fill(m.stats.patch, { version: patch })] : []),
          ]}
        />
        <div className="enter" style={{ "--i": 2 } as React.CSSProperties}>
          <ArmamentChart bombs={chartRowsFor(locale)} guidanceLabels={guidanceLabels(locale)} />
        </div>
      </div>
    </PageTransition>
  );
}
