"use client";

import { Star } from "lucide-react";
import { track } from "@/lib/analytics";
import { toggleFavoriteAircraft, useFavoriteAircraft } from "@/lib/local-list";
import { cn } from "@/lib/utils";

export function FavoriteToggle({ id }: { id: string }) {
  const favorites = useFavoriteAircraft();
  const active = favorites.includes(id);

  return (
    <button
      type="button"
      onClick={() => {
        toggleFavoriteAircraft(id);
        track("favorite_toggled", { aircraft: id, state: active ? "off" : "on" });
      }}
      aria-pressed={active}
      aria-label={active ? "Remove from favorites" : "Add to favorites"}
      title={active ? "Remove from favorites" : "Add to favorites"}
      className={cn(
        "p-2 rounded-md border transition-colors shrink-0",
        active
          ? "border-accent text-accent bg-accent-dim"
          : "border-line text-ink-dim hover:text-ink hover:border-line-bright",
      )}
    >
      <Star size={18} className={active ? "fill-current" : ""} />
    </button>
  );
}
