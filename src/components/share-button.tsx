"use client";

import { Check, Link2 } from "lucide-react";
import { useState } from "react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * Every control this button could sit near — filters, the planner, the
 * custom loadout builder — already lives in the URL (see use-url-state.ts),
 * so "share" is just "copy the address bar". The button exists because
 * nobody thinks to do that on their own.
 */
export function ShareButton({ surface, className }: { surface: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      track("share_link", { surface });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied or unavailable — nothing sensible to fall
      // back to, so the button just stays a no-op rather than guessing.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors",
        copied
          ? "border-accent text-accent bg-accent-dim"
          : "border-line text-ink-dim hover:text-ink hover:border-line-bright",
        className,
      )}
    >
      {copied ? <Check size={14} /> : <Link2 size={14} />}
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
