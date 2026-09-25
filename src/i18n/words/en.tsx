"use client";

import { I18nProvider } from "@/i18n/client";
import { en } from "@/i18n/messages/en";

/** English words for the client components below — this language's own script. */
export function EnglishWords({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider locale="en" messages={en}>
      {children}
    </I18nProvider>
  );
}
