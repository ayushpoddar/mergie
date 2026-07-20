import { describe, expect, test } from "bun:test";
import {
  artifactsDir,
  cloneDir,
  configDir,
  dataDir,
  dbPath,
} from "@/domain/paths.ts";
import type { PullRequestRef } from "@/domain/url.ts";

const REF: PullRequestRef = {
  host: "github.com",
  owner: "withastro",
  repo: "astro",
  number: 17360,
};

describe("dataDir", () => {
  test("uses $XDG_DATA_HOME when set", () => {
    expect(dataDir(REF, { env: { XDG_DATA_HOME: "/x/.config" }, home: "/h" })).toBe(
      "/x/.config/mergie/pr_withastro_astro_17360",
    );
  });

  test("falls back to ~/.local/share when XDG_DATA_HOME unset", () => {
    expect(dataDir(REF, { env: {}, home: "/home/me" })).toBe(
      "/home/me/.local/share/mergie/pr_withastro_astro_17360",
    );
  });
});

describe("configDir", () => {
  test("uses $XDG_CONFIG_HOME when set", () => {
    expect(configDir({ env: { XDG_CONFIG_HOME: "/c" }, home: "/h" })).toBe("/c/mergie");
  });

  test("falls back to ~/.config when unset", () => {
    expect(configDir({ env: {}, home: "/home/me" })).toBe("/home/me/.config/mergie");
  });
});

describe("derived per-PR paths", () => {
  const opts = { env: { XDG_DATA_HOME: "/d" }, home: "/h" } as const;
  const base = "/d/mergie/pr_withastro_astro_17360";

  test("cloneDir", () => {
    expect(cloneDir(REF, opts)).toBe(`${base}/clone`);
  });
  test("artifactsDir", () => {
    expect(artifactsDir(REF, opts)).toBe(`${base}/artifacts`);
  });
  test("dbPath", () => {
    expect(dbPath(REF, opts)).toBe(`${base}/mergie.db`);
  });
});
