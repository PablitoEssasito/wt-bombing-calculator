"use client";

import { useEffect, useSyncExternalStore } from "react";
import { sonnerModule, subscribeSonner, toasterMounted } from "@/lib/toast";

/**
 * Where every toast on the site appears: bottom centre, clear of the phone's
 * own browser bar, dressed in the site's colours rather than sonner's.
 * Renders nothing until the first toast brings the library in (see lib/toast).
 */
export function Toaster() {
  const sonner = useSyncExternalStore(subscribeSonner, sonnerModule, () => null);
  if (!sonner) return null;
  const Sonner = sonner.Toaster;
  return (
    <>
      <Sonner
        theme="dark"
        position="bottom-center"
        duration={3000}
        mobileOffset={{ bottom: 16 }}
        toastOptions={{
          classNames: {
            toast: "!bg-surface-2 !border-line-bright !text-ink !rounded-lg",
            description: "!text-ink-dim",
            actionButton: "!bg-accent !text-ground !font-medium",
          },
        }}
      />
      <MountSignal />
    </>
  );
}

/** Rendered after sonner's toaster, so its effect runs once that one is in place. */
function MountSignal() {
  useEffect(() => {
    // Sonner subscribes in its own effect; waiting a frame lets it finish
    // before the queued toasts are sent.
    const id = requestAnimationFrame(toasterMounted);
    return () => cancelAnimationFrame(id);
  }, []);
  return null;
}
