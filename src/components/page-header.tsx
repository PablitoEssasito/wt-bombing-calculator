import type { LucideIcon } from "lucide-react";

/**
 * A section page's heading: an icon, the title, and a row of facts read from
 * the data — so the space under the title says something true and current
 * instead of a paragraph nobody reads twice.
 */
export function PageHeader({
  icon: Icon,
  title,
  stats,
  children,
}: {
  icon: LucideIcon;
  title: string;
  stats: string[];
  children?: React.ReactNode;
}) {
  return (
    <header className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-accent/30 bg-accent-dim text-accent">
          <Icon size={20} aria-hidden />
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      </div>
      {stats.length > 0 ? (
        <ul className="enter flex flex-wrap gap-1.5" style={{ "--i": 1 } as React.CSSProperties}>
          {stats.map((stat) => (
            <li
              key={stat}
              className="nums rounded-full border border-line px-2.5 py-1 text-xs text-ink-dim"
            >
              {stat}
            </li>
          ))}
        </ul>
      ) : null}
      {children}
    </header>
  );
}
