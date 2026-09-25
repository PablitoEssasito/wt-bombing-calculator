import { describe, expect, it } from "vitest";
import { decode, recoverKey } from "../../../scripts/reward-logs/decode";
import { parseBattles } from "../../../scripts/reward-logs/parse";

const ESC = "\x1b";

/** A slice of a real log, trimmed to the lines the parser reads, with the names changed. */
const LOG = [
  ' 124.65 [D]  [MATCHING] < {"type":49,"data":{"name":"match.notify_queue_join","data":{"mode":"air_realistic","economicName":"air_realistic","queueId":28}}}',
  " 154.23 SQRL on_mission_started_mp - CLIENT",
  " 156.02 TRIG $2B [GATHER] ('dummy_plane', skin:'', weap:'') -> 'dummy_plane', player=1",
  " 156.02 TRIG $2B [GATHER] ('a_26b_10', skin:'default', weap:'a_26b_10_500lbs') -> 'a_26b_10', player=1",
  " 156.03 TRIG $2B [GATHER] ('bf_109k_4', skin:'default', weap:'Bf_109K4_default') -> 'bf_109k_4', player=0",
  " 481.73 HUD  addScoreMessage et:6 mt:4 xp:58 wp:595 delay:0",
  ` 481.74 HUD  hud_mp_ui_message - text = 'tda${ESC}011[Clan] someone (A-26B-10)${ESC} destroyed Destroyer'`,
  " 1239.41 HUD  addScoreMessage et:0 mt:4 xp:130 wp:0 delay:0",
  "1659.19 [D]  FadeToDebriefing",
  ' 1700.00 [D]  [MATCHING] < {"type":49,"data":{"name":"match.notify_queue_join","data":{"mode":"nuclear_escalation","economicName":"nuclear_escalation"}}}',
  " 1710.00 SQRL on_mission_started_mp - CLIENT",
  " 1720.00 HUD  addScoreMessage et:3 mt:4 xp:900 wp:9000 delay:0",
].join("\n");

describe("recoverKey / decode", () => {
  it("finds a repeating XOR key from the text it hides", () => {
    // Shaped like a log: lines of short words in no fixed rhythm, spaces the
    // commonest byte. (A seeded generator, so the test is the same every run.)
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    const words = ["unit", "loaded", "ok", "HUD", "texture", "id", "mission", "respawn", "at", "for"];
    const text = Array.from({ length: 3000 }, (_, i) => {
      const line = Array.from({ length: 2 + (next() % 9) }, () => words[next() % words.length]);
      return ` ${(i / 7).toFixed(2)} [D]  ${line.join(" ")}`;
    }).join("\n");
    const key = new Uint8Array(128).map((_, i) => (i * 37 + 11) & 0xff);
    const scrambled = new TextEncoder().encode(text).map((byte, i) => byte ^ key[i % key.length]);
    expect(decode(scrambled, recoverKey(scrambled))).toBe(text);
  });
});

describe("parseBattles", () => {
  const battles = parseBattles(LOG);

  it("splits the log into battles, each with the mode it was queued in", () => {
    expect(battles.map((b) => b.mode)).toEqual(["air_realistic", "nuclear_escalation"]);
  });

  it("ties each reward to the player's own aircraft and preset, not the placeholder or others'", () => {
    const [kill] = battles[0].events;
    expect(kill).toMatchObject({ type: 6, rp: 58, sl: 595, unit: "a_26b_10", preset: "a_26b_10_500lbs" });
  });

  it("attaches the kill-feed line printed with it, markup stripped", () => {
    expect(battles[0].events[0].messages).toEqual(["[Clan] someone (A-26B-10) destroyed Destroyer"]);
    expect(battles[0].events[1].messages).toEqual([]);
  });

  it("forgets the aircraft once the battle ends", () => {
    expect(battles[1].events[0].unit).toBeNull();
  });
});
