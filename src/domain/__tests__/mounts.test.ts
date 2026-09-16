import { describe, expect, it } from "vitest";
import { parseMountStyle } from "../../../scripts/mounts/parse";

/**
 * The two shapes the wiki's suspended armament block comes in, cut down to the
 * part that tells them apart.
 */
const pylonPage = `
  <div class="block-header">Suspended armament</div>
  <div class="game-unit_chars-line"><span>Max weight</span><span>3,730 kg</span></div>
  <table>
    <tr><th>Name</th><th>Weight</th><th colspan="13">Slot</th></tr>
    <tr><td>250 lb AN-M57 bomb</td><td>117.9 kg</td><td><img src="bomb.png"></td></tr>
  </table>
`;

const setupPage = `
  <div class="block-header">Suspended armament</div>
  <div class="game-unit_chars-line"><span>Setup 1</span><span>40 x 50 kg FAB-50sv bomb</span></div>
  <div class="game-unit_chars-line"><span>Setup 2</span><span>40 x 100 kg FAB-100sv bomb</span></div>
`;

describe("parseMountStyle", () => {
  it("reads a hardpoint matrix as a load that can be split", () => {
    expect(parseMountStyle(pylonPage)).toBe("pylons");
  });

  it("reads a numbered setup list as all-or-nothing", () => {
    expect(parseMountStyle(setupPage)).toBe("setups");
  });

  it("gives no verdict on a page without the block", () => {
    expect(parseMountStyle("<div>Offensive armament</div>")).toBe(null);
  });

  it("ignores setups named outside the armament block", () => {
    // Modification lists and articles further down the page use the word too;
    // only what follows the heading counts.
    expect(parseMountStyle("Setup 1<div>Suspended armament</div>")).toBe(null);
  });
});
