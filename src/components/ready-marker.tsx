"use client";

import { useEffect } from "react";

/**
 * Marks the first load as done once its entrance (`.enter`, globals.css) has
 * played out, so sections rendered by later navigations don't replay it.
 */
export function ReadyMarker() {
  useEffect(() => {
    const id = setTimeout(() => {
      document.documentElement.dataset.ready = "";
    }, 600);
    return () => clearTimeout(id);
  }, []);
  return null;
}
