"use client";

import { Drawer } from "vaul";
import { cn } from "@/lib/utils";

/**
 * A pylon's menu on a phone: a sheet that slides up from the bottom, drags
 * down to close, and scrolls its own list — instead of a short scrolling box
 * squeezed between the header and the pylon row. Loaded only on narrow
 * screens (see LoadoutCreator), so a desktop never downloads it.
 *
 * A choice held and dragged out of it fades the sheet away (`hidden`) while
 * staying mounted — the drag's source lives in it — so the pylons it covers
 * can be dropped on. The list itself doesn't swipe the sheet shut, or holding
 * a choice to drag it would pull the sheet down instead; the handle and the
 * title still do.
 */
export function PylonSheet({
  open,
  onOpenChange,
  hidden,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hidden: boolean;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const fade = cn("transition-opacity duration-200", hidden && "pointer-events-none opacity-0");
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className={cn("fixed inset-0 z-40 bg-black/60", fade)} />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border-t border-line-bright bg-surface outline-none",
            fade,
          )}
        >
          <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-bright" />
          <Drawer.Title className="px-4 pt-3 font-semibold">{title}</Drawer.Title>
          <Drawer.Description className="px-4 pb-2 text-sm text-ink-dim">{description}</Drawer.Description>
          <div data-vaul-no-drag className="overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
