import type { ChatRange } from "./registry.ts";

/**
 * Assemble the prompt for an AI review: the chosen template's prompt (if any),
 * the user's optional focus prompt (if any), and an instruction to inspect the
 * range's diff in the working directory.
 */
export function buildReviewPrompt(
  templatePrompt: string | null,
  userPrompt: string | null,
  range: ChatRange,
): string {
  const parts: string[] = [];
  if (templatePrompt) parts.push(templatePrompt.trim());
  if (userPrompt) parts.push(userPrompt.trim());
  parts.push(
    `Review the changes in this pull request from commit ${range.start} to ${range.end}. ` +
      `Run \`git diff ${range.start} ${range.end}\` in the working directory to see them, ` +
      `explore the code as needed, and respond in markdown.`,
  );
  return parts.join("\n\n");
}
