/**
 * Base hitpoints as the game's own mission templates set them.
 *
 * A template's trigger for each band of balance levels (the match's BR, in
 * the same thirds `wpcost.blk` counts economic rank in) sets the base's HP in
 * a variable, which `missionSetBombingArea` then hands the base. Its
 * `varCompareInt` conditions name the band; its comment ("6000 dlya istorii")
 * says what the number is for.
 */

export type HpBand = {
  /** Highest balance level the band covers; null for the last, open-ended one. */
  maxLevel: number | null;
  hp: number;
  /** What arcade battles multiply it by, where the template sets that too. */
  arcadeMul?: number;
};

type Blk = Record<string, unknown>;
const many = <T,>(value: unknown): T[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]) as T[];

/** Every trigger in a template, however deep it sits in categories. */
function triggersOf(template: Blk): Blk[] {
  const out: Blk[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    for (const value of Object.values(node as Blk)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if ("conditions" in (value as Blk) && "actions" in (value as Blk)) out.push(value as Blk);
        walk(value);
      }
    }
  };
  walk(template.triggers ?? template);
  return out;
}

/**
 * The HP bands a template sets into `variable`, lowest level first — read off
 * the triggers that compare the balance level and set the variable.
 */
export function hpBands(template: Blk, variable: string, arcadeVariable?: string): HpBand[] {
  const bands: HpBand[] = [];
  for (const trigger of triggersOf(template)) {
    const conditions = (trigger.conditions ?? {}) as Blk;
    const compares = many<{ var_value?: string; value?: number; comparasion_func?: string }>(conditions.varCompareInt)
      .filter((c) => typeof c.var_value === "string" && c.var_value.endsWith("balance_level"));
    if (compares.length === 0) continue;
    const sets = many<{ var?: string; value?: number }>(((trigger.actions ?? {}) as Blk).varSetReal);
    const hp = sets.find((s) => s.var === variable)?.value;
    if (typeof hp !== "number") continue;
    const less = compares.find((c) => c.comparasion_func === "less")?.value;
    const arcadeMul = arcadeVariable ? sets.find((s) => s.var === arcadeVariable)?.value : undefined;
    bands.push({
      maxLevel: typeof less === "number" ? less - 1 : null,
      hp,
      ...(typeof arcadeMul === "number" ? { arcadeMul } : {}),
    });
  }
  // One band per level range: a template states the last one twice over.
  const unique = new Map(bands.map((band) => [band.maxLevel, band]));
  return [...unique.values()].sort((a, b) => (a.maxLevel ?? Infinity) - (b.maxLevel ?? Infinity));
}

/** What `missionSetBombingArea` states beside the HP: the share left to burn out, and how fast. */
export function fireOf(template: Blk): { hpFireMult: number; fireSpeed: number } | null {
  let found: { hpFireMult: number; fireSpeed: number } | null = null;
  const walk = (node: unknown) => {
    if (found || !node || typeof node !== "object") return;
    const area = (node as Blk).missionSetBombingArea as Blk | undefined;
    if (area && typeof area.hpFireMult === "number" && typeof area.fireSpeed === "number") {
      found = { hpFireMult: area.hpFireMult, fireSpeed: area.fireSpeed };
      return;
    }
    for (const value of Object.values(node as Blk)) walk(value);
  };
  walk(template);
  return found;
}

/** The balance level a battle rating falls in: its economic rank, three to a whole BR. */
export const levelOfBr = (br: number) => Math.round((br - 1) * 3);
