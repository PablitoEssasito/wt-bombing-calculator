import { describe, expect, it } from "vitest";
import { fill, formatNumber, plural } from "../format";
import { localePath, splitLocale } from "../locales";
import { messagesFor } from "../messages";

type Tree = { [key: string]: unknown };

/** Every leaf of a dictionary, by its dotted path. */
function leaves(tree: unknown, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (typeof tree === "string") {
    out.set(prefix, tree);
    return out;
  }
  for (const [key, value] of Object.entries(tree as Tree)) {
    for (const [path, leaf] of leaves(value, prefix ? `${prefix}.${key}` : key)) out.set(path, leaf);
  }
  return out;
}

/** The `{name}` placeholders a text fills in. */
const slots = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("dictionaries", () => {
  const en = leaves(messagesFor("en"));

  for (const locale of ["pl", "ru"] as const) {
    const other = leaves(messagesFor(locale));

    it(`${locale} says everything English does, and nothing else`, () => {
      // Plural forms beyond one/other are the language's own, so compare paths
      // without them.
      const strip = (keys: Iterable<string>) =>
        new Set([...keys].map((key) => key.replace(/\.(one|few|many|other)$/, "")));
      expect(strip(other.keys())).toEqual(strip(en.keys()));
    });

    it(`${locale} leaves nothing blank`, () => {
      const blank = [...other].filter(([, text]) => typeof text === "string" && text.trim() === "");
      expect(blank).toEqual([]);
    });

    it(`${locale} fills the same slots as English`, () => {
      const mismatched = [...en]
        .filter(([path]) => other.has(path))
        .filter(([path, text]) => JSON.stringify(slots(String(text))) !== JSON.stringify(slots(String(other.get(path)))))
        .map(([path]) => path);
      expect(mismatched).toEqual([]);
    });

    it(`${locale} gives a count every form its language needs`, () => {
      const counts = [...other.keys()].filter((key) => key.endsWith(".one")).map((key) => key.slice(0, -4));
      for (const count of counts) {
        expect(other.has(`${count}.few`), `${count}.few`).toBe(true);
        expect(other.has(`${count}.many`), `${count}.many`).toBe(true);
      }
    });
  }
});

describe("plural", () => {
  const bases = messagesFor("pl").common.bases;

  it("picks the Polish form a number takes", () => {
    expect(plural("pl", bases, 1)).toBe("1 baza");
    expect(plural("pl", bases, 3)).toBe("3 bazy");
    expect(plural("pl", bases, 5)).toBe("5 baz");
    expect(plural("pl", bases, 22)).toBe("22 bazy");
  });

  it("picks the Russian one too", () => {
    const ru = messagesFor("ru").common.bases;
    expect(plural("ru", ru, 1)).toBe("1 база");
    expect(plural("ru", ru, 21)).toBe("21 база");
    expect(plural("ru", ru, 4)).toBe("4 базы");
    expect(plural("ru", ru, 11)).toBe("11 баз");
  });

  it("keeps English as it always read", () => {
    const en = messagesFor("en").common.bases;
    expect(plural("en", en, 1)).toBe("1 base");
    expect(plural("en", en, 4)).toBe("4 bases");
    expect(formatNumber("en", 25900)).toBe("25,900");
  });

  it("fills named slots and leaves unknown ones as written", () => {
    expect(fill("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });
});

describe("locale paths", () => {
  it("prefixes every language but English", () => {
    expect(localePath("en", "/bombs/")).toBe("/bombs/");
    expect(localePath("pl", "/bombs/")).toBe("/pl/bombs/");
    expect(localePath("ru", "/")).toBe("/ru/");
  });

  it("splits a path back into its language and English path", () => {
    expect(splitLocale("/pl/aircraft/usa-a-10a/")).toEqual({ locale: "pl", path: "/aircraft/usa-a-10a/" });
    expect(splitLocale("/ru")).toEqual({ locale: "ru", path: "/" });
    expect(splitLocale("/bombs/")).toEqual({ locale: "en", path: "/bombs/" });
    // A word that only starts like a language code is not one.
    expect(splitLocale("/plans/")).toEqual({ locale: "en", path: "/plans/" });
  });
});
