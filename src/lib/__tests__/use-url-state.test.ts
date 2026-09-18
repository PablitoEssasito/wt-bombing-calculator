import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribe } from "../use-url-state";

/**
 * `subscribe` backs every `useUrlState` control on a page, and every one of
 * them registers against the same `window`. This file stands in for that
 * `window` with a plain `EventTarget` — enough to dispatch `popstate` on,
 * without pulling in jsdom for one function that never touches the DOM tree.
 */
afterEach(() => {
  // @ts-expect-error -- test-only global, not part of the Node lib types.
  delete globalThis.window;
});

describe("subscribe", () => {
  it("keeps listening for the browser's own navigation as long as any control is mounted", () => {
    const target = new EventTarget();
    // @ts-expect-error -- a stand-in window, just enough for addEventListener.
    globalThis.window = target;

    const a = vi.fn();
    const b = vi.fn();
    const unsubscribeA = subscribe(a);
    subscribe(b);

    // The first control to unmount must not silence a second one still on the
    // page — both share one popstate listener, so only the last unsubscribe
    // may tear it down.
    unsubscribeA();
    target.dispatchEvent(new Event("popstate"));

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("stops listening once the last control unmounts", () => {
    const target = new EventTarget();
    // @ts-expect-error -- a stand-in window, just enough for addEventListener.
    globalThis.window = target;

    const only = vi.fn();
    const unsubscribe = subscribe(only);
    unsubscribe();

    target.dispatchEvent(new Event("popstate"));
    expect(only).not.toHaveBeenCalled();
  });
});
