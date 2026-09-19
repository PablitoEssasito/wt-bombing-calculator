import { describe, expect, it } from "vitest";
import { canonicalOf, pageOpenGraph } from "../site";

describe("pageOpenGraph", () => {
  it("falls back to the site's own share card when a page has no picture", () => {
    const meta = pageOpenGraph("Bomb chart", "Every bomb, priced.");
    expect(meta.openGraph).toMatchObject({ title: "Bomb chart", description: "Every bomb, priced." });
    expect(meta.openGraph.images).toEqual([expect.objectContaining({ url: "/opengraph-image" })]);
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Bomb chart",
      description: "Every bomb, priced.",
      images: ["/opengraph-image"],
    });
  });

  it("uses a page's own picture over the site-wide default", () => {
    const image = { url: "/r.webp", width: 512, height: 256, alt: "a render" };
    const meta = pageOpenGraph("B-52H", "How many bombs.", image);
    expect(meta.openGraph.images).toEqual([image]);
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", images: [image.url] });
  });
});

describe("canonicalOf", () => {
  it("always ends in the trailing slash the site itself links with", () => {
    expect(canonicalOf("/bombs").alternates.canonical).toBe("http://localhost:3000/bombs/");
    // Whichever way the caller happened to spell the path.
    expect(canonicalOf("/bombs/").alternates.canonical).toBe("http://localhost:3000/bombs/");
  });

  it("never doubles the slash on the home page", () => {
    expect(canonicalOf("/").alternates.canonical).toBe("http://localhost:3000/");
  });
});
