/**
 * The game's localisation files: `;`-separated, every field double-quoted, a
 * header row naming each language as `<English>`, `<Polish>` and so on.
 * Returns the header's names (brackets stripped) and each row keyed by its ID.
 */
export function parseLangCsv(text: string): { columns: string[]; rows: Map<string, string[]> } {
  const lines = text.split(/\r?\n/);
  const columns = splitRow(lines[0] ?? "").map((name) => name.replace(/^<|>$/g, "").split("|")[0]);
  const rows = new Map<string, string[]>();
  for (const line of lines.slice(1)) {
    if (!line.startsWith('"')) continue;
    const fields = splitRow(line);
    if (fields[0]) rows.set(fields[0], fields);
  }
  return { columns, rows };
}

/** One row's fields: quoted, `;`-separated, a doubled quote standing for one. */
export function splitRow(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] !== '"') {
      // An unquoted (empty) field — the files end rows with a bare ";;".
      const end = line.indexOf(";", i);
      fields.push(end === -1 ? line.slice(i) : line.slice(i, end));
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    let value = "";
    i++;
    while (i < line.length) {
      if (line[i] === '"' && line[i + 1] === '"') {
        value += '"';
        i += 2;
      } else if (line[i] === '"') {
        i++;
        break;
      } else {
        value += line[i++];
      }
    }
    fields.push(value);
    if (line[i] === ";") i++;
  }
  // A separator at the very end opens one last, empty field.
  if (line.endsWith(";")) fields.push("");
  return fields;
}

/**
 * Characters the game's own font draws as little icons — the nation a captured
 * or licence-built aircraft came from ("◊Ił-28", "▄Ил-2"), and the like. Any
 * other font shows them as stray shapes, so they are dropped: block elements,
 * geometric shapes, control pictures and the private-use area.
 */
const GAME_FONT_MARKS = /[\u2400-\u243f\u2580-\u25ff\ue000-\uf8ff]/g;

/**
 * ID to the English text and one language's, trimmed — the files pad some
 * entries with stray spaces and zero-width spaces. `translated` is empty when
 * the language has no entry of its own.
 */
export function langColumns(
  table: { columns: string[]; rows: Map<string, string[]> },
  english: string,
  language: string,
): Map<string, { english: string; translated: string }> {
  const en = table.columns.indexOf(english);
  const other = table.columns.indexOf(language);
  if (en === -1 || other === -1) throw new Error(`no ${english}/${language} column in the header`);
  const clean = (value: string | undefined) =>
    (value ?? "").replace(/\u200b/g, "").replace(GAME_FONT_MARKS, "").replace(/\s+/g, " ").trim();
  const result = new Map<string, { english: string; translated: string }>();
  for (const [id, fields] of table.rows) {
    result.set(id, { english: clean(fields[en]), translated: clean(fields[other]) });
  }
  return result;
}
