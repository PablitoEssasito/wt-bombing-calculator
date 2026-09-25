"use client";

import { Search } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/client";

/** The palette and its search index only load the first time it is opened. */
const CommandPalette = dynamic(
  () => import("@/components/command-palette").then((mod) => mod.CommandPalette),
  { ssr: false },
);

const noSubscribe = () => () => {};

/** Whether a key press belongs to something being typed into. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * The header's search button, and the shortcuts that open the same palette
 * from anywhere: Ctrl/⌘+K, or "/" when nothing is being typed.
 */
export function CommandPaletteTrigger() {
  const { m } = useI18n();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Known only in the browser; the server renders the Ctrl form.
  const mac = useSyncExternalStore(noSubscribe, () => /Mac|iPhone|iPad/.test(navigator.platform), () => false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const combo = (event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey);
      const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !isTyping(event.target);
      if (!combo && !slash) return;
      event.preventDefault();
      setLoaded(true);
      setOpen((wasOpen) => (combo ? !wasOpen : true));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        onPointerEnter={() => void import("@/components/command-palette")}
        aria-label={m.nav.search}
        className="ml-auto flex shrink-0 items-center gap-2 rounded-md border border-line px-1.5 min-[360px]:px-2 py-1.5 text-sm text-ink-dim transition hover:border-line-bright hover:text-ink motion-safe:active:scale-[0.97]"
      >
        <Search size={16} aria-hidden />
        <kbd className="hidden rounded border border-line px-1.5 font-sans text-xs text-ink-faint lg:inline">
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
      {loaded ? <CommandPalette open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
