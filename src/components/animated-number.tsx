"use client";

import NumberFlow, { type Format } from "@number-flow/react";
import { useI18n } from "@/i18n/client";
import type { Plural } from "@/i18n/format";
import { INTL_LOCALES } from "@/i18n/locales";

/**
 * A number that rolls to its new value instead of snapping — for the counts a
 * player watches change as they adjust something. Grouped the way the page's
 * language groups numbers, so it reads the same as the static ones around it.
 * Under reduced motion it simply swaps.
 */
export function AnimatedNumber({
  value,
  format,
  prefix,
  suffix,
  className,
}: {
  value: number;
  format?: Format;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const { locale } = useI18n();
  return (
    <NumberFlow
      value={value}
      locales={INTL_LOCALES[locale]}
      format={format}
      prefix={prefix}
      suffix={suffix}
      className={className}
    />
  );
}

/**
 * A counted phrase — "3 bases", "3 bazy", "3 базы" — with the number rolling
 * and the words around it in the form the number calls for.
 */
export function AnimatedCount({ forms, value }: { forms: Plural; value: number }) {
  const { count } = useI18n();
  // Mark where the number goes, then put the rolling one there.
  const [before, after = ""] = count(forms, value, { n: "\u0000" }).split("\u0000");
  return (
    <>
      {before}
      <AnimatedNumber value={value} />
      {after}
    </>
  );
}
