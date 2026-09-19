"use client";

import { useEffect } from "react";
import { withBasePath } from "@/lib/base-path";

/**
 * A dedicated client component rather than an effect inline in the (server)
 * root layout, so the rest of the shell stays server-rendered.
 *
 * Production only — `next dev` doesn't produce the static export the service
 * worker is written for, and a service worker caching pages during
 * development is a well-known way to make hot reload look broken.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(withBasePath("/sw.js"), { scope: withBasePath("/") });
  }, []);

  return null;
}
