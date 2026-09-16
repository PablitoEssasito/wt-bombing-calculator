/** Minimal RFC 4180 parser. Fields may contain commas, quotes and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch !== '"') {
        field += ch;
      } else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = false;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Reads a cell, tolerating rows that the export truncated to fewer columns. */
export function cell(row: string[], index: number): string {
  return (row[index] ?? "").trim();
}

/**
 * Collapses a cell to one line.
 *
 * Wrapped text in the source splits a single entry across lines, so "FC250 × 1"
 * can arrive as "FC250\n× 1". Joining with a space makes both shapes parse the
 * same way, and keeps genuinely multi-entry cells separable.
 */
export function flatten(value: string): string {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}
