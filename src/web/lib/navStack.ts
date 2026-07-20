import type { CodeResult } from "@/services/symbols.ts";
import type { MenuOp, SearchSide } from "@/web/state/useCodeSearch.ts";

/** A diff frame: a file's split base/head view over the navigator's range. */
export interface DiffNavFrame {
  /** Frame discriminant. */
  kind: "diff";
  /** Repo-relative file path. */
  path: string;
  /** 1-based line to center/flash, or null to open at the top. */
  anchorLine?: number | null;
}

/** A file frame: a single-version file view at one commit, centered on a line. */
export interface FileNavFrame {
  /** Frame discriminant. */
  kind: "file";
  /** Repo-relative file path. */
  path: string;
  /** Commit SHA to read the file at. */
  sha: string;
  /** 1-based line to center and flash. */
  line: number;
}

/** A results frame: a list of code results from a lookup/search. */
export interface ResultsNavFrame {
  /** Frame discriminant. */
  kind: "results";
  /** The lookup op that produced the results. */
  op: MenuOp;
  /** The looked-up term / query. */
  term: string;
  /** Which checkout side the lookup ran against. */
  side: SearchSide;
  /** The SHA the results were found at (for opening file frames). */
  sha: string;
  /** The file the lookup was scoped to (a "" means repo-wide). */
  scopeFile: string;
  /** The results to list. */
  results: CodeResult[];
}

/** One frame in the navigator's Back/Forward history. */
export type NavFrame = DiffNavFrame | FileNavFrame | ResultsNavFrame;

/** The navigator's history: the frame list plus the current position in it. */
export interface NavStack {
  /** The frames, oldest → newest. */
  stack: NavFrame[];
  /** Index of the currently shown frame. */
  index: number;
}

/** An action the {@link navStackReducer} understands. */
export type NavStackAction =
  | { type: "push"; frame: NavFrame }
  | { type: "back" }
  | { type: "forward" };

/** A fresh history seeded with a single origin frame. */
export function initNavStack(frame: NavFrame): NavStack {
  return { stack: [frame], index: 0 };
}

/** The frame currently shown. */
export function currentFrame(s: NavStack): NavFrame {
  return s.stack[s.index]!;
}

/**
 * A stable identity key for a frame: frames that show the same content share a
 * key. Used to keep each visited frame mounted (so its scroll position survives
 * Back/Forward) while giving React a distinct key per history entry.
 */
export function frameKey(frame: NavFrame): string {
  if (frame.kind === "diff") return `diff:${frame.path}`;
  if (frame.kind === "file") return `file:${frame.path}:${frame.sha}`;
  return `results:${frame.op}:${frame.term}:${frame.side}:${frame.sha}`;
}

/** Whether there is an earlier frame to go Back to. */
export function canGoBack(s: NavStack): boolean {
  return s.index > 0;
}

/** Whether there is a later frame to go Forward to. */
export function canGoForward(s: NavStack): boolean {
  return s.index < s.stack.length - 1;
}

/**
 * The navigator history reducer. `push` drops any forward history (frames after
 * the current index) and appends the new frame as the current one; `back` /
 * `forward` move the cursor, clamped to the ends. Never mutates its input.
 */
export function navStackReducer(state: NavStack, action: NavStackAction): NavStack {
  switch (action.type) {
    case "push": {
      const kept = state.stack.slice(0, state.index + 1);
      const stack = [...kept, action.frame];
      return { stack, index: stack.length - 1 };
    }
    case "back":
      return { stack: state.stack, index: Math.max(0, state.index - 1) };
    case "forward":
      return { stack: state.stack, index: Math.min(state.stack.length - 1, state.index + 1) };
  }
}
