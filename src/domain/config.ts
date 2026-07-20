import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { configDir, type PathEnv } from "./paths.ts";

/** A selectable Claude model. */
export interface ModelChoice {
  /** Model id passed to the Agent SDK, e.g. "claude-opus-4-8". */
  id: string;
  /** Human-friendly label shown in the picker. */
  label: string;
}

/** An AI-review prompt template. */
export interface ReviewTemplate {
  /** Stable identifier. */
  id: string;
  /** Display title. */
  title: string;
  /** The prompt text seeding the review. */
  prompt: string;
}

/** Fully-resolved mergie configuration (defaults merged with user config). */
export interface MergieConfig {
  /** Glob patterns identifying lock/generated files (defaults + user, deduped). */
  lockfilePatterns: string[];
  /** Selectable models for chat and reviews. */
  models: ModelChoice[];
  /** Available AI-review templates. */
  templates: ReviewTemplate[];
}

/** Built-in lock/generated-file patterns; user patterns extend these. */
const DEFAULT_LOCKFILE_PATTERNS: readonly string[] = [
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "npm-shrinkwrap.json",
  "bun.lock", "bun.lockb", "Cargo.lock", "go.sum", "composer.lock",
  "Gemfile.lock", "poetry.lock", "Pipfile.lock", "*.min.js", "*.min.css",
];

/** Built-in model choices. */
const DEFAULT_MODELS: readonly ModelChoice[] = [
  { id: "claude-opus-4-8", label: "Opus 4.8" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

/** Built-in AI-review templates (from SPEC). */
const DEFAULT_TEMPLATES: readonly ReviewTemplate[] = [
  {
    id: "key-decisions",
    title: "Key decisions",
    prompt: "Analyse the diff and list the key decisions made in these changes, then reduce them to the essential ones.",
  },
  {
    id: "adversarial",
    title: "Adversarial bug pass",
    prompt: "Perform an adversarial pass over the diff to find bugs and any obvious performance issues.",
  },
];

/** The default configuration, with no user overrides applied. */
export function defaultConfig(): MergieConfig {
  return {
    lockfilePatterns: [...DEFAULT_LOCKFILE_PATTERNS],
    models: DEFAULT_MODELS.map((m) => ({ ...m })),
    templates: DEFAULT_TEMPLATES.map((t) => ({ ...t })),
  };
}

/**
 * Parse a TOML config string and merge it over the defaults. Lock patterns
 * extend the defaults (deduped); models and templates replace the defaults
 * when present. Unknown keys are ignored.
 */
export function parseConfig(tomlText: string): MergieConfig {
  const raw: unknown = Bun.TOML.parse(tomlText);
  const rec: Record<string, unknown> = isRecord(raw) ? raw : {};

  const userPatterns: string[] = stringArray(rec.lockfilePatterns) ?? [];
  const models = parseModels(rec.models);
  const templates = parseTemplates(rec.templates);
  const base = defaultConfig();

  return {
    lockfilePatterns: dedupe([...base.lockfilePatterns, ...userPatterns]),
    models: models ?? base.models,
    templates: templates ?? base.templates,
  };
}

/**
 * Load configuration from disk, merging the user's config file (if present)
 * over the defaults.
 *
 * @param opts.path Override the config file path (defaults to
 *   `<configDir>/config.toml`).
 */
export function loadConfig(opts?: { path?: string } & PathEnv): MergieConfig {
  const path: string = opts?.path ?? join(configDir(opts), "config.toml");
  if (!existsSync(path)) return defaultConfig();
  return parseConfig(readFileSync(path, "utf8"));
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === "string");
}

function parseModels(v: unknown): ModelChoice[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: ModelChoice[] = [];
  for (const item of v) {
    if (isRecord(item) && typeof item.id === "string") {
      out.push({ id: item.id, label: typeof item.label === "string" ? item.label : item.id });
    }
  }
  return out;
}

function parseTemplates(v: unknown): ReviewTemplate[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: ReviewTemplate[] = [];
  for (const item of v) {
    if (isRecord(item) && typeof item.id === "string" && typeof item.title === "string" && typeof item.prompt === "string") {
      out.push({ id: item.id, title: item.title, prompt: item.prompt });
    }
  }
  return out;
}
