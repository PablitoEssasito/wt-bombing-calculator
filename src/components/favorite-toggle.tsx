"use client";

import { Star } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { track } from "@/lib/analytics";
import { toggleFavoriteAircraft, useFavoriteAircraft } from "@/lib/local-list";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function FavoriteToggle({ id }: { id: string }) {
  const { m } = useI18n();
  const favorites = useFavoriteAircraft();
  const active = favorites.includes(id);

  return (
    <button
      type="button"
      onClick={() => {
        toggleFavoriteAircraft(id);
        track("favorite_toggled", { aircraft: id, state: active ? "off" : "on" });
        toast(active ? m.common.removedFavorite : m.common.addedFavorite, {
          action: { label: m.common.undo, onClick: () => toggleFavoriteAircraft(id) },
        });
      }}
      aria-pressed={active}
      aria-label={active ? m.common.removeFavorite : m.common.addFavorite}
      title={active ? m.common.removeFavorite : m.common.addFavorite}
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
