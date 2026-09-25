import { SiteShell } from "@/components/site-shell";
import { EnglishWords } from "@/i18n/words/en";

/** The English site, at the addresses it has always had. */
export default function EnglishLayout({ children }: { children: React.ReactNode }) {
  return (
    <SiteShell locale="en" Words={EnglishWords}>
      {children}
    </SiteShell>
  );
}
