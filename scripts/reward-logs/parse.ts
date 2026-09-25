/**
 * Reads what a decoded game log says about each battle's rewards: the mode it
 * was queued in, the aircraft and preset the player took up, and every reward
 * the HUD announced — `addScoreMessage et:<event> xp:<RP> wp:<SL>` — with the
 * kill-feed line printed at the same moment, which names what was hit.
 *
 * What each event type means isn't stated anywhere; from the logs so far:
 * 17 damage to a base and 3 its destruction (neither prints a kill-feed line),
 * 6/13/10 ground units, 5/35 aircraft, 8 end-of-battle awards.
 */

export type RewardEvent = {
  /** Seconds since the game started, as the log stamps it. */
  time: number;
  type: number;
  rp: number;
  sl: number;
  /** The aircraft and preset flown when it happened, as the game names them. */
  unit: string | null;
  preset: string | null;
  /** Kill-feed lines logged within a tenth of a second of it. */
  messages: string[];
};

export type Battle = {
  /** The queue's economic mode — `air_realistic`, `nuclear_escalation`, … */
  mode: string | null;
  events: RewardEvent[];
};

const TIME = /^\s*(\d+\.\d+)/;
const QUEUE = /"economicName":"([^"]+)"/;
const GATHER = /\[GATHER\] \('([^']+)', skin:'[^']*', weap:'([^']*)'\) -> '[^']+', player=1/;
const SCORE = /addScoreMessage et:(\d+) mt:\d+ xp:(-?\d+) wp:(-?\d+)/;
const MESSAGE = /hud_mp_ui_message - text = '(.*)'\s*$/;

/**
 * The kill feed's own markup: a colour escape (ESC and up to three digits)
 * around each name, and a two-letter tag and a length byte in front.
 */
const clean = (text: string) => text.replace(/\x1b\d{0,3}/g, "").replace(/^t[a-z]./, "").trim();

export function parseBattles(log: string): Battle[] {
  const battles: Battle[] = [];
  let queued: string | null = null;
  let current: Battle | null = null;
  let unit: string | null = null;
  let preset: string | null = null;
  const messages: { time: number; text: string }[] = [];

  for (const line of log.split("\n")) {
    const time = Number(TIME.exec(line)?.[1] ?? NaN);

    const queue = QUEUE.exec(line);
    if (queue && line.includes("notify_queue_join")) queued = queue[1];

    if (line.includes("on_mission_started_mp")) {
      current = { mode: queued, events: [] };
      messages.length = 0;
      battles.push(current);
      continue;
    }
    if (line.includes("FadeToDebriefing")) {
      current = null;
      unit = null;
      preset = null;
      continue;
    }
    if (!current) continue;

    const gather = GATHER.exec(line);
    if (gather && gather[2] !== "") {
      unit = gather[1];
      preset = gather[2];
      continue;
    }

    const message = MESSAGE.exec(line);
    if (message) {
      const text = clean(message[1]);
      messages.push({ time, text });
      // A kill-feed line is logged just after the reward it explains.
      for (const event of current.events.slice(-6)) {
        if (Math.abs(event.time - time) <= 0.1) event.messages.push(text);
      }
      continue;
    }

    const score = SCORE.exec(line);
    if (score) {
      current.events.push({
        time,
        type: Number(score[1]),
        rp: Number(score[2]),
        sl: Number(score[3]),
        unit,
        preset,
        messages: messages.filter((m) => Math.abs(m.time - time) <= 0.1).map((m) => m.text),
      });
    }
  }
  return battles;
}
