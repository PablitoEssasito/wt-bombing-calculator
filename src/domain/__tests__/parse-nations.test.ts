import { describe, expect, it } from "vitest";
import { BOMB_COL, NATION_COL } from "../../../scripts/etl/config";
import { parseBombs, type BombIndex } from "../../../scripts/etl/parse-bombs";
import { parseNation, shownNote } from "../../../scripts/etl/parse-nations";
import type { NoteGrid } from "../../../scripts/etl/notes";

/** Wraps a field the way RFC 4180 requires whenever it holds a comma, quote or newline. */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const csvOf = (rows: string[][]) => rows.map((row) => row.map(csvCell).join(",")).join("\n");

const NATION_WIDTH = 35;
const blankRow = () => Array(NATION_WIDTH).fill("");

const rankRow = (roman: string) => {
  const row = blankRow();
  row[NATION_COL.rank] = `${roman} rank`;
  return row;
};

/** One aircraft's heading + first schedule row, the fields a test actually needs. */
function aircraftRow(fields: {
  name: string;
  br: number;
  noteMarker?: string;
  bases?: Record<number, string>;
  bracket?: string;
  basesDestroyed?: string;
  rewardMultiplier?: string;
  category?: string;
}): string[] {
  const row = blankRow();
  row[NATION_COL.nameAndBr] = `${fields.name} ${fields.br}`;
  row[NATION_COL.noteMarker] = fields.noteMarker ?? "";
  for (const [col, text] of Object.entries(fields.bases ?? {})) {
    row[NATION_COL.basesStart + Number(col)] = text;
  }
  row[NATION_COL.bracket] = fields.bracket ?? "";
  row[NATION_COL.basesDestroyed] = fields.basesDestroyed ?? "";
  row[NATION_COL.rewardMultiplier] = fields.rewardMultiplier ?? "";
  row[NATION_COL.category] = fields.category ?? "X";
  return row;
}

/** A continuation row: same loadout, a higher BR bracket, no target count of its own. */
function continuationRow(fields: { bases?: Record<number, string>; bracket?: string }): string[] {
  const row = blankRow();
  for (const [col, text] of Object.entries(fields.bases ?? {})) {
    row[NATION_COL.basesStart + Number(col)] = text;
  }
  row[NATION_COL.bracket] = fields.bracket ?? "";
  return row;
}

/** A tiny Bomb Chart with just enough entries for these fixtures to name. */
function fixtureBombs(): BombIndex {
  const row = (chartName: string, fullName: string, damage: number) => {
    const cells = Array(17).fill("");
    cells[BOMB_COL.chartName] = chartName;
    cells[BOMB_COL.fullName] = fullName;
    cells[BOMB_COL.kind] = "GP";
    cells[BOMB_COL.damage] = String(damage);
    return cells.join(",");
  };
  return parseBombs(
    [
      // Climbing damage keeps these three in one block — the first block the
      // parser sees, always read as BOMB_CHART_NATION_ORDER[0] ("usa").
      row("AN-M57", "250 lb AN-M57", 1000),
      row("AN-M64A1", "500 lb AN-M64A1", 2000),
      row("Mk 77", "USA Mk 77 mod 4", 3000),
      // The drop back down starts the next block ("germany"), which spells
      // "Mk 77" the same way for a different bomb — the shared index alone
      // cannot tell a loadout naming it which one is meant.
      row("FC250", "250 kg FC250", 500),
      row("Mk 77", "German Mk 77", 1500),
    ].join("\n"),
  );
}

describe("parseNation", () => {
  it("reads one cell naming two bombs as two items on the same base, not two bases", () => {
    // Wrapped text can put a linebreak inside a single cell either way — between
    // the count and the × ("FC250\n× 1") or between two bomb entries entirely.
    const csv = csvOf([
      rankRow("I"),
      aircraftRow({
        name: "Test Plane",
        br: 1.3,
        bases: { 0: "AN-M57 × 2\nAN-M64A1 × 2" },
        basesDestroyed: "1",
        rewardMultiplier: "5",
      }),
    ]);

    const { aircraft } = parseNation(csv, "usa", fixtureBombs());
    const schedule = aircraft[0].options[0].schedules[0];

    expect(schedule.bases).toHaveLength(1);
    expect(schedule.bases[0].items.map((i) => i.count)).toEqual([2, 2]);
  });

  it("does not read the overflow marker past ten bases as a bomb", () => {
    const csv = csvOf([
      rankRow("I"),
      aircraftRow({
        name: "Test Plane",
        br: 1.3,
        bases: { 0: "FC250 × 1", 9: "+ 2" },
        basesDestroyed: "3",
        rewardMultiplier: "4",
      }),
    ]);

    const { aircraft } = parseNation(csv, "usa", fixtureBombs());
    const schedule = aircraft[0].options[0].schedules[0];

    // One real base from the loadout; "+ 2" contributes nothing to parse as a
    // bomb, so schedule.bases stays at the one cell that actually named one —
    // the gap between it and basesDestroyed is what unlistedBases (schedule.ts)
    // recovers, not this parser.
    expect(schedule.bases).toHaveLength(1);
    expect(schedule.basesDestroyed).toBe(3);
  });

  it("groups a bracket-only row into the loadout above it rather than starting a new one", () => {
    const csv = csvOf([
      rankRow("I"),
      aircraftRow({
        name: "Test Plane",
        br: 1.3,
        bases: { 0: "FC250 × 1" },
        bracket: "▲ 2.0",
        basesDestroyed: "1",
        rewardMultiplier: "5",
      }),
      continuationRow({ bases: { 0: "FC250 × 2" }, bracket: "2.3 ▼" }),
    ]);

    const { aircraft } = parseNation(csv, "usa", fixtureBombs());

    // Both rows are one loadout with two BR-bracket schedules, not two loadouts.
    expect(aircraft[0].options).toHaveLength(1);
    expect(aircraft[0].options[0].schedules).toHaveLength(2);
    expect(aircraft[0].options[0].schedules[0].bracket).toEqual({ kind: "max", br: 2.0 });
    expect(aircraft[0].options[0].schedules[1].bracket).toEqual({ kind: "min", br: 2.3 });
  });

  it("reads whether a note argues against the loadout from its wording, not its marker", () => {
    const csv = csvOf([
      rankRow("I"),
      aircraftRow({
        name: "Test Plane",
        br: 1.3,
        noteMarker: "?",
        bases: { 0: "FC250 × 1" },
        basesDestroyed: "1",
        rewardMultiplier: "5",
      }),
    ]);
    const notes: NoteGrid = new Map([["1,5", "I wouldn't recommend using this loadout — take the other one."]]);

    const { aircraft } = parseNation(csv, "usa", fixtureBombs(), notes);

    expect(aircraft[0].options[0].noteMarker).toBe("?");
    expect(aircraft[0].options[0].discouraged).toBe(true);
  });

  it("resolves a name two nations spell alike against its own block, not the other one's", () => {
    const bombs = fixtureBombs();
    const csv = csvOf([
      rankRow("I"),
      aircraftRow({
        name: "Test Plane",
        br: 1.3,
        bases: { 0: "Mk 77 × 1" },
        basesDestroyed: "1",
        rewardMultiplier: "5",
      }),
    ]);

    const usa = parseNation(csv, "usa", bombs);
    const germany = parseNation(csv, "germany", bombs);

    expect(usa.unresolved).toEqual([]);
    expect(germany.unresolved).toEqual([]);
    const bombIdIn = (result: typeof usa) => result.aircraft[0].options[0].schedules[0].bases[0].items[0].bombId;
    expect(bombIdIn(usa)).not.toBe(bombIdIn(germany));
    expect(bombs.bombs.find((b) => b.id === bombIdIn(usa))?.fullName).toBe("USA Mk 77 mod 4");
    expect(bombs.bombs.find((b) => b.id === bombIdIn(germany))?.fullName).toBe("German Mk 77");
  });
});

describe("shownNote", () => {
  it("drops a caveat that says nothing about the loadout, marker and all", () => {
    expect(shownNote("Thanks to Zyszhao for providing this loadout.", "?")).toEqual({ note: null, noteMarker: null });
    expect(shownNote("Reward multiplier for bases: 9.2", "?")).toEqual({ note: null, noteMarker: null });
  });

  it("keeps a star's heading when its note only repeated it", () => {
    expect(shownNote("Recommended loadout.\n\nReward multiplier for bases: 7.0", "star")).toEqual({ note: "", noteMarker: "star" });
  });

  it("cuts the noise out of a note and keeps the advice", () => {
    expect(shownNote("Recommended loadout.\n\nThe fuel drop tanks are optional.", "star").note).toBe(
      "The fuel drop tanks are optional.",
    );
    expect(shownNote("Thanks to olzen for providing this loadout. The SNEB type 23 rocket pods are optional.", "?").note).toBe(
      "The SNEB type 23 rocket pods are optional.",
    );
    expect(
      shownNote("Take the retarded bombs. Thanks to Tehzlobny for testing the L.D 1000 lb H.E. M.C Mk.1 bombs.", "?").note,
    ).toBe("Take the retarded bombs.");
  });

  it("leaves a note the import couldn't read as it is", () => {
    expect(shownNote(null, "!")).toEqual({ note: null, noteMarker: "!" });
  });
});
