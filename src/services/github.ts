import { bunRunner, type CommandRunner } from "@/services/exec.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A single inline diff comment fetched from GitHub.
 * Maps from the GitHub REST API's pull request review comment object.
 */
export interface GithubComment {
  /** GitHub's numeric comment ID. */
  id: number;
  /** File path the comment is anchored to. */
  path: string;
  /** Which side of the diff this comment sits on. */
  side: "LEFT" | "RIGHT";
  /**
   * The last line of the commented range (or the single line for a single-line
   * comment). Null when GitHub omits it (shouldn't happen for inline comments,
   * but modelled defensively).
   */
  line: number | null;
  /**
   * First line of a multi-line comment span. Null for single-line comments.
   */
  startLine: number | null;
  /** The commit SHA the comment was made against. */
  commitId: string;
  /** Markdown body of the comment. */
  body: string;
  /** GitHub login of the comment author. */
  author: string;
  /** ISO-8601 creation timestamp. */
  createdAtIso: string;
  /**
   * ID of the parent comment if this is a reply; null for root comments.
   */
  inReplyToId: number | null;
  /** The diff hunk context string returned by GitHub. */
  diffHunk: string;
  /** Full URL to view the comment on GitHub. */
  htmlUrl: string;
}

/**
 * A root comment plus all its direct replies, ordered by creation time.
 */
export interface CommentThread {
  /** The top-level (non-reply) comment that started the thread. */
  root: GithubComment;
  /** All replies to the root, sorted oldest-first. */
  replies: GithubComment[];
}

/**
 * Input for posting a new inline comment to GitHub.
 * When `startLine` is provided the comment spans from `startLine` to `line`
 * (a whole-hunk multi-line comment).
 */
export interface PostCommentInput {
  /** Markdown body to post. */
  body: string;
  /** The commit SHA to anchor the comment to. */
  commitId: string;
  /** File path being commented on. */
  path: string;
  /** Which side of the diff to post on. */
  side: "LEFT" | "RIGHT";
  /** The last (or only) line of the comment range. */
  line: number;
  /** First line for a multi-line span. Omit for a single-line comment. */
  startLine?: number;
}

// ---------------------------------------------------------------------------
// Internal raw shape from the GitHub API
// ---------------------------------------------------------------------------

/** Raw shape of one item in the GitHub pull request review comments array. */
interface RawGithubComment {
  id: number;
  path: string;
  side: string;
  line: number | null;
  start_line: number | null;
  commit_id: string;
  body: string;
  user: { login: string };
  created_at: string;
  in_reply_to_id: number | null;
  diff_hunk: string;
  html_url: string;
}

/** Minimal shape of the response from posting/replying a comment. */
interface RawPostedComment {
  id: number;
  html_url: string;
}

/** The GitHub inline-comment service bound to one pull request. */
export type GithubService = ReturnType<typeof createGithubService>;

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

/**
 * Creates a GitHub service bound to a specific pull request.
 * All GitHub API calls are made via `gh api` through the injected runner.
 *
 * @param ref - Owner, repo, and PR number identifying the pull request.
 * @param runner - Command runner to use; defaults to the real Bun runner.
 */
export function createGithubService(
  ref: { owner: string; repo: string; number: number },
  runner: CommandRunner = bunRunner,
) {
  const { owner, repo, number: prNumber } = ref;
  const base = `repos/${owner}/${repo}`;

  /** Throws a descriptive error if the command result indicates failure. */
  function assertSuccess(stderr: string, exitCode: number): void {
    if (exitCode !== 0) {
      throw new Error(stderr || `gh exited with code ${exitCode}`);
    }
  }

  /** Normalises the raw GitHub side string to the typed union. */
  function normaliseSide(side: string): "LEFT" | "RIGHT" {
    return side === "LEFT" ? "LEFT" : "RIGHT";
  }

  /** Maps one raw GitHub comment object to a typed GithubComment. */
  function mapComment(raw: RawGithubComment): GithubComment {
    return {
      id: raw.id,
      path: raw.path,
      side: normaliseSide(raw.side),
      line: raw.line,
      startLine: raw.start_line,
      commitId: raw.commit_id,
      body: raw.body,
      author: raw.user.login,
      createdAtIso: raw.created_at,
      inReplyToId: raw.in_reply_to_id,
      diffHunk: raw.diff_hunk,
      htmlUrl: raw.html_url,
    };
  }

  return {
    /**
     * The authenticated user's GitHub login (via `gh api user --jq .login`).
     * Returns an empty string if the call fails (offline / unauthenticated) so
     * callers can degrade gracefully rather than throw.
     */
    async viewer(): Promise<string> {
      const { stdout, exitCode } = await runner.run("gh", ["api", "user", "--jq", ".login"]);
      return exitCode === 0 ? stdout.trim() : "";
    },

    /**
     * Fetches all inline review comments for the pull request.
     * Follows pagination automatically via `--paginate`.
     */
    async listReviewComments(): Promise<GithubComment[]> {
      const { stdout, stderr, exitCode } = await runner.run("gh", [
        "api",
        `${base}/pulls/${prNumber}/comments`,
        "--paginate",
      ]);
      assertSuccess(stderr, exitCode);
      const raw = JSON.parse(stdout) as RawGithubComment[];
      return raw.map(mapComment);
    },

    /**
     * Groups a flat list of comments into reply threads.
     * A thread has one root comment (no inReplyToId) and zero or more replies.
     * Orphan replies (whose parent is absent from the list) become their own
     * single-comment thread to avoid silently dropping data.
     * Replies within each thread are sorted oldest-first.
     */
    buildThreads(comments: GithubComment[]): CommentThread[] {
      const byId = new Map<number, GithubComment>(comments.map((c) => [c.id, c]));
      const replyBuckets = new Map<number, GithubComment[]>();
      const roots: GithubComment[] = [];
      const orphans: GithubComment[] = [];

      for (const comment of comments) {
        if (comment.inReplyToId === null) {
          roots.push(comment);
        } else if (byId.has(comment.inReplyToId)) {
          const bucket = replyBuckets.get(comment.inReplyToId) ?? [];
          bucket.push(comment);
          replyBuckets.set(comment.inReplyToId, bucket);
        } else {
          orphans.push(comment);
        }
      }

      const threads: CommentThread[] = roots.map((root) => ({
        root,
        replies: (replyBuckets.get(root.id) ?? []).sort(
          (a, b) => a.createdAtIso.localeCompare(b.createdAtIso),
        ),
      }));

      // Orphans form solo threads so no comment is silently dropped.
      for (const orphan of orphans) {
        threads.push({ root: orphan, replies: [] });
      }

      return threads;
    },

    /**
     * Posts a new inline comment on the pull request.
     * Passing `startLine` causes a multi-line (whole-hunk) comment spanning
     * `startLine` through `line` on the same side.
     */
    async postComment(input: PostCommentInput): Promise<{ id: number; htmlUrl: string }> {
      const args = [
        "api",
        `${base}/pulls/${prNumber}/comments`,
        "--method",
        "POST",
        "-f",
        `body=${input.body}`,
        "-f",
        `commit_id=${input.commitId}`,
        "-f",
        `path=${input.path}`,
        "-f",
        `side=${input.side}`,
        "-F",
        `line=${input.line}`,
      ];

      if (input.startLine !== undefined) {
        args.push("-F", `start_line=${input.startLine}`, "-f", `start_side=${input.side}`);
      }

      const { stdout, stderr, exitCode } = await runner.run("gh", args);
      assertSuccess(stderr, exitCode);
      const raw = JSON.parse(stdout) as RawPostedComment;
      return { id: raw.id, htmlUrl: raw.html_url };
    },

    /**
     * Updates the body of an existing inline comment.
     */
    async editComment(id: number, body: string): Promise<void> {
      const { stderr, exitCode } = await runner.run("gh", [
        "api",
        `${base}/pulls/comments/${id}`,
        "--method",
        "PATCH",
        "-f",
        `body=${body}`,
      ]);
      assertSuccess(stderr, exitCode);
    },

    /**
     * Permanently deletes an inline comment from GitHub.
     */
    async deleteComment(id: number): Promise<void> {
      const { stderr, exitCode } = await runner.run("gh", [
        "api",
        `${base}/pulls/comments/${id}`,
        "--method",
        "DELETE",
      ]);
      assertSuccess(stderr, exitCode);
    },

    /**
     * Posts a reply to an existing inline comment thread.
     */
    async replyToComment(
      inReplyToId: number,
      body: string,
    ): Promise<{ id: number; htmlUrl: string }> {
      const { stdout, stderr, exitCode } = await runner.run("gh", [
        "api",
        `${base}/pulls/${prNumber}/comments/${inReplyToId}/replies`,
        "--method",
        "POST",
        "-f",
        `body=${body}`,
      ]);
      assertSuccess(stderr, exitCode);
      const raw = JSON.parse(stdout) as RawPostedComment;
      return { id: raw.id, htmlUrl: raw.html_url };
    },
  };
}
