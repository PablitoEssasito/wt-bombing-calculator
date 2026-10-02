"use client";

import { Drawer } from "vaul";

/**
 * The armament chart's filters on a phone: a sheet up from the bottom, the
 * table left where it was beneath it, with a button at its foot that says how
 * many rows the filters leave and closes it. Loaded only on narrow screens
 * (see ArmamentChart), so a desktop never downloads it.
 */
export function FilterSheet({
  open,
  onOpenChange,
  title,
  done,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** The closing button's words — "Show 120". */
  done: string;
  children: React.ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border-t border-line-bright bg-surface outline-none"
        >
          <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-bright" />
          <Drawer.Title className="px-4 pt-3 pb-2 font-semibold">{title}</Drawer.Title>
          {/* Scrolling the chips must not drag the sheet down; the handle and title still do. */}
          <div data-vaul-no-drag className="space-y-4 overflow-y-auto px-4 pb-3">
            {children}
          </div>
          <div className="border-t border-line px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="nums w-full rounded-lg bg-accent-dim px-4 py-2.5 font-medium text-accent"
            >
              {done}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
