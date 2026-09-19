/** How many results this option would leave, dimmed so the label still leads. */
export function Count({ children }: { children: number }) {
  return <span className="opacity-60 tabular-nums">{children}</span>;
}
