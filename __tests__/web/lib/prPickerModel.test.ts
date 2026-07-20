import { describe, expect, test } from "bun:test";
import { excludeLoaded, prKey } from "@/web/lib/prPickerModel.ts";

describe("prKey", () => {
  test("builds a stable owner/repo#number key", () => {
    expect(prKey({ owner: "acme", repo: "api", number: 12 })).toBe("acme/api#12");
  });
});

describe("excludeLoaded", () => {
  const search = [
    { owner: "acme", repo: "api", number: 12, title: "a" },
    { owner: "acme", repo: "web", number: 3, title: "b" },
    { owner: "globex", repo: "api", number: 7, title: "c" },
  ];

  test("drops search results already present in the loaded set", () => {
    const loaded = [{ owner: "acme", repo: "web", number: 3 }];
    expect(excludeLoaded(search, loaded).map((p) => p.number)).toEqual([12, 7]);
  });

  test("returns all when nothing is loaded", () => {
    expect(excludeLoaded(search, []).map((p) => p.number)).toEqual([12, 3, 7]);
  });

  test("does not mutate its inputs", () => {
    const copy = [...search];
    excludeLoaded(search, [{ owner: "acme", repo: "api", number: 12 }]);
    expect(search).toEqual(copy);
  });
});
