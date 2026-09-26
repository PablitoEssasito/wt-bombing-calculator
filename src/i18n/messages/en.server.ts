import type { Plural } from "@/i18n/format";

/** Marks a count's forms, so the type keeps every form a language may add. */
const forms = (value: Plural): Plural => value;

/**
 * The English words only the server renders — page chrome, headings, metadata
 * and the About page's prose — kept apart from en.ts so they never ride along in
 * the browser's download.
 */
export const enServer = {
  meta: {
    aboutTitle: "About",
    aboutDescription: "What the calculator does, and how the numbers are worked out.",
  },

  about: {
    title: "About",
    intro: "What to load, per aircraft, per base — worked out for the battle rating and game mode you're actually in.",
    coffeeText: "Free, no ads — if it helped you, a coffee is always appreciated.",
    whatsHere: "What's here",
    features: [
      "Search across {aircraft} aircraft, filterable by nation and battle rating, with a per-aircraft drop schedule that recalculates as you change BR, game mode, or base count.",
      "Every loadout note sorted into what it actually means — recommended, worth knowing, heads up, or advised against — instead of a bare marker you have to hover to read.",
      "A loadout creator modelled on the game's own weapon menu: pylon by pylon, with mass limits and mutual exclusions enforced and unmet dependencies flagged, built from the game's own data files rather than guessed from the loadouts alone.",
      "A sortable bomb chart with a standalone calculator for any bomb against any base health — rockets included, priced by hand against the game's own hangar figures rather than left blank.",
      "Premium and squadron aircraft picked out the way the game itself does — gold and green — so a search result does not need a click to tell which is which.",
      "Every control lives in the URL, so a specific setup is one link to share.",
    ],
    creditBuilt:
      "The loadout creator, every recalculated schedule, the rocket damage figures (checked in game, one by one) and the icons are built here from War Thunder's own game files. The hand-tuned drop schedules and bomb damage figures come from",
    creditPulled: ", last pulled {date}.",
    howNumbers: "How the numbers work",
    bleed:
      "A base burns down on its own once most of its health is gone, so you only have to deliver a fraction of it — {bleed} of the total. The count for a single bomb type is therefore:",
    formula: "bombs = ceil(base health × {bleed} ÷ bomb damage)",
    tiers:
      "Base health depends on the battle rating of the match, not of your aircraft, stepping through {count} tiers from {min} to {max}. Arcade bases carry double health. Three-base maps have their own, from {threeMin} to {threeMax}.",
    cannotTell: "What it cannot tell you",
    limits: [
      "Which loadouts the game actually offers. The drop schedules account for that because they were written by hand; the recalculated ones assume you can take any mix.",
      "The per-wing and balance limits the game states alongside the overall mass one. Nothing in the flight model says which wing a hardpoint sits on, and guessing would block loadouts that are perfectly legal — so the loadout creator checks the total only.",
    ],
    renders: "Aircraft renders",
    rendersText:
      "The pictures are the game's own encyclopedia renders, the same ones the War Thunder wiki uses. They are Gaijin's artwork, shown here to make the aircraft easier to recognise.",
    translations: "Translations",
    translationsText:
      "Aircraft and weapon names in Polish and Russian come straight from the game's own localisation files. The rest was translated for this site; the sheet's loadout notes stay in English, as their author wrote them.",
    legal: "Legal",
    legalText:
      "Not affiliated with, endorsed by, or connected to Gaijin Entertainment. War Thunder and all related marks are property of their respective owners.",
  },

  site: {
    title: "War Thunder Base Bombing Calculator",
    shortTitle: "WT Bombing Calculator",
    description:
      "How many bombs to take, and what to drop on each base, for every bomber and attacker in War Thunder.",
    appDescription:
      "How many bombs to take, and what to drop on each base, for every bomber and attacker in War Thunder.",
  },

  footer: {
    builtFrom:
      "Loadout creator, recalculated schedules, rocket figures and in-game icons built from War Thunder's own game files.",
    handTuned: "Hand-tuned drop schedules and bomb damage figures from",
    legion: "LEGION's Loadouts",
    notAffiliated: "Not affiliated with or endorsed by Gaijin Entertainment.",
    lastUpdate: "Last update:",
  },

  categories: {
    "tt-bomber": "Tech tree · bomber/attacker",
    "tt-fighter": "Tech tree · fighter",
    "premium-bomber": "Premium · bomber/attacker",
    "premium-fighter": "Premium · fighter",
  },

  stats: {
    bombsAndRockets: forms({ one: "{n} bomb or rocket", other: "{n} bombs & rockets" }),
    nations: forms({ one: "{n} nation", other: "{n} nations" }),
    sheet: "Sheet v{version}",
    patch: "Patch {version}",
    latest: "Latest: {what}",
    latestPatch: "patch {version} · {date}",
    updates: forms({ one: "{n} update tracked", other: "{n} updates tracked" }),
    aircraft: forms({ one: "{n} aircraft", other: "{n} aircraft" }),
    bombs: forms({ one: "{n} bomb", other: "{n} bombs" }),
  },

  home: {
    heading: "How many bombs do you actually need?",
    intro:
      "Pick your aircraft and get the drop schedule: what to put on each base, how many bases it flattens, and which loadout earns the most while still doing the job.",
    covers: "Covers {aircraft} aircraft and {bombs} bombs.",
    facts: [
      {
        title: "Small bombs hit harder",
        text: "A pile of light bombs does far more to a base than one heavy one. Four 500 lb bombs beat a single 3000 kg, despite carrying less explosive.",
      },
      {
        title: "Bases scale with BR",
        text: "Base health steps up through six tiers, from 4 000 at the bottom to 25 900 at the top, so an uptier changes what you should carry.",
      },
      {
        title: "Travel light",
        text: "The reward multiplier drops as the payload grows. Taking more bombs than the bases need costs you research for nothing.",
      },
    ],
  },

  bombPage: {
    back: "← Bomb chart",
    metaTitle: "{name} — how many per base, and which aircraft",
    metaDescription:
      "How many {name} it takes to destroy a base in War Thunder at every BR, and every aircraft that can carry it.",
    perBase: "How many per base",
    perBaseHint: "How many it takes to destroy one base, by the match's BR.",
    fourBases: "4 bases",
    threeBases: "3 bases",
    aircraft: "Aircraft that carry it",
    inSheet: "in a loadout",
    inSheetTitle: "One of the sheet's loadouts for this aircraft drops it",
    noAircraft:
      "None of the aircraft this site covers carries it — only ones the sheet has no loadouts for.",
    stats: {
      mass: "Mass",
      tnt: "TNT equivalent",
      damage: "Damage to bases",
      efficiency: "Damage per kg",
    },
  },

  notFound: {
    heading: "This page doesn't exist",
    text: "No aircraft, bomb or page lives at that address.",
    back: "← Back to all aircraft",
  },

  error: {
    heading: "Something broke on this page.",
    text: "Reloading usually fixes it.",
  },
};
