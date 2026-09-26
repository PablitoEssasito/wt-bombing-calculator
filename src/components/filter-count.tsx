/**
 * How many results this option would leave, dimmed so the label still leads.
 *
 * A plain number, not a rolling one: a single click changes a dozen of these
 * at once, and each rolling number measures the page to animate — together
 * they held a click up by 100–250 ms on a phone-speed CPU.
 */
export function Count({ children }: { children: number }) {
  return <span className="opacity-60 tabular-nums">{children}</span>;
}
