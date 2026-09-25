import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { languageMetadata } from "@/i18n/metadata";
import { RussianWords } from "@/i18n/words/ru";

export const metadata: Metadata = languageMetadata("ru");

/** The Russian site, under /ru/. */
export default function RussianLayout({ children }: { children: React.ReactNode }) {
  return (
    <SiteShell locale="ru" Words={RussianWords}>
      {children}
    </SiteShell>
  );
}
