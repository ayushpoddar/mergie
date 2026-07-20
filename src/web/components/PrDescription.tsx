import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Force any link in the rendered markdown to open in a new tab. */
const MARKDOWN_COMPONENTS = {
  a: (props: React.ComponentPropsWithoutRef<"a">) => (
    <a {...props} target="_blank" rel="noreferrer" />
  ),
} as const;

/**
 * The PR description (body) rendered as GitHub-flavored markdown. Hosted in the
 * right-rail "PR description" panel. An empty body shows a muted "No description
 * provided." note.
 */
export function PrDescription(props: { body: string }): React.JSX.Element {
  const hasBody: boolean = props.body.trim().length > 0;
  return (
    <div className="pr-description-body comment-body">
      {hasBody ? (
        <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
          {props.body}
        </Markdown>
      ) : (
        <p className="notice">No description provided.</p>
      )}
    </div>
  );
}
