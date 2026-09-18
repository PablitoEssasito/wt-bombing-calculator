/**
 * Unguided air-to-ground rockets, scraped from the wiki rather than the sheet.
 *
 * LEGION's Loadouts never priced rockets — its Bomb Chart only has bombs, and no
 * base-damage figure for rockets is published anywhere: not the current wiki, not
 * the old community wiki (now closed behind a login), not any surviving community
 * chart. So `damageValue` stays null here exactly as it did for the five rockets
 * the sheet already named, until someone checks the game's own "Estimated Base
 * Damage" stat in the hangar and fills it in by hand.
 *
 * What the wiki *does* publish, on every vehicle page that carries a weapon, is a
 * stats popover next to its loadout row — caliber, projectile mass, explosive
 * type and explosive mass, the same shape of data the Bomb Chart has for bombs.
 * This table is that popover's numbers for every unguided rocket type actually
 * flyable in the game (~245 rocket-carrying aircraft, deduplicated to 61 distinct
 * rocket types via the datamine's own armament catalogue — see
 * `scripts/armament/stores.ts`). Guided munitions that the datamine files under
 * the same "rocket" store kind (Kh-23M, the Nord AA/AS series, AGM-12, HS 293)
 * are deliberately left out: they are air-to-air or already-guided air-to-ground
 * weapons, not the unguided rockets this table is about, and belong with the
 * bomb chart's own guided kinds (GNSS/LAS/TV/IR) if they are ever added.
 *
 * `massKg`/`massLabel` are the projectile's own mass, not the rack's — matching
 * how bombs.json already treats every multi-round rack (`massOfStore` in
 * `scripts/armament/stores.ts` multiplies back up when pricing the rack itself).
 * `tntKg` is the wiki's own "TNT equivalent" where it states one; where the
 * filler already is TNT, its explosive mass stands in unconverted; otherwise it
 * is left null rather than guessed at.
 *
 * A few rocket types turned up more than once under different datamine short
 * names for what looks like the same real weapon (the French SNEB 68 mm rocket
 * appears as three: "SNEB type 23", "SNEB type 23 rockets" and "Type 23 SNEB").
 * They are kept as separate rows on purpose — `matchBomb` in
 * `scripts/armament/stores.ts` matches a store to a chart row by the store's own
 * name prefix, in the order the game actually spells it, so collapsing these
 * into one row would silently stop matching whichever aircraft's files use a
 * spelling the merged row no longer carries.
 *
 * `damageValue` fills in gradually — checked by hand in the hangar's own
 * "Estimated damage to bases" stat, which the game only shows for a whole
 * loadout preset (e.g. "HVAR rockets x10: 3590"), not per rocket. Where the
 * total didn't divide evenly by the preset's count, the per-rocket figure is
 * rounded to the nearest whole point — the same precision the chart's own
 * bomb figures carry — and is only as exact as that division allows.
 * `efficiency` is derived the same way the sheet's own bomb rows read:
 * damage per kilogram, rounded.
 */
export const ROCKET_ORDNANCE: ReadonlyArray<{
  chartName: string;
  fullName: string;
  massKg: number;
  massLabel: string;
  tntKg: number | null;
  damageValue?: number;
}> = [
  { chartName: "8-cm Flz.-Rakete", fullName: "8-cm Flz.-Rakete Oerlikon rockets", massKg: 12.8, massLabel: "12.8 kg", tntKg: 1.6 },
  { chartName: "AP Mk I", fullName: "AP Mk I rockets", massKg: 27.3, massLabel: "27.3 kg", tntKg: null, damageValue: 0 },
  { chartName: "AP Mk II", fullName: "AP Mk II rockets", massKg: 27.3, massLabel: "27.3 kg", tntKg: null, damageValue: 0 },
  { chartName: "ARF/8M3(AP-AT)", fullName: "ARF/8M3(AP-AT) rockets", massKg: 3.8, massLabel: "3.8 kg", tntKg: 0.474, damageValue: 41 },
  { chartName: "Aspid", fullName: "Aspid 1057 rockets", massKg: 5, massLabel: "5 kg", tntKg: 0.465 },
  { chartName: "CRV7 M247", fullName: "70 mm CRV7 M247 rocket", massKg: 10.6, massLabel: "10.6 kg", tntKg: 1.2 },
  { chartName: "FFAR", fullName: "FFAR Mighty Mouse rockets", massKg: 9, massLabel: "9 kg", tntKg: 1.2, damageValue: 105 },
  { chartName: "FZ49", fullName: "FZ49 HEAT rockets", massKg: 8.1, massLabel: "8.1 kg", tntKg: 1.2, damageValue: 103 },
  { chartName: "HVAR", fullName: "HVAR rockets", massKg: 62.8, massLabel: "62.8 kg", tntKg: 4.5, damageValue: 359 },
  { chartName: "Hydra-70 M247", fullName: "70 mm Hydra-70 M247 rocket", massKg: 10.2, massLabel: "10.2 kg", tntKg: 1.2, damageValue: 106 },
  { chartName: "M-13UK", fullName: "M-13UK rockets", massKg: 42.4, massLabel: "42.4 kg", tntKg: 4.9, damageValue: 388 },
  { chartName: "M-8", fullName: "M-8 rockets", massKg: 7.8, massLabel: "7.8 kg", tntKg: 0.64, damageValue: 60 },
  { chartName: "m/49", fullName: "18 cm hprak m/49 rockets", massKg: 120, massLabel: "120 kg", tntKg: 5.3 },
  { chartName: "m/49/56", fullName: "14,5 cm psrak m/49/56 rockets", massKg: 43, massLabel: "43 kg", tntKg: 3.5 },
  { chartName: "m/49B", fullName: "14,5 cm psrak m/49B rockets", massKg: 42, massLabel: "42 kg", tntKg: 3.5 },
  { chartName: "m/51", fullName: "15 cm srak m/51 rockets", massKg: 64, massLabel: "64 kg", tntKg: 4.5 },
  { chartName: "m/55", fullName: "7,5 cm srak m/55 Frida rockets", massKg: 8, massLabel: "8 kg", tntKg: 0.786 },
  { chartName: "m/56D", fullName: "m/56D rockets", massKg: 41, massLabel: "41 kg", tntKg: 3.7 },
  { chartName: "m/70", fullName: "13,5 cm psrak m/70 rockets", massKg: 47.7, massLabel: "47.7 kg", tntKg: 6 },
  { chartName: "M8", fullName: "M8 rocket", massKg: 17.3, massLabel: "17.3 kg", tntKg: 2, damageValue: 180 },
  { chartName: "M80", fullName: "128 mm M80 rockets", massKg: 52.7, massLabel: "52.7 kg", tntKg: 7.7, damageValue: 444 },
  { chartName: "Pampero", fullName: "Pampero rockets", massKg: 28.5, massLabel: "28.5 kg", tntKg: 3.1 },
  { chartName: "Pb2", fullName: "Pb2 rockets", massKg: 5.3, massLabel: "5.3 kg", tntKg: 1.1 },
  { chartName: "PRN-122", fullName: "PRN-122 rockets", massKg: 42, massLabel: "42 kg", tntKg: 9.8, damageValue: 476 },
  { chartName: "RBS-132", fullName: "RBS-132 rockets", massKg: 51.6, massLabel: "51.6 kg", tntKg: 1.4, damageValue: 120 },
  { chartName: "RBS-82", fullName: "RBS-82 rockets", massKg: 15, massLabel: "15 kg", tntKg: 0.48, damageValue: 42 },
  { chartName: "Red Angel", fullName: "Red Angel rockets", massKg: 478.6, massLabel: "478.6 kg", tntKg: 39.9, damageValue: 1498 },
  { chartName: "ROFS-132", fullName: "ROFS-132 rockets", massKg: 41.9, massLabel: "41.9 kg", tntKg: 4.6, damageValue: 381 },
  { chartName: "ROS-132", fullName: "ROS-132 rockets", massKg: 23.5, massLabel: "23.5 kg", tntKg: 2.5, damageValue: 329 },
  { chartName: "ROS-82", fullName: "ROS-82 rockets", massKg: 6.8, massLabel: "6.8 kg", tntKg: 0.4, damageValue: 33 },
  { chartName: "RP", fullName: "RP rockets", massKg: 4.5, massLabel: "4.5 kg", tntKg: 0.691, damageValue: 64 },
  { chartName: "RP-3", fullName: "RP-3 rockets", massKg: 43.1, massLabel: "43.1 kg", tntKg: 6.3, damageValue: 417 },
  { chartName: "RS-132", fullName: "RS-132 rockets", massKg: 42.4, massLabel: "42.4 kg", tntKg: 4.9, damageValue: 388 },
  { chartName: "RS-82", fullName: "RS-82 rockets", massKg: 7.8, massLabel: "7.8 kg", tntKg: 0.64, damageValue: 60 },
  { chartName: "RZ 65", fullName: "RZ.65 rockets", massKg: 2.8, massLabel: "2.8 kg", tntKg: 0.156 },
  { chartName: "S-13OF", fullName: "S-13OF rockets", massKg: 69, massLabel: "69 kg", tntKg: 10.6, damageValue: 488 },
  { chartName: "S-24", fullName: "S-24 rockets", massKg: 235, massLabel: "235 kg", tntKg: 25.5, damageValue: 1113 },
  { chartName: "S-24B", fullName: "S-24B rockets", massKg: 235, massLabel: "235 kg", tntKg: 25.5, damageValue: 1113 },
  { chartName: "S-25O", fullName: "S-25O rockets", massKg: 370, massLabel: "370 kg", tntKg: 58, damageValue: 1680 },
  { chartName: "S-25OF", fullName: "S-25OF rockets", massKg: 367, massLabel: "367 kg", tntKg: 27, damageValue: 1153 },
  { chartName: "S-25OFM", fullName: "S-25OFM rockets", massKg: 367, massLabel: "367 kg", tntKg: 20, damageValue: 825 },
  { chartName: "S-3K", fullName: "S-3K rockets", massKg: 23.5, massLabel: "23.5 kg", tntKg: 3.2, damageValue: 355 },
  { chartName: "S-5KP", fullName: "S-5KP rockets", massKg: 5, massLabel: "5 kg", tntKg: 0.528, damageValue: 47 },
  { chartName: "S-8KO", fullName: "S-8KO rockets", massKg: 11.3, massLabel: "11.3 kg", tntKg: 1.4, damageValue: 122 },
  { chartName: "Skyfire-70 AC/AP", fullName: "70 mm Skyfire-70 AC/AP rocket", massKg: 11.3, massLabel: "11.3 kg", tntKg: 1.2, damageValue: 106 },
  { chartName: "SNEB type 23", fullName: "SNEB type 23 rockets", massKg: 5.1, massLabel: "5.1 kg", tntKg: 0.435 },
  { chartName: "SNEB type 23 rockets", fullName: "Type 23 SNEB rockets", massKg: 5.1, massLabel: "5.1 kg", tntKg: 0.435, damageValue: 37 },
  { chartName: "T-80-P 3", fullName: "Type R80 SURA rockets T-80-P 3", massKg: 11.9, massLabel: "11.9 kg", tntKg: 0.917, damageValue: 82 },
  { chartName: "T-80-US 3", fullName: "Type R80 SURA rockets T-80-US 3", massKg: 11.9, massLabel: "11.9 kg", tntKg: 0.87, damageValue: 78 },
  { chartName: "T10 140", fullName: "T10 140 rockets", massKg: 28, massLabel: "28 kg", tntKg: 2.5, damageValue: 330 },
  { chartName: "T10 151", fullName: "T10 151 rockets", massKg: 28, massLabel: "28 kg", tntKg: 2.1, damageValue: 311 },
  { chartName: "TBA ECC", fullName: "TBA ECC rockets", massKg: 38.8, massLabel: "38.8 kg", tntKg: 3.6, damageValue: 362 },
  { chartName: "TBA Multi-Dart 100 AB", fullName: "TBA Multi-Dart 100 AB rockets", massKg: 40.5, massLabel: "40.5 kg", tntKg: null, damageValue: 0 },
  { chartName: "Tiny Tim", fullName: "Tiny Tim rockets", massKg: 534.2, massLabel: "534.2 kg", tntKg: 67.4, damageValue: 1774 },
  { chartName: "Type 130-2", fullName: "Type 130-2 rockets", massKg: 46, massLabel: "46 kg", tntKg: 7.7, damageValue: 444 },
  { chartName: "Type 23 SNEB", fullName: "Type 23 SNEB rockets", massKg: 5.1, massLabel: "5.1 kg", tntKg: 0.435, damageValue: 37 },
  { chartName: "Type 90-1 HEAT", fullName: "Type 90-1 HEAT rockets", massKg: 14.6, massLabel: "14.6 kg", tntKg: 1.1, damageValue: 98 },
  { chartName: "Uncle Tom", fullName: "Uncle Tom rockets", massKg: 467.2, massLabel: "467.2 kg", tntKg: 51.3, damageValue: 1613 },
  { chartName: "Wfr.Gr.21", fullName: "Wfr.Gr.21 rockets", massKg: 112, massLabel: "112 kg", tntKg: null },
  { chartName: "Yasser", fullName: "Yasser rockets", massKg: 760, massLabel: "760 kg", tntKg: 206.6, damageValue: 3633 },
  { chartName: "Zuni", fullName: "Zuni Mk32 Mod 0 ATAP rockets", massKg: 57.3, massLabel: "57.3 kg", tntKg: 8.9, damageValue: 463 },
];
