import { describe, expect, it } from "vitest";
import aircraftData from "../../data/aircraft.json";
import robots from "../robots";
import sitemap from "../sitemap";

const aircraft = aircraftData as { id: string }[];

describe("sitemap", () => {
  const entries = sitemap();

  it("lists every fixed page and every aircraft, once each, in every language", () => {
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const prefix of ["", "/pl", "/ru"]) {
      expect(urls).toContain(`http://localhost:3000${prefix}/`);
      expect(urls).toContain(`http://localhost:3000${prefix}/bombs/`);
      expect(urls).toContain(`http://localhost:3000${prefix}/changelog/`);
      expect(urls).toContain(`http://localhost:3000${prefix}/about/`);
    }
    expect(entries.length).toBe(3 * (4 + aircraft.length));
  });

  it("names each page's counterparts in the other languages", () => {
    const polish = entries.find((e) => e.url === "http://localhost:3000/pl/bombs/");
    expect(polish?.alternates?.languages).toEqual({
      en: "http://localhost:3000/bombs/",
      pl: "http://localhost:3000/pl/bombs/",
      ru: "http://localhost:3000/ru/bombs/",
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
