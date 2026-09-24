import { describe, expect, it } from "vitest";
import aircraftData from "../../data/aircraft.json";
import robots from "../robots";
import sitemap from "../sitemap";

const aircraft = aircraftData as { id: string }[];

describe("sitemap", () => {
  const entries = sitemap();

  it("lists every fixed page and every aircraft, once each", () => {
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain("http://localhost:3000/");
    expect(urls).toContain("http://localhost:3000/bombs/");
    expect(urls).toContain("http://localhost:3000/changelog/");
    expect(urls).toContain("http://localhost:3000/about/");
    expect(entries.length).toBe(4 + aircraft.length);
  });

  it("matches the trailing-slash URLs the static export actually serves", () => {
    // next.config.ts sets trailingSlash: true — a sitemap entry missing one
    // would point a crawler at a URL the site itself never links to.
    for (const entry of entries) expect(entry.url.endsWith("/")).toBe(true);
  });

  it("names every aircraft page under its own id", () => {
    for (const plane of aircraft) {
      expect(entries.map((e) => e.url)).toContain(`http://localhost:3000/aircraft/${plane.id}/`);
    }
  });

  it("stays well under the 50,000-URL point a sitemap needs splitting at", () => {
    expect(entries.length).toBeLessThan(50000);
  });
});

describe("robots", () => {
  it("allows crawling and points at the sitemap this same site serves", () => {
    const result = robots();
    expect(result.rules).toEqual({ userAgent: "*", allow: "/" });
    expect(result.sitemap).toBe("http://localhost:3000/sitemap.xml");
  });
});
