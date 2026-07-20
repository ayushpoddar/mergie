import { ReviewView } from "./components/ReviewView.tsx";
import { PrPicker } from "./components/PrPicker.tsx";
import { PrLoading } from "./components/PrLoading.tsx";
import { SparkleIcon } from "./components/Icons.tsx";

/**
 * Root React component. Routes on query params:
 * `?pr=<id>` → review screen; `?load=<url>` → the loading gate that fetches a
 * not-yet-loaded PR then deep-links into it; otherwise the home PR picker.
 */
export function App(): React.JSX.Element {
  const params = new URLSearchParams(window.location.search);
  const prId: string | null = params.get("pr");
  const loadUrl: string | null = params.get("load");
  if (prId !== null) return <ReviewView prId={prId} />;
  if (loadUrl !== null) return <PrLoading url={loadUrl} />;
  return <Home />;
}

/** Home screen: branding plus the PR picker (no PR selected). */
function Home(): React.JSX.Element {
  return (
    <main className="landing">
      <div className="landing-brand">
        <span className="landing-mark"><SparkleIcon size={18} /></span>
        <h1 className="landing-wordmark">mergie</h1>
      </div>
      <p className="landing-tagline">Review GitHub pull requests locally.</p>
      <PrPicker />
    </main>
  );
}
