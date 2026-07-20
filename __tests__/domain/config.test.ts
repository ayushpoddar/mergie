import { describe, expect, test } from "bun:test";
import { defaultConfig, parseConfig } from "@/domain/config.ts";

describe("defaultConfig", () => {
  test("ships built-in lock patterns, models and the two starter templates", () => {
    const c = defaultConfig();
    expect(c.lockfilePatterns).toContain("package-lock.json");
    expect(c.lockfilePatterns).toContain("*.min.js");
    expect(c.models.length).toBeGreaterThanOrEqual(3);
    expect(c.templates.map((t) => t.id).sort()).toEqual(["adversarial", "key-decisions"]);
  });
});

describe("parseConfig", () => {
  test("empty config equals defaults", () => {
    expect(parseConfig("")).toEqual(defaultConfig());
  });

  test("lockfilePatterns extend (not replace) the defaults, deduped", () => {
    const c = parseConfig(`lockfilePatterns = ["*.snap", "package-lock.json"]`);
    expect(c.lockfilePatterns).toContain("*.snap");
    expect(c.lockfilePatterns).toContain("yarn.lock"); // default retained
    expect(c.lockfilePatterns.filter((p) => p === "package-lock.json")).toHaveLength(1); // deduped
  });

  test("models replace the defaults when provided", () => {
    const c = parseConfig(`[[models]]\nid = "claude-x"\nlabel = "X"`);
    expect(c.models).toEqual([{ id: "claude-x", label: "X" }]);
  });

  test("templates replace the defaults when provided", () => {
    const c = parseConfig(`[[templates]]\nid = "sec"\ntitle = "Security"\nprompt = "check auth"`);
    expect(c.templates).toEqual([{ id: "sec", title: "Security", prompt: "check auth" }]);
  });

  test("ignores unknown keys", () => {
    expect(() => parseConfig(`somethingUnknown = 42`)).not.toThrow();
  });
});
