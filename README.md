# WT Bombing Calculator

[![Deploy](https://github.com/PablitoEssasito/wt-bombing-calculator/actions/workflows/deploy.yml/badge.svg)](https://github.com/PablitoEssasito/wt-bombing-calculator/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Live at [pablitoessasito.github.io/wt-bombing-calculator](https://pablitoessasito.github.io/wt-bombing-calculator/).**

A faster way to read [LEGION's Loadouts](https://docs.google.com/spreadsheets/d/1oNwp_MXszU5J2dcaz5IoCtSAQ-infPdOWhwtJXqtrwU/edit) —
the community spreadsheet that works out how many bombs it takes to flatten a base in
War Thunder — plus a loadout creator built straight from the game's own data files, for
building any pylon combination the spreadsheet does not spell out.

Pick an aircraft and the site tells you what to drop on each base, how many bases the
payload covers, and which of its loadouts earns the most while still doing the job. All
648 aircraft and 348 bombs and rockets from the source, searchable, and reacting to your
match BR, game mode and map size.

**The loadout data is LEGION's work.** This repo only reformats it, and adds a second,
independent way to build a loadout from the game's own files.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run build         # static export into out/
npm test              # domain tests, including the golden test below
npm run lint           # eslint

npm run etl            # re-import from the spreadsheet
npm run etl:cache      # re-parse cached responses without hitting the network
npm run images         # re-match and re-download aircraft renders and tech-tree icons
npm run stores         # re-catalogue every weapon the game's hardpoints can hang
npm run armament       # re-derive the loadout creator's data from the datamine
npm run armament:fetch # only pull the flight models, which stores reads — see below
npm run bomb-icons     # re-match the bomb chart's own weapon-selector icons
npm run battle-ratings # every mode's BR from the game's files; overwrites the sheet's Air RB
npm run changelog      # record what this import changed, for /changelog — run last
```

After an import, run the steps in order — `etl`, `images`, `armament:fetch`, `stores`,
`armament:cache`, `bomb-icons`, `battle-ratings`, `changelog` — since each reads what the one before it wrote. `changelog` compares the data
on disk against its last commit, so it belongs after everything else and before committing;
running it again before the commit rewrites the same entry rather than adding another, and an
import within a patch that already has an entry folds into it.

`.github/workflows/data-import.yml` runs that whole import every morning and opens (or
refreshes) one pull request when the game or the sheet changed anything; its header lists the
one-time setup. With the repo variable `AUTO_MERGE_DATA_IMPORTS=true` it also merges and
deploys, but only when lint, tests and build pass on the new data.

The ETL reads an optional `GOOGLE_SHEETS_API_KEY` from `.env.local`. Without it
everything still imports, minus the source's cell notes — see [Notes](#notes). Every
script above also takes a `:cache` variant that reuses whatever it already pulled instead
of hitting the network again.

The site is fully static: `out/` is 654 prerendered pages that can be dropped on any
host. Nothing is fetched at runtime. Set `NEXT_PUBLIC_SITE_URL` to the real deployment
origin before building for production — it is what the sitemap, `robots.txt` and every
Open Graph tag use to build an absolute URL; unset, it falls back to `localhost:3000`,
which is only ever right for `next dev`.

Set `NEXT_PUBLIC_GA_ID` to a GA4 measurement id (`G-XXXXXXXXXX`) to load Google
Analytics (`@next/third-parties`); unset, the site ships with no analytics script at
all, which is also what `next dev` and a plain `npm run build` get. The deploy workflow
reads this from a `NEXT_PUBLIC_GA_ID` repository variable (Settings → Secrets and
variables → Actions → Variables) rather than a hardcoded id — a measurement id isn't
sensitive, but there is no reason to commit one either.

## How the drop schedule works

Two numbers carry the whole thing, both recovered from the source spreadsheet:

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

Arcade bases carry double health; three-base maps take about half the payload.

### Why the drop schedules are imported rather than computed

The counts in the source are not a plain `ceil()`. The Pe-8 needs seven FAB-100s per
10 000 HP base, but the sheet says eight — because the aircraft can only take those
bombs as one fixed block of forty, and spreading the surplus beats wasting it. Those
judgements depend on which loadouts the game actually offers, which is not in the
spreadsheet.

So under the conditions the source assumes (realistic battles, four-base map, the
schedule's own BR bracket) its hand-tuned numbers are shown untouched, and its own count
is what marks a base as destroyed. Three schedules count a higher total than they have
cells to describe — the sheet runs out of columns and writes the rest as `"+ 2"`, or
simply undercounts by one — and the site says so on the page rather than either dropping
the extra bases or inventing a load for them.

Change the mode, the map or the bracket and the same payload gets redistributed against
the new base health instead, labelled as recalculated.

## The loadout creator

The spreadsheet is one hand-picked answer per aircraft. Underneath it, the game itself
offers pylon-by-pylon choice on 487 of the 648 aircraft — mass limits, mutual
exclusions, dependent stores — none of which the spreadsheet states. The creator reads
that structure straight from the [War Thunder datamine](https://github.com/gszabi99/War-Thunder-Datamine)
and lets you build any combination the game would actually let you fly, priced the same
way the drop schedule is.

`scripts/armament/` does the reading: `parse.ts` turns one aircraft's flight model and
weapon presets into hardpoints, mass limits and ban/require rules; `stores.ts` builds a
standalone catalogue of every weapon file any aircraft can hang — its mass, its
bomb-chart match, how many rounds a rack or rail actually holds, and the game's own UI
icon for it; `index.ts` joins the two into `src/data/armament.json`, written compactly
(every store interned once, referred to by index) since the raw hardpoint data is the
largest file this project ships.

Icons come from two places, both landing in `public/bombs/icons/` regardless of which
pulled them: `scripts/bomb-icons/` matches every bomb and rocket in the chart to the
weapon file that prices it (see below), while `scripts/armament/index.ts` separately
downloads whatever a hardpoint preset states its own icon as — a twin missile rail draws
differently from a lone one off the same file, and only the preset itself knows which.

The creator enforces what the game's files state plainly — the mass limit, mutual
exclusions — and flags what they only imply — an unmet dependency — without blocking on
it. What it cannot check: the per-wing and balance limits the game also states, since
nothing in the flight model says which wing a hardpoint sits on.

## Layout

```
scripts/etl/         import from the spreadsheet; run by hand, never during a build
  parse-bombs.ts        the bomb chart, including its unlabelled nation blocks
  parse-nations.ts      ten nation tabs into aircraft and loadouts
  rockets.ts             rocket damage, checked by hand against the game's own stats
  aliases.ts              names the sheet spells differently from the chart, or misspells outright
scripts/armament/     the loadout creator's data, read from the datamine
scripts/bomb-icons/   the bomb chart's own weapon-selector icons
scripts/images/       aircraft renders and tech-tree icons, matched off the wiki
src/data/             the committed output — the app reads only this
src/domain/           the formula and the redistribution logic, free of React
src/app/               pages; /aircraft/[id] is prerendered per aircraft
```

### Re-importing

`npm run etl` pulls each tab through Google's `gviz` CSV endpoint, rebuilds
`src/data/{aircraft,bombs,meta}.json`, and checks its own work before you commit the
diff:

- every bomb named in a loadout resolves to a chart entry;
- the bomb chart still splits into exactly ten nation blocks, and each one is
  carried mostly by the nation it was assigned to;
- the formula reproduces all 1 158 counts the chart prints;
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

The spreadsheet's own Bomb Chart prices bombs only — no base-damage figure for rockets
is published anywhere, not the current wiki, the old community wiki, or any surviving
community chart. `scripts/etl/rockets.ts` fills in all 61 unguided rocket types actually
flyable in the game by hand, checked a batch at a time against the game's own "Estimated
damage to bases" hangar stat. A handful of kinetic rounds with no explosive filler (AP Mk
I/II, TBA Multi-Dart 100 AB) are priced at zero rather than left unchecked — real
numbers, not a placeholder for "unknown." Guided munitions the datamine files under the
same "rocket" store kind — the Kh-23M, the Nord AA/AS series, AGM-12, HS 293 — are
deliberately left out, being air-to-air or already-guided weapons rather than the
unguided rockets this table is about.

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
pastes into its cells. 65 distinct icon keys across the bomb chart, part of the 342 the
site ships in total once the loadout creator's own icons — missiles, gun pods, tanks —
are added on top.

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

Most of the chart matches directly. What is left — mostly guided munitions whose exact
mass is not in this slice of the datamine — falls back to the plain bomb-family icon
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

## Known gaps

- **Loadout availability.** Recalculated schedules assume any mix of the carried bombs
  can be taken, which the game does not always allow; the loadout creator's own mass and
  exclusion rules do not have that problem, but check per-wing/balance limits, which
  nothing in the flight model attributes to a specific wing.

## License

The code is [MIT](LICENSE). The loadout data is LEGION's own work (see above), and the
aircraft renders, icons and weapon artwork are War Thunder's, owned by Gaijin
Entertainment — this is a fan tool, not affiliated with or endorsed by them.
