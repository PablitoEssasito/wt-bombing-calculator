"use client";

import { Coins, X } from "lucide-react";
import { useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import rewardConstantsData from "@/data/reward-constants.json";
import {
  rewardLines,
  sortieReward,
  type AircraftEconomy,
  type RewardConstants,
  type RewardLine,
} from "@/domain/reward";
import { useI18n } from "@/i18n/client";
import { setTalisman, useTalismanAircraft } from "@/lib/local-list";
import { updateRewardProfile, useRewardProfile } from "@/lib/reward-profile";
import { cn } from "@/lib/utils";

const constants = rewardConstantsData as RewardConstants;

const MODES = ["air-ab", "air-rb", "air-sb"] as const;

/**
 * The aircraft card's "Reward" lines from the game, with the player's own
 * premium account, talisman and boosters switched on or off — the multipliers a
 * sortie in this aircraft pays by, worked out as the client works them out.
 *
 * Opens on the mode the schedule is set to (Air RB for "Realistic / Sim",
 * which shares its bases); the three air modes pay differently, so it has its
 * own switch as well. With a sortie given — bases flattened and the payload's
 * multiplier — it adds what that sortie pays, in Air RB, the one mode the
 * per-base amounts have been fitted to.
 */
export function RewardPanel({
  aircraftId,
  economy,
  mode,
  sortie,
}: {
  aircraftId: string;
  economy: AircraftEconomy;
  mode: "ab" | "rb";
  /**
   * Bases flattened, their hitpoints as the schedule was planned against, and
   * `presetRewardMul` (0–1); null when the payload's multiplier isn't known.
   */
  sortie: { bases: number; baseHp: number; payload: number } | null;
}) {
  const { m, count } = useI18n();
  const profile = useRewardProfile();
  const talismans = useTalismanAircraft();
  const [picked, setPicked] = useState<0 | 1 | 2 | null>(null);
  const modeIndex = picked ?? (mode === "ab" ? 0 : 1);

  const talisman = economy.special || talismans.includes(aircraftId);
  const setup = {
    premiumAccount: profile.premiumAccount,
    talisman,
    boostersSl: profile.boostersSl,
    boostersRp: profile.boostersRp,
  };
  const { sl, rp } = rewardLines(economy, modeIndex, setup, constants);
  // Only when the schedule is planned for Air RB too: an arcade plan's base
  // count, against realistic bases' hitpoints, would be neither battle.
  const earned =
    sortie && modeIndex === 1 && mode === "rb"
      ? sortieReward(sortie.bases, sortie.baseHp, sortie.payload, rewardLines(economy, 1, setup, constants))
      : null;

  return (
    <section className="card p-4 sm:p-5 space-y-4" aria-labelledby="rewards-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="rewards-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Coins size={18} className="text-accent" aria-hidden />
          {m.rewards.title}
        </h2>
        <div role="group" aria-label={m.rewards.mode} className="flex rounded-md border border-line text-xs">
          {MODES.map((key, index) => (
            <button
              key={key}
              type="button"
              onClick={() => setPicked(index as 0 | 1 | 2)}
              aria-pressed={modeIndex === index}
              className={cn(
                "px-2.5 py-1 transition-colors",
                modeIndex === index ? "bg-accent-dim text-accent" : "text-ink-faint hover:text-ink",
              )}
            >
              {m.search.modes[key]}
            </button>
          ))}
        </div>
      </div>

      {earned && sortie ? (
        <p className="nums flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-accent/40 bg-accent-dim px-3 py-2.5">
          <span className="text-xs uppercase tracking-wider text-ink-faint">
            {m.rewards.perSortie} · {count(m.common.bases, sortie.bases)}
          </span>
          <span className="text-lg font-semibold text-ink">
            <AnimatedNumber value={earned.sl} prefix="≈ " suffix={` ${m.rewards.sl}`} />
          </span>
          <span className="text-lg font-semibold text-ink">
            <AnimatedNumber value={earned.rp} prefix="≈ " suffix={` ${m.rewards.rp}`} />
          </span>
          <span className="basis-full text-xs text-ink-faint">{m.rewards.accuracy}</span>
        </p>
      ) : sortie ? (
        <p className="text-sm text-ink-dim">{m.rewards.rbOnly}</p>
      ) : null}

      <dl className="grid gap-3 sm:grid-cols-2">
        <Line label={m.rewards.sl} line={sl} />
        <Line label={m.rewards.rp} line={rp} />
      </dl>

      <div className="flex flex-wrap gap-2">
        <Toggle
          on={profile.premiumAccount}
          onChange={(on) => updateRewardProfile({ premiumAccount: on })}
          label={m.rewards.premiumAccount}
        />
        <Toggle
          on={talisman}
          onChange={(on) => setTalisman(aircraftId, on)}
          label={m.rewards.talisman}
          lockedHint={economy.special ? m.rewards.talismanBuiltIn : null}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Boosters
          label={m.rewards.boostersSl}
          values={profile.boostersSl}
          choices={constants.boosters.sl}
          onChange={(boostersSl) => updateRewardProfile({ boostersSl })}
        />
        <Boosters
          label={m.rewards.boostersRp}
          values={profile.boostersRp}
          choices={constants.boosters.rp}
          onChange={(boostersRp) => updateRewardProfile({ boostersRp })}
        />
      </div>

    </section>
  );
}

/** "Reward 1128% SL" over "3.1 × 2.0 × (100% + 50% + 32%)", as the game lays it out. */
function Line({ label, line }: { label: string; line: RewardLine }) {
  const { m, number } = useI18n();
  const percent = (fraction: number) => `${number(Math.round(fraction * 100))}%`;
  const parts = [1, line.premiumAccount, line.talisman, line.booster].filter((part, i) => i === 0 || part > 0);
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
      <dt className="text-xs uppercase tracking-wider text-ink-faint">
        {m.rewards.reward} {label}
      </dt>
      <dd className="nums">
        <span className="text-2xl font-semibold text-accent">
          <AnimatedNumber value={Math.round(line.total * 100)} format={{ useGrouping: false }} suffix="%" />
        </span>
        <span className="block text-sm text-ink-dim">
          {number(line.multiplier)}
          {line.special !== 1 ? (
            <>
              {" × "}
              <span className="text-premium">{number(line.special, { minimumFractionDigits: 1 })}</span>
            </>
          ) : null}
          {" × ("}
          {parts.map(percent).join(" + ")}
          {")"}
        </span>
      </dd>
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
  lockedHint = null,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  /** Set when the aircraft decides this, not the player — shown instead of a working switch. */
  lockedHint?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      disabled={lockedHint !== null}
      title={lockedHint ?? undefined}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-sm transition-colors",
        on ? "border-accent bg-accent-dim text-accent" : "border-line text-ink-dim hover:text-ink hover:border-line-bright",
        lockedHint !== null && "cursor-default opacity-80",
      )}
    >
      {label}
      {lockedHint !== null ? <span className="sr-only"> — {lockedHint}</span> : null}
    </button>
  );
}

/** A currency's active boosters as removable chips, and a picker for one more. */
function Boosters({
  label,
  values,
  choices,
  onChange,
}: {
  label: string;
  values: number[];
  choices: number[];
  onChange: (values: number[]) => void;
}) {
  const { m, fill } = useI18n();
  return (
    <div className="space-y-1.5">
      <div className="text-xs uppercase tracking-wider text-ink-faint">{label}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {values.map((value, index) => (
          <button
            key={`${value}-${index}`}
            type="button"
            onClick={() => onChange(values.filter((_, i) => i !== index))}
            aria-label={fill(m.rewards.removeBooster, { n: value })}
            className="nums inline-flex items-center gap-1 rounded-md border border-accent/60 bg-accent-dim px-2 py-1 text-xs text-accent hover:border-accent"
          >
            +{value}%
            <X size={12} aria-hidden />
          </button>
        ))}
        <select
          value=""
          aria-label={m.rewards.addBooster}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (value > 0) onChange([...values, value]);
          }}
          className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-dim hover:border-line-bright"
        >
          <option value="">+ {m.rewards.addBooster}</option>
          {choices.map((value) => (
            <option key={value} value={value}>
              +{value}%
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
