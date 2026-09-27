import type { Metadata } from "next";
import { Columns3 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PageTransition } from "@/components/page-transition";
import { WeaponCompare } from "@/components/weapon-compare";
import type { Locale } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { figureLabels } from "@/lib/dataset";
import { canonicalOf, pageOpenGraph } from "@/lib/site";

export function compareMetadata(locale: Locale): Metadata {
  const m = messagesFor(locale).compare;
  return {
    title: m.title,
    description: m.metaDescription,
    ...canonicalOf("/armament/compare", locale),
    ...pageOpenGraph(m.title, m.metaDescription, undefined, locale),
    // Empty until a choice is made in the address, which no crawler makes.
    robots: { index: false, follow: true },
  };
}

export function CompareView({ locale }: { locale: Locale }) {
  const m = messagesFor(locale);
  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
        <PageHeader icon={Columns3} title={m.compare.title} stats={[]}>
          <p className="text-ink-dim">{m.compare.intro}</p>
        </PageHeader>
        <WeaponCompare
          labels={figureLabels(locale)}
          words={{ groups: m.bombPage.groups, fireRate: m.bombPage.fireRate, nuclearYield: m.bombPage.nuclearYield }}
        />
      </div>
    </PageTransition>
  );
}
