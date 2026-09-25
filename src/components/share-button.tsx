"use client";

import { Check, Link2 } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/i18n/client";
import { track } from "@/lib/analytics";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Every control this button could sit near — filters, the planner, the
 * custom loadout builder — already lives in the URL (see use-url-state.ts),
 * so "share" is just "copy the address bar". The button exists because
 * nobody thinks to do that on their own.
 */
export function ShareButton({ surface, className }: { surface: string; className?: string }) {
  const { m } = useI18n();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success(m.common.linkCopied, { description: m.common.linkCopiedDetail });
      track("share_link", { surface });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied or unavailable — there is no copying it
      // for them, but they should at least know it didn't happen.
      toast.error(m.common.copyFailed, { description: m.common.copyFailedDetail });
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
      {copied ? m.common.copied : m.common.copyLink}
    </button>
  );
}
