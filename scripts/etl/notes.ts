import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SHEET_ID } from "./config";

const CACHE_DIR = path.join(process.cwd(), ".cache", "notes");

/** Notes for one tab, keyed by `${row},${column}` against the CSV grid. */
export type NoteGrid = Map<string, string>;

export const noteKey = (row: number, column: number) => `${row},${column}`;

type ApiCell = { formattedValue?: string; note?: string };
type ApiRow = { values?: ApiCell[] };

async function fetchGrid(title: string, key: string, useCache: boolean): Promise<ApiRow[]> {
  const cachePath = path.join(CACHE_DIR, `${encodeURIComponent(title)}.json`);

  if (useCache) {
    try {
      return JSON.parse(await readFile(cachePath, "utf8")) as ApiRow[];
    } catch {
      // Not cached yet — fall through and download it.
    }
  }

  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?key=${key}` +
    `&includeGridData=true&ranges=${encodeURIComponent(title)}` +
    `&fields=sheets(data(rowData(values(formattedValue,note))))`;

  const response = await fetch(url);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Sheets API ${response.status} for ${title}: ${detail.slice(0, 200)}`);
  }
  const body = await response.json();
  const rows: ApiRow[] = body.sheets?.[0]?.data?.[0]?.rowData ?? [];

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, JSON.stringify(rows), "utf8");
  return rows;
}

/** Tab titles carry flag emoji, so the gid is mapped to a title rather than guessed. */
export async function fetchSheetTitles(key: string): Promise<Map<string, string>> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?key=${key}` +
    `&fields=sheets.properties(sheetId,title)`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Sheets API ${response.status} while listing tabs`);
  const body = await response.json();
  return new Map(
    (body.sheets ?? []).map((s: { properties: { sheetId: number; title: string } }) => [
      String(s.properties.sheetId),
      s.properties.title,
    ]),
  );
}

const normalize = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

/**
 * Reads a tab's notes and lines them up with the CSV grid the rest of the ETL uses.
 *
 * The two exports disagree on row numbering: the API returns the sheet as it is
 * laid out, while the gviz CSV silently drops rows that are entirely empty. So
 * the API grid is compacted the same way and then checked against the CSV cell by
 * cell. A single mismatch means the assumption no longer holds and notes would be
 * pinned to the wrong aircraft, so none are returned at all — wrong notes are
 * worse than no notes.
 */
export function alignNotes(apiRows: ApiRow[], csvRows: string[][]): NoteGrid | null {
  const compacted = apiRows.filter((row) =>
    (row.values ?? []).some((cell) => normalize(cell.formattedValue) !== ""),
  );

  for (let r = 0; r < Math.max(compacted.length, csvRows.length); r++) {
    const apiValues = compacted[r]?.values ?? [];
    const csvValues = csvRows[r] ?? [];
    const width = Math.max(apiValues.length, csvValues.length);
    for (let c = 0; c < width; c++) {
      if (normalize(apiValues[c]?.formattedValue) !== normalize(csvValues[c])) return null;
    }
  }

  const notes: NoteGrid = new Map();
  compacted.forEach((row, r) =>
    (row.values ?? []).forEach((cell, c) => {
      const note = cell.note?.trim();
      if (note) notes.set(noteKey(r, c), note);
    }),
  );
  return notes;
}

export async function loadNotes(
  title: string,
  csvRows: string[][],
  key: string,
  useCache: boolean,
): Promise<NoteGrid | null> {
  return alignNotes(await fetchGrid(title, key, useCache), csvRows);
}
