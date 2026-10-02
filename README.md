# WT Bombing Calculator

[![Deploy](https://github.com/PablitoEssasito/wt-bombing-calculator/actions/workflows/deploy.yml/badge.svg)](https://github.com/PablitoEssasito/wt-bombing-calculator/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Live at [pablitoessasito.github.io/wt-bombing-calculator](https://pablitoessasito.github.io/wt-bombing-calculator/).**

A bombing planner for War Thunder: how many bombs each base takes, for every aircraft,
at any match BR, game mode and map size — built on the game's own data files.

- **Planner** for all 648 aircraft: what to carry, how many to drop on each base, how many
  bases the payload covers, and which loadout earns the most while still doing the job.
- **Loadout creator** on 486 of them: any pylon combination the game allows, with its mass
  limits and exclusions, priced the same way.
- **Armament section**: all 659 bombs, rockets, missiles, torpedoes, mines and gun pods the
  game's aircraft carry, filtered by category, seeker, aspect or warhead, each with its own
  page and a side-by-side comparison of up to six.
- **Rewards**: the game's own reward multipliers, and what a sortie pays in Air RB.
- **Changelog** of what each game patch changed, imported daily.
- English, Polish and Russian; Ctrl+K search, favourites, works on a phone.

Every figure — damage to a base, mass, TNT, base health, reward — is read from the game's
files in the [War Thunder datamine](https://github.com/gszabi99/War-Thunder-Datamine).
The hand-tuned drop plans start from [LEGION's Loadouts](https://docs.google.com/spreadsheets/d/1oNwp_MXszU5J2dcaz5IoCtSAQ-infPdOWhwtJXqtrwU/edit),
the community spreadsheet that first worked them out, and are checked against the game
before they reach the site (see [Drop plans](#drop-plans)).

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run build         # static export into out/
npm test              # vitest: domain logic and checks on the committed data
npm run lint           # eslint

npm run data           # every import below in order, as the daily workflow runs it
npm run data:cache     # the same from cached responses, without hitting the network
npm run changelog      # record what this import changed, for /changelog — run last

npm run etl            # re-import the drop plans from the spreadsheet
npm run images         # re-match and re-download aircraft renders and tech-tree icons
npm run armament:fetch # pull the flight models, which stores reads
npm run stores         # catalogue every weapon the game's hardpoints can hang, and price it
npm run armament       # the loadout creator's data, and the plans checked against the game
npm run bomb-icons     # each weapon's icon as the game's loadout menu draws it
npm run battle-ratings # every mode's BR and the reward figures from the game's files
npm run localize       # Polish and Russian aircraft and weapon names, from the game's lang files
npm run bases          # base HP from the game's mission templates, checked against the site's

npm run reward-logs    # local only: reward samples from this machine's War Thunder logs — see Rewards
```

Each step reads what the one before it wrote, so run them in the order `npm run data`
does. Each but `armament:fetch` has a `:cache` variant that reuses what it already pulled. `changelog`
compares the data on disk against its last commit, so it goes after everything else and
before committing; running it again before the commit rewrites the same entry rather than
adding another, and an import within a patch that already has an entry folds into it.

### The daily import

`.github/workflows/data-import.yml` runs `npm run data` and `changelog` every morning and
opens (or refreshes) one pull request when the game or the sheet changed anything; its
header lists the one-time setup. With the repo variable `AUTO_MERGE_DATA_IMPORTS=true` it
also merges and deploys, but only when lint, tests and build pass on the new data. The
Sheets API key lives in the `data-import` environment, which only `main` can use.

### Configuration

The ETL reads an optional `GOOGLE_SHEETS_API_KEY` from `.env.local`. Without it everything
still imports, minus the sheet's cell notes — see [Notes](#notes).

The site is fully static: `out/` is about 5 000 prerendered pages that can be dropped on
any host. The only data fetched at runtime is static too: `/search-index.json` when the
Ctrl+K palette first opens, and `/armament-data.json` on the comparison page.

Set `NEXT_PUBLIC_SITE_URL` to the real deployment origin before building for production — it is what the sitemap, `robots.txt` and every Open Graph tag
use to build an absolute URL; unset, it falls back to `localhost:3000`, which is only ever
right for `next dev`.

Set `NEXT_PUBLIC_GA_ID` to a GA4 measurement id (`G-XXXXXXXXXX`) to load Google
Analytics (`@next/third-parties`); unset, the site ships with no analytics script at
all, which is also what `next dev` and a plain `npm run build` get. The deploy workflow
reads this from a `NEXT_PUBLIC_GA_ID` repository variable (Settings → Secrets and
variables → Actions → Variables) rather than a hardcoded id — a measurement id isn't
sensitive, but there is no reason to commit one either.

## Damage to a base

A weapon's damage to a base is the game's own price for it, `weaponDamage` in
`wpcost.blkx` — for a bomber's fixed setup, the setup's price split over its rounds.
Where the game prices nothing, the site estimates it with the game's own explosion
model: `weaponDamage` is an exact function of TNT (piecewise linear, its corners read off
the game's prices, every one reproduced), with the zone's 25 mm armour threshold. An
estimate is marked `≈` and, as in the game, adds nothing to the reward multiplier.
Nothing is priced by the sheet's numbers.

```
bombs per base = ceil(base health × 0.9018 ÷ bomb damage)
```

`0.9018` is the base-bleed factor — a base finishes burning down on its own once about
90% of its health is gone. Base health depends on the **match** BR, in six steps:

| Match BR | Base health |
| --- | --- |
| up to 2.0 | 4 000 |
| 2.3 – 3.3 | 6 000 |
| 3.7 – 4.7 | 10 000 |
| 5.0 – 6.3 | 16 000 |
| 6.7 – 7.7 | 22 000 |
| 8.0 and up | 25 900 |

Arcade bases carry double health. Three-base maps (Kursk, Norway and the other missions
built on the game's `destroy_bomb_areas_template.blk`) set their own, by the same brackets:
6 000, 8 000, 10 000, then 12 000 from BR 5.0 up — and in arcade ×2.5, ×3.2, ×3.2 and ×4.2
of that. Real battles side with the game's file (a BR 3.7 Kursk base paid for a 1000 lb
bomb exactly as a 10 000 HP one does). `npm run bases` reads these from the mission
templates, and a test keeps them in step.

## Drop plans

The sheet's plans are not a plain `ceil()`. The Pe-8 needs seven FAB-100s per 10 000 HP
base, but the sheet says eight — because the aircraft can only take those bombs as one
fixed block of forty, and spreading the surplus beats wasting it. Judgements like that
depend on which loadouts the game actually offers, so the plans are imported rather than
computed — and then held to the game (`scripts/armament/rebind.ts`, `src/domain/fit.ts`):

- **Each bomb is one the aircraft really hangs.** A plan naming a bomb the game does not
  put on that aircraft takes the one it does — by name first (`M8` → the Soviet M-8 on
  the Su-6, `Mk 77` → mod 4), else the same family at the nearest mass. What the game
  does not have, the plan does not have.
- **Each plan fits the pylons.** Where the sheet's plan breaks the game's mass limit or
  exclusions, the site takes the part of it the hardpoints hang exactly that destroys the
  most bases — never a bomb or a count the sheet did not give. A bomber with fixed
  setups gets the game's setup that destroys the most; another setup destroying as many
  is listed beside it. The sheet's plan is kept in `sheetPlan`, and every import starts
  from it.
- **A base counts only if the game's damage destroys it.** Where a patch has nerfed a
  bomb below what the sheet counted on, the planner says so on the base and stops
  counting it.

Change the mode, the map or the bracket and the same payload is redistributed against
the new base health, labelled as recalculated.

## The loadout creator

The spreadsheet is one hand-picked answer per aircraft. Underneath it, the game itself
offers pylon-by-pylon choice on 486 of the 648 aircraft — mass limits, mutual
exclusions, dependent stores — none of which the spreadsheet states. The creator reads
that structure straight from the [War Thunder datamine](https://github.com/gszabi99/War-Thunder-Datamine)
and lets you build any combination the game would actually let you fly, priced the same
way the drop schedule is.

`scripts/armament/` does the reading: `parse.ts` turns one aircraft's flight model and
weapon presets into hardpoints, mass limits and ban/require rules; `stores.ts` builds a
standalone catalogue of every weapon file any aircraft can hang, from a hardpoint or
a ready-made setup — its mass, its bomb-chart match, how many rounds a rack or rail
actually holds, and the game's own UI icon for it; `index.ts` joins the two into
`src/data/armament.json`, written compactly (every store interned once, referred to by
index) since the raw hardpoint data is the largest file this project ships, and into
`src/data/carriers.json`, which aircraft can carry each bomb — read at build time for
the bomb pages, never shipped.

Icons come from two places, both landing in `public/bombs/icons/` regardless of which
pulled them: `scripts/bomb-icons/` matches every bomb and rocket in the chart to the
weapon file that prices it (see below), while `scripts/armament/index.ts` separately
downloads whatever a hardpoint preset states its own icon as — a twin missile rail draws
differently from a lone one off the same file, and only the preset itself knows which.

The creator enforces what the game's files state plainly — the mass limit, mutual
exclusions — and flags what they only imply — an unmet dependency — without blocking on
it. What it cannot check: the per-wing and balance limits the game also states, since
nothing in the flight model says which wing a hardpoint sits on.

## The armament section

`/armament/` lists every weapon the game's aircraft carry, not only the ones that hurt a
base. `scripts/armament/stores.ts` catalogues them; `reconcile.ts` files each under a
category (bomb, rocket, air-to-ground missile, air-to-air missile, torpedo, mine, gun pod)
and tags it, every tag read off the weapon's own file the way the game's tooltip
(`weaponryinfo.nut`) reads it — a bomb's type, the seeker, an IR seeker's aspect, IOG,
data link, IRCCM, a warhead. Nothing is guessed from a name. A missile is air-to-air or
air-to-ground by the trigger an aircraft fires it with, as the tooltip has it.

The page groups its tabs in two tiers (`SECTIONS` in `src/domain/bomb-chart.ts`): two
views of the whole — what can bring a base down, and everything — then the categories,
air-to-ground split into bombs, rockets, missiles and nuclear bombs, air-to-air into radar
and IR. Each tab has its own columns and order (`src/domain/chart-columns.ts`): what it
takes to destroy a base where that is the point; a missile's seeker, reach, speed and
G-load where it is not. Its filter chips are three-state (in, out, off), and every
setting lives in the URL, so a link shares the view.

Each weapon has a page (`/armament/<id>/`): the game's tooltip stats, how many it takes
per base at every BR, every aircraft that carries it — with a page here or without — and
similar weapons. `/armament/compare/?ids=…` sets up to six side by side. The old
`/bombs/<id>/` addresses redirect to the new ones.

## Layout

```
scripts/etl/          import the drop plans from the spreadsheet; run by hand, never during a build
  parse-bombs.ts        the bomb chart, including its unlabelled nation blocks
  parse-nations.ts      ten nation tabs into aircraft and loadouts
  aliases.ts            names the sheet spells differently from the chart, or misspells outright
scripts/armament/     the game's weapons and hardpoints, read from the datamine
  stores.ts             every weapon any aircraft can hang, priced and described
  reconcile.ts          the game's weapons onto the chart's rows: figures, category, tags
  rebind.ts             each plan's bombs onto those its aircraft really hangs
  parse.ts, index.ts    hardpoints, mass limits and rules for the loadout creator
scripts/bomb-icons/   each weapon's icon as the game's loadout menu draws it
scripts/images/       aircraft renders and tech-tree icons, matched off the wiki
scripts/localize/     Polish and Russian names, from the game's own localisation files
scripts/battle-ratings/  BRs, reward multipliers and constants, from wpcost/warpoints/rank/items
scripts/bases/        base HP from the game's mission templates
scripts/changelog/    what an import changed, for /changelog
scripts/reward-logs/  local only: in-battle rewards read out of the game's own logs
src/data/             the committed output — the app reads only this
src/domain/           the formulas, plans, tabs and rewards, free of React
src/lib/              data access, URL state, analytics, shared helpers
src/components/       the interface
src/i18n/             languages: the dictionaries, plural rules and number formats
src/views/            each page, once, taking the language it renders in
src/app/              routes: (en)/ at the site's own addresses, pl/ and ru/ under their prefix
```

### Re-importing

`npm run etl` pulls each tab through Google's `gviz` CSV endpoint, rebuilds
`src/data/{aircraft,bombs,meta}.json`, and checks its own work before you commit the
diff:

- every bomb named in a loadout resolves to a chart entry — or, where the chart has no
  row for it, to exactly one weapon the aircraft hangs in the game;
- the bomb chart still splits into exactly ten nation blocks, and each one is
  carried mostly by the nation it was assigned to;
- the formula reproduces all 1 170 counts the chart prints;
- every base the sheet calls destroyed carries enough damage to destroy it.

The first three are blocking. The last reports a handful of bases at 94–100% of the
threshold, which are the source's own judgement calls, not import errors.

## Notes

The source hangs comments off its cells — practical advice that is often the most
useful thing on the row, like the Pe-8's *"set your ripple quantity to 4, drop 2 times
for 8 bombs per base"*. CSV export drops them, so they come from the Sheets API, which
needs an API key (Cloud Console → enable the Sheets API → create an API key → restrict
it to Sheets) in `.env.local`:

```
GOOGLE_SHEETS_API_KEY=AIza...
```

The key is only ever read by `npm run etl`, and the notes it fetches are committed to
`src/data`, so building and running the site never needs one.

The two exports number their rows differently — the API returns the sheet as laid out,
the CSV silently drops empty rows — so the ETL compacts the API grid the same way and
then compares the two cell by cell. If a single cell disagrees it imports no notes for
that tab at all, because a note pinned to the wrong aircraft is worse than no note.

## Rocket damage

The spreadsheet's Bomb Chart prices bombs only, and no base-damage figure for rockets is
published anywhere. `scripts/etl/rockets.ts` once filled in all 61 unguided rocket types
by hand, checked against the game's hangar stat. It now supplies their names and ids; the
figures come from the game like every other weapon's — its price where it has one, else
the explosion model's estimate. Kinetic rounds with no explosive filler (AP Mk I/II, TBA
Multi-Dart 100 AB) come to zero.

## Aircraft renders

`npm run images` fills `public/aircraft/` with two images per matched aircraft, both
re-encoded as WebP at their native size — no downscaling, since both sources are
already the size they are shown at:

- `renders/{unit}.webp` — the full 512x256 encyclopedia render, for the aircraft page.
- `icons/{unit}.webp` — the small tech-tree slot icon, ~120x66, for search tiles. This
  is the style the source spreadsheet itself uses next to each entry.

639 aircraft, 16.5 MB total (14.1 MB renders, 2.4 MB icons) — down from over 60 MB of
PNG at the source resolution.

Both come from Gaijin's own encyclopedia CDN,
`static.encyclopedia.warthunder.com/{images,slots}/{unit}.png`, which is what the wiki
itself uses. **These are Gaijin's assets, mirrored here rather than hotlinked.** That is
a deliberate choice for reliability, and it is worth knowing before this repo goes
anywhere public.

The hard part is names. The sheet writes `Lancaster I`, the game calls it
`Lancaster B Mk I`; `B6N1 Mod. 11` against `B6N1 Model 11`; `Buccaneer 1` against
`Buccaneer S.1`. The matcher in `scripts/images/match.ts` works down a ladder of rules —
exact, prefix, token-subset ignoring filler words like *Mk* and *serie*, then the other
nation's tree — and accepts a rule only when it lands on exactly one candidate,
reserving the unit it lands on so a later, looser rule can never take it back. That
reaches 648 of 648 — including one the sheet itself gets wrong, `Do 17 J-1`, which does
not exist: the game has `Do 217 J-1`, rank and BR matching the sheet's row exactly
(wiki.warthunder.com/unit/do_217j_1). That's a dropped digit, not a judgment call, so
`AIRCRAFT_NAME_CORRECTIONS` in `aliases.ts` fixes the name before matching ever sees it,
the same way `BOMB_ALIASES` does for a loadout cell that misnames a bomb.

Names come from `window.WT_UnitList` on the wiki's aviation page, which also carries
whether a vehicle is a premium purchase or a squadron reward — the same distinction the
game's own tech tree colours gold and green for, and what the search results colour the
same way. If the wiki stops publishing the list, the script fails loudly rather than
silently matching nothing.

## Bomb icons

`npm run bomb-icons` fills `public/bombs/icons/` with the game's own weapon-selector
icon for each bomb and rocket — the same small round renders (glossy orange for GP,
silver for mines, red for incendiary, olive for guided) the source spreadsheet itself
pastes into its cells. The site ships 349 of them, the loadout creator's own — missiles,
gun pods, tanks — included.

These come from a different part of the datamine than the aircraft renders: the actual
game data at `aces.vromfs.bin_u/gamedata/weapons/`, one `.blkx` file per weapon, each
naming its own UI icon via an `iconType` field (e.g. `"iconType": "bombs_small"`) that
points into `atlases.vromfs.bin_u/gameuiskin/`. The icon files are 100x100 and already
sized the way the game means them to read, so nothing here resizes them — only
re-encodes the PNG as WebP.

Matching a chart bomb to its weapon file is a three-signal problem, in
`scripts/bomb-icons/match.ts`:

1. **Mass.** The sheet's `massKg` and the game's own `mass` field trace back to the same
   source value and agree to a fraction of a kilogram, which narrows the weapon files
   down to a handful sharing that exact weight.
2. **Kind.** A GP bomb never gets a guided-bomb icon and a drag-retarded one always gets
   the high-drag variant — read from the game's own `guidance`/`brakeArm`/`explosiveType`
   fields and enforced as a hard filter, not a preference.
3. **Name.** Only used to break a tie once the field is already this narrow, checking
   whether one name's core letters sit inside the other's.

A weapon that comes from the game alone takes its own file's icon; the matching above is
for the sheet's rows. A torpedo always gets the torpedo icon: no torpedo file names one,
and the game draws them all alike. The three rows left over fall back to the plain bomb-family icon
whose *typical* mass sits closest to theirs (nearest-median classification, not a
cutoff: the icon a bomb gets also reads its length and calibre, not mass alone, so
"small" and "middle" bombs overlap in mass across their entire range rather than sitting
on either side of a boundary). Every entry gets a real, plausible icon; none are left
blank.

That match is only the starting point. The weapon file's own icon and the one the
game's loadout menu draws for it disagree for about half of all presets — the Mk 83's
file says `bombs_special`, every preset carrying it draws `bombs_large` — and the menu's
is the one a player actually sees. So wherever presets hang a bomb on its own, the
icon they draw it with most often wins, cut back from the rack's drawing to a single
round (`bombs_large_group_x4` → `bombs_large`), with a tie going to whichever icon's
drag matches the bomb's kind. That gives the one icon a bomb shows where there is no
aircraft to go by, such as the search results.

On an aircraft's own page it is that aircraft's menu instead, because the game draws
one bomb a size apart from one aircraft to the next — the AN-M64 is `bombs_middle` on
most, `bombs_large` on the A-26B-10, whose lighter AN-M30 and AN-M57 take the two
smaller sizes. The icons are hand-set per aircraft, not derived from mass, and the game
states them in one of three places, tried in order (`scripts/bomb-icons/aircraft.ts`):
the pylon presets the loadout creator reads; the `weaponConfig` of a fixed-setup
aircraft's presets; and, where neither says, the weapon file's own icon. Each aircraft's
result is written to `src/data/aircraft-bomb-icons.json`, only where it differs from
the site-wide one.

LEGION's sheet pictures every loadout's menu row, so it served as the check, and in-game
screenshots settled every pair the two disagreed on. Where the game files were right (the
Mosquito B XVI, Do 217 E-2, P-61C-1 and more) they are pinned in `bomb-icons.test.ts`;
where an aircraft hangs a weapon file the chart ties to no bomb, so none of the three
sources reaches it, the screenshot's icon is set by hand in `AIRCRAFT_ICON_OVERRIDES`.
The icons now match the sheet on 96.5% of the 513 pairs it shows unambiguously, and every
remaining one is the sheet's own slip. This step reads
`src/data/armament.json` and the flight models `npm run armament` caches, so run that
first.

Where a hardpoint choice hangs a rack or a launcher rather than a bare weapon, the
loadout creator still draws the preset's own stated icon on the pylon — see
[The loadout creator](#the-loadout-creator) above for why that one counts rounds.

## Languages

English lives at the site's own addresses; Polish and Russian under `/pl/` and `/ru/`,
every page in all three, each naming the others for search engines (hreflang). A static
export has no server to redirect by browser language, so the first visit decides it in the
browser, once: a browser set to Polish or Russian moves to that version, one set to none of
the three is asked, and the choice is remembered. Arriving on a `/pl/` or `/ru/` address
keeps it, and crawlers of the English addresses always get English. After that, the header
(from tablet width), the Ctrl+K palette and the footer all switch any page.

Every word is in `src/i18n/messages/`: English is the source, and the other two must match
its keys and `{placeholders}` exactly — the type system and `src/i18n/__tests__` both check.
A count is a set of plural forms (`one`/`few`/`many`/`other`), picked by `Intl.PluralRules`,
since Polish and Russian decline a noun three ways by number.

Aircraft and weapon names in Polish and Russian are the game's own, read by
`npm run localize` from its localisation files into `src/data/names.json` — the same names
the game's client shows, with the little nation marks its font draws stripped. The sheet's
loadout notes stay in English, marked as such.

## Rewards

Every reward figure is the game's own, computed the way its client computes it — each
function in `src/domain/reward.ts` names the script in the datamine it ports:

- **The loadout's multiplier for bases** (`getPresetRewardMul`): falls once a payload's
  damage passes `presetDmgMin`; gold-priced aircraft get ×1.2 before the cap, fighters ×0.8
  after it, and the loadout screen shows it ×10. The creator prices a build by each store's
  own `weaponDamage` from `wpcost.blkx`, so rockets and incendiaries count as in the game.
- **The aircraft's reward lines** (the game's aircraft card): SL = multiplier [× 2.0 for a
  gold tile] × (100% + premium account 50% + boosters); RP = multiplier × (100% + premium
  account 100% + talisman 100% + boosters). A gold tile always has its talisman.
- **Boosters** of one currency stack for less each: 100%, 60%, 40%, 20%, 10% of their size,
  strongest first (`calc_public_boost`).

`npm run battle-ratings` writes the per-aircraft figures to `src/data/economy.json` and the
game-wide ones — from `warpoints.blkx`, `rank.blkx` and the booster sizes in `items.blkx` —
to `src/data/reward-constants.json`. Premium account, talisman and boosters are the player's
own and stay in their browser.

What a destroyed base actually pays isn't in any file, so the per-sortie amount is fitted
to real battles. `npm run reward-logs` reads the rewards the HUD announced from the game's
own logs on this machine (they are XOR-scrambled; the key is recovered from the text), keeps
Air RB only, and writes samples to `.cache/reward-samples.json` — never the repository,
since a raw log holds addresses, tokens and other players' names. In them a base pays twice,
with no kill-feed line: `et:17` for damage dealt (in ticks, while napalm burns) and `et:3`
for destroying it — 4/7 of the damage figure in Silver Lions, half in research points. Both
scale with the base's hitpoints: one figure per hitpoint (`BASE_REWARD_PER_HP` in
`src/domain/reward.ts`) lands every clean Silver Lion sample on the lion — Su-25K and F-5C
against 25 900 HP bases, the Su-17M4 and F-4J too, the A-26B-10 against 16 000 HP ones and 12 000 HP
ones on a three-base map, six payloads, with and without boosters — once the aircraft's multiplier,
the payload's, the premium account and boosters are applied. The one miss is the B-25J-30
at BR 3.7: its battle results put the base itself 14% above it for damage and 19% for
destroying it, premium account and booster as usual. It's the only `exp_bomber` sampled
(the A-26B-10 is `exp_assault`), so class or bracket — nothing corrects for it yet. Research points vary about 6% from battle to battle, and in battle the premium
account's bonus counts the talisman's share too, so the two make ×4 where the card sums
×3 — the battle results (Ctrl+C in the results window) itemise an F-4J's base as
254 + (PA) 508 + (Talismans) 254 RP, beside 2 055 + (PA) 1 028 + (Booster) 411 SL, and list
the same per-base figures as the HUD. The Su-17M4, A-26B-10 and B-25J-30 (tech tree, no
talisman) and that F-4J agree on one figure within 0.2%; the Su-25K and F-5C (gold tiles)
land 5% above it, which no file explains. A research booster counts the base alone, outside
the premium account's doubling.
The page says how close the amounts are in one line under them. Other modes are unchecked, so the amount is shown for Air RB only.

## Known gaps

- **Per-wing and balance limits.** The loadout creator enforces the game's mass limits
  and exclusions, but not the per-wing limits it also states: nothing in the flight
  model says which wing a hardpoint sits on.
- **Base bleed.** The mission template says 0.9; the site keeps the sheet's 0.9018 until a
  battle settles it (it would change 196 of 3 012 counts).
- **Rewards outside Air RB.** The per-sortie amount is fitted to Air RB battles only, and
  the B-25J-30 pays 14–19% above the model (see [Rewards](#rewards)).

## License

The code is [MIT](LICENSE). The hand-tuned drop plans start from LEGION's work (see above), and the
aircraft renders, icons and weapon artwork are War Thunder's, owned by Gaijin
Entertainment — this is a fan tool, not affiliated with or endorsed by them.
