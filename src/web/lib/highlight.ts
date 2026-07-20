import hljs from "highlight.js";

/** File-extension → highlight.js language name. */
const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  json: "json", css: "css", scss: "scss", html: "xml", xml: "xml",
  md: "markdown", py: "python", rs: "rust", go: "go", sh: "bash", bash: "bash",
  yml: "yaml", yaml: "yaml", sql: "sql", java: "java", rb: "ruby", php: "php",
};

/** The highlight.js language for a path, or undefined if unknown. */
export function languageForPath(path: string): string | undefined {
  const dot: number = path.lastIndexOf(".");
  if (dot === -1) return undefined;
  return EXT_LANG[path.slice(dot + 1).toLowerCase()];
}

/** Escape HTML special characters. */
function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Return highlighted HTML for a line of code. Falls back to escaped plain text
 * when the language is unknown or highlighting fails.
 */
export function highlightToHtml(code: string, language: string | undefined): string {
  if (language && hljs.getLanguage(language)) {
    try {
      return hljs.highlight(code, { language }).value;
    } catch {
      return escapeHtml(code);
    }
  }
  return escapeHtml(code);
}
