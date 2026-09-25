"use client";

import { I18nProvider } from "@/i18n/client";
import { ru } from "@/i18n/messages/ru";

/** Russian words for the client components below — this language's own script. */
export function RussianWords({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider locale="ru" messages={ru}>
      {children}
    </I18nProvider>
  );
}
