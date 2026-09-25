import type { ExternalToast } from "sonner";

/**
 * The site's one way to show a toast, so components never reach for the
 * library directly.
 *
 * Toasts only ever follow something the player did, so the library isn't in
 * any page's first load: the first call fetches it and asks <Toaster> to
 * mount, and calls wait in a queue until it has — sonner shows nothing sent
 * before its toaster exists.
 */
type Sonner = typeof import("sonner");
type Call = (sonner: Sonner) => void;

let sonner: Sonner | null = null;
let loading: Promise<Sonner> | null = null;
let mounted = false;
const queue: Call[] = [];
const listeners = new Set<() => void>();

function run(call: Call) {
  if (sonner && mounted) {
    call(sonner);
    return;
  }
  queue.push(call);
  loading ??= import("sonner").then((module) => {
    sonner = module;
    for (const listener of listeners) listener();
    return module;
  });
}

/** Whether <Toaster> should render yet — true once the library is here. */
export function sonnerModule(): Sonner | null {
  return sonner;
}

export function subscribeSonner(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Called by <Toaster> once sonner's own toaster is in the page. */
export function toasterMounted() {
  mounted = true;
  if (!sonner) return;
  for (const call of queue.splice(0)) call(sonner);
}

export const toast = Object.assign(
  (message: string, options?: ExternalToast) => run((s) => s.toast(message, options)),
  {
    success: (message: string, options?: ExternalToast) => run((s) => s.toast.success(message, options)),
    error: (message: string, options?: ExternalToast) => run((s) => s.toast.error(message, options)),
  },
);
