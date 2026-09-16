# WT Bombing Calculator

A faster way to read [LEGION's Loadouts](https://docs.google.com/spreadsheets/d/1oNwp_MXszU5J2dcaz5IoCtSAQ-infPdOWhwtJXqtrwU/edit) —
the community spreadsheet that works out how many bombs it takes to flatten a base in
War Thunder.

Pick an aircraft and the site tells you what to drop on each base, how many bases the
payload covers, and which of its loadouts earns the most while still doing the job. All
635 aircraft and 292 bombs from the source, searchable, and reacting to your match BR,
game mode and map size.

**The data is LEGION's work.** This repo only reformats it.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run build        # static export into out/
npm test             # domain tests, including the golden test below
npm run etl          # re-import from the spreadsheet
npm run etl:cache    # re-parse cached responses without hitting the network
npm run images       # re-match and re-download the aircraft renders
```

The ETL reads an optional `GOOGLE_SHEETS_API_KEY` from `.env.local`. Without it
everything still imports, minus the source's cell notes — see [Notes](#notes).

The site is fully static: `out/` is 641 prerendered pages that can be dropped on any
host. Nothing is fetched at runtime.

## How it works

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
spreadsheet and not in this repo.

So under the conditions the source assumes (realistic battles, four-base map, the
schedule's own BR bracket) its hand-tuned numbers are shown untouched, and its own count
is what marks a base as destroyed. The two disagree on three schedules out of 1 242 —
the Lancaster I is told to put three 1000-pounders on a base where two clear the
threshold — and the source wins, because it knows things the damage column does not.
The damage delivered to each base is shown either way, so the difference stays visible.

Change the mode, the map or the bracket and the same payload gets redistributed against
the new base health instead, labelled as recalculated.

## Layout

```
scripts/etl/       import from the spreadsheet; run by hand, never during a build
  parse-bombs.ts     the bomb chart, including its unlabelled nation blocks
  parse-nations.ts   ten nation tabs into aircraft and loadouts
  aliases.ts         the handful of names the two tabs spell differently
src/data/          the committed output — the app reads only this
src/domain/        the formula and the redistribution logic, free of React
src/app/           pages; /aircraft/[id] is prerendered per aircraft
```

### Re-importing

`npm run etl` pulls each tab through Google's `gviz` CSV endpoint, rebuilds
`src/data/*.json`, and checks its own work before you commit the diff:

- every bomb named in a loadout resolves to a chart entry;
- the bomb chart still splits into exactly ten nation blocks, and each one is
  carried mostly by the nation it was assigned to;
- the formula reproduces all 1 158 counts the chart prints;
- every base the sheet calls destroyed carries enough damage to destroy it.

The first three are blocking. The last reports four bases at 94–100% of the threshold,
which are the source's own judgement calls, not import errors.

## Notes

The source hangs 762 comments off its cells — practical advice that is often the most
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

## Aircraft renders

`npm run images` fills `public/aircraft/` with two images per matched aircraft, both
re-encoded as WebP at their native size — no downscaling, since both sources are
already the size they are shown at:

- `renders/{unit}.webp` — the full 512x256 encyclopedia render, for the aircraft page.
- `icons/{unit}.webp` — the small tech-tree slot icon, ~120x66, for search tiles. This
  is the style the source spreadsheet itself uses next to each entry.

621 aircraft, 19 MB total (16 MB renders, 3.6 MB icons) — down from 68 MB of PNG at
the source resolution.

Both come from Gaijin's own encyclopedia CDN,
`static.encyclopedia.warthunder.com/{images,slots}/{unit}.png`, which is what the wiki
itself uses. **These are Gaijin's assets, mirrored here rather than hotlinked.** That is
a deliberate choice for reliability, and it is worth knowing before this repo goes
anywhere public.

The hard part is names. The sheet writes `Lancaster I`, the game calls it
`Lancaster B Mk I`; `B6N1 Mod. 11` against `B6N1 Model 11`; `Buccaneer 1` against
`Buccaneer S.1`. The matcher in `scripts/images/match.ts` works down a ladder of rules —
exact, prefix, token-subset ignoring filler words like *Mk* and *serie*, then the other
nation's tree — and accepts a rule only when it lands on exactly one candidate. That
reaches 634 of 635. The one it misses is `Do 17 J-1`, which does not exist: the game has
`Do 217 J-1`, so the source has a typo, and guessing a picture for it would be worse
than leaving the tile without one.

Names come from `window.WT_UnitList` on the wiki's aviation page, which carries each
unit's identifier, display name and country. If the wiki stops publishing it, the script
fails loudly rather than silently matching nothing.

## Bomb icons

`npm run bomb-icons` fills `public/bombs/icons/` with the game's own weapon-selector
icon for each bomb — the same small round renders (glossy orange for GP, silver for
mines, red for incendiary, olive for guided) the source spreadsheet itself pastes into
its cells. 29 distinct icons, 208 KB total, covering all 292 bombs.

These come from a different part of the datamine than the aircraft renders: the actual
game data at `aces.vromfs.bin_u/gamedata/weapons/`, one `.blkx` file per weapon, each
naming its own UI icon via an `iconType` field (e.g. `"iconType": "bombs_small"`) that
points into `atlases.vromfs.bin_u/gameuiskin/`. The icon files are 100x100 and already
sized the way the game means them to read, so nothing here resizes them — only
re-encodes the PNG as WebP.

Matching a chart bomb to its weapon file is a three-signal problem, in
`scripts/bomb-icons/match.ts`:

1. **Mass.** The sheet's `massKg` and the game's own `mass` field trace back to the same
   source value and agree to a fraction of a kilogram, which narrows ~500 weapon files
   down to a handful sharing that exact weight.
2. **Kind.** A GP bomb never gets a guided-bomb icon and a drag-retarded one always gets
   the high-drag variant — read from the game's own `guidance`/`brakeArm`/`explosiveType`
   fields and enforced as a hard filter, not a preference.
3. **Name.** Only used to break a tie once the field is already this narrow, checking
   whether one name's core letters sit inside the other's.

That reaches 259 of 292 bombs directly. The other 33 — mostly guided munitions whose
exact mass isn't in this particular slice of the datamine — fall back to the plain
bomb-family icon whose *typical* mass sits closest to theirs (nearest-median
classification, not a cutoff: the icon a bomb gets also reads its length and calibre,
not mass alone, so "small" and "middle" bombs overlap in mass across their entire range
rather than sitting on either side of a boundary). Every one of the 292 gets a real,
plausible icon; none are left blank.

## Known gaps

- **Rocket damage.** The source chart prices bombs only, so HVAR, Zuni, FFAR, RP-3 and
  M8 show up in loadouts without a damage figure and are excluded from totals.
- **One aircraft has no render**, as above.
- **Loadout availability.** Recalculated schedules assume any mix of the carried bombs
  can be taken, which the game does not always allow.
