"use client";

import { I18nProvider } from "@/i18n/client";
import { pl } from "@/i18n/messages/pl";

/** Polish words for the client components below — this language's own script. */
export function PolishWords({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider locale="pl" messages={pl}>
      {children}
    </I18nProvider>
  );
}
