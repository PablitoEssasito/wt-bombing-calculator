import { describe, expect, it } from "vitest";
import aircraftData from "../../data/aircraft.json";
import bombData from "../../data/bombs.json";
import { inArmamentChart } from "../../domain/bomb-chart";
import type { Bomb } from "../../domain/types";
import { pagedBombs } from "../../lib/dataset";
import { movedBombIds, movedTarget } from "../../views/moved";
import robots from "../robots";
import sitemap from "../sitemap";

const aircraft = aircraftData as { id: string }[];
const chartBombs = (bombData as Bomb[]).filter(inArmamentChart);

describe("sitemap", () => {
  const entries = sitemap();

  it("lists every fixed page, aircraft and weapon, once each, in every language", () => {
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const prefix of ["", "/pl", "/ru"]) {
      expect(urls).toContain(`http://localhost:3000${prefix}/`);
      expect(urls).toContain(`http://localhost:3000${prefix}/armament/`);
      expect(urls).toContain(`http://localhost:3000${prefix}/changelog/`);
      expect(urls).toContain(`http://localhost:3000${prefix}/about/`);
    }
    expect(entries.length).toBe(3 * (4 + aircraft.length + chartBombs.length));
  });

  it("names each page's counterparts in the other languages", () => {
    const polish = entries.find((e) => e.url === "http://localhost:3000/pl/armament/");
    expect(polish?.alternates?.languages).toEqual({
      en: "http://localhost:3000/armament/",
      pl: "http://localhost:3000/pl/armament/",
      ru: "http://localhost:3000/ru/armament/",
    });
  });

  it("matches the trailing-slash URLs the static export actually serves", () => {
    // next.config.ts sets trailingSlash: true — a sitemap entry missing one
    // would point a crawler at a URL the site itself never links to.
    for (const entry of entries) expect(entry.url.endsWith("/")).toBe(true);
  });

  it("names every aircraft page under its own id", () => {
    const urls = new Set(entries.map((e) => e.url));
    for (const plane of aircraft) {
      expect(urls.has(`http://localhost:3000/aircraft/${plane.id}/`)).toBe(true);
      expect(urls.has(`http://localhost:3000/ru/aircraft/${plane.id}/`)).toBe(true);
    }
  });

  it("names every armament chart row's page under its own id", () => {
    const urls = new Set(entries.map((e) => e.url));
    for (const bomb of chartBombs) {
      expect(urls.has(`http://localhost:3000/armament/${bomb.id}/`)).toBe(true);
      expect(urls.has(`http://localhost:3000/pl/armament/${bomb.id}/`)).toBe(true);
    }
  });

  it("leaves out the bomb chart's old addresses, which only redirect", () => {
    expect(entries.some((e) => e.url.includes("/bombs/"))).toBe(false);
  });

  it("stays well under the 50,000-URL point a sitemap needs splitting at", () => {
    expect(entries.length).toBeLessThan(50000);
  });
});

describe("the bomb chart's old addresses", () => {
  it("each lead to a weapon page that exists, or to the chart", () => {
    const paged = new Set(pagedBombs.map((bomb) => `/armament/${bomb.id}/`));
    const moved = movedBombIds();
    expect(moved.length).toBeGreaterThan(300);
    for (const id of moved) {
      const target = movedTarget(id);
      expect(target === "/armament/" || paged.has(target)).toBe(true);
    }
  });

  it("send a sheet row the game has under another name to that weapon's page", () => {
    expect(movedTarget("g-p-1000-l")).toBe("/armament/g-p-1000-e/");
    expect(movedTarget("mk-82")).toBe("/armament/mk-82/");
  });

  it("cover only what the bomb chart had: the sheet's rows, not the game's", () => {
    const game = new Set(pagedBombs.filter((bomb) => bomb.source === "game").map((bomb) => bomb.id));
    expect(movedBombIds().some((id) => game.has(id))).toBe(false);
  });
});

describe("robots", () => {
  it("allows crawling and points at the sitemap this same site serves", () => {
    const result = robots();
    expect(result.rules).toEqual({ userAgent: "*", allow: "/" });
    expect(result.sitemap).toBe("http://localhost:3000/sitemap.xml");
  });
});
