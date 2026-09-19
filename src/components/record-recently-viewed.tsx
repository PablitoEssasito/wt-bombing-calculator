"use client";

import { useEffect } from "react";
import { recordRecentAircraft } from "@/lib/local-list";

/** Invisible — records a visit to the "Recently viewed" list on mount. */
export function RecordRecentlyViewed({ id }: { id: string }) {
  useEffect(() => {
    recordRecentAircraft(id);
  }, [id]);

  return null;
}
