import { inBombChart } from "@/domain/bomb-chart";
import type { Locale } from "@/i18n/locales";
import { aircraftIndexFor, bombs } from "@/lib/dataset";

/**
 * What the command palette searches, built once per language at export time
 * into a static JSON file — so no page carries the list in its own download,
 * and the palette fetches it only the first time someone opens it. Aircraft
 * names are the language's own, so "Ił-2" finds what the page calls "Ił-2".
 */
export type SearchIndex = {
  aircraft: { id: string; name: string; nation: string; br: number; imageId: string | null }[];
  bombs: { id: string; name: string }[];
};

export function searchIndexFor(locale: Locale): SearchIndex {
  return {
    aircraft: aircraftIndexFor(locale).map(({ id, name, nation, br, imageId }) => ({ id, name, nation, br, imageId })),
    bombs: bombs.filter(inBombChart).map((b) => ({ id: b.id, name: b.fullName || b.chartName })),
  };
}
