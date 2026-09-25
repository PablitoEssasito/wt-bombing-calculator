import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { languageMetadata } from "@/i18n/metadata";
import { PolishWords } from "@/i18n/words/pl";

export const metadata: Metadata = languageMetadata("pl");

/** The Polish site, under /pl/. */
export default function PolishLayout({ children }: { children: React.ReactNode }) {
  return (
    <SiteShell locale="pl" Words={PolishWords}>
      {children}
    </SiteShell>
  );
}
