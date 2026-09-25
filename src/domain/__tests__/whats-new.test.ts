import { describe, expect, it } from "vitest";
import { favoritesTouched, unseenChanges, type RecentChange } from "../../lib/whats-new";

const changes: RecentChange[] = [
  { key: "2.59.0.34|2026-10-01", version: "2.59.0.34", touched: ["usa-a-10a"] },
  { key: "2.59.0.33|2026-09-24", version: "2.59.0.33", touched: ["usa-p-47d-28", "usa-f-104c"] },
  { key: "2.59.0.32|2026-09-24", version: "2.59.0.32", touched: ["britain-lancaster"] },
];

describe("unseenChanges", () => {
  it("flags nothing on a first visit", () => {
    expect(unseenChanges(changes, null)).toEqual([]);
  });

  it("flags nothing when the newest entry was already seen", () => {
    expect(unseenChanges(changes, changes[0].key)).toEqual([]);
  });

  it("flags every entry newer than the last one seen", () => {
    expect(unseenChanges(changes, changes[2].key).map((c) => c.version)).toEqual(["2.59.0.34", "2.59.0.33"]);
  });

  it("flags them all when the last one seen has dropped off the list", () => {
    expect(unseenChanges(changes, "2.50.0.1|2025-01-01")).toHaveLength(3);
  });
});

describe("favoritesTouched", () => {
  it("picks out the favourites the entries changed, in the favourites' order", () => {
    const fresh = unseenChanges(changes, changes[2].key);
    expect(favoritesTouched(fresh, ["usa-f-104c", "britain-lancaster", "usa-a-10a"])).toEqual(["usa-f-104c", "usa-a-10a"]);
  });

  it("finds none when no favourite changed", () => {
    expect(favoritesTouched(changes, ["japan-g4m1"])).toEqual([]);
  });
});
