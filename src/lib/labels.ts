import type { BombKind } from "@/domain/types";

/** Roman numerals are how the game itself labels ranks. */
export const RANK_LABELS = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export const BOMB_KIND_LABELS: Record<BombKind, string> = {
  GP: "General purpose",
  AP: "Armour piercing",
  DRAG: "Retarded",
  INC: "Incendiary",
  MINE: "Mine",
  GNSS: "Satellite guided",
  LAS: "Laser guided",
  TV: "TV guided",
  IR: "IR guided",
  RC: "Radio guided",
  ROCKET: "Rocket",
  OTHER: "Other",
};

/** Heading above a note attached to a loadout. */
export const NOTE_HEADINGS = {
  "?": "Worth knowing",
  "!": "Heads up",
  star: "Recommended",
  /** A note with no marker at all. */
  none: "Note",
} as const;

/** Shown in place of a note when the import had no API key to read cell comments. */
export const NOTE_FALLBACKS = {
  "?": "This loadout carries a caveat.",
  "!": "Something about this loadout is worth knowing before you take it.",
  star: "This is the recommended loadout.",
} as const;
