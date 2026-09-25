import { Fragment } from "react";

/**
 * A translated sentence with live elements — an animated count, a link —
 * where its `{name}` slots are, so word order stays the language's own
 * instead of being fixed around the element by the markup.
 */
export function Filled({ template, slots }: { template: string; slots: Record<string, React.ReactNode> }) {
  const parts = template.split(/\{(\w+)\}/);
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <Fragment key={i}>{slots[part] ?? `{${part}}`}</Fragment> : part))}
    </>
  );
}
