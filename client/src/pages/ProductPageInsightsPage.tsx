import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getProductPageInsights, type ProductPageInsights } from "../api/productPageInsights";
import ProductPageFeedbackForm from "../components/ProductPageFeedbackForm";

function formatDate(value: string | null) {
  if (!value) return "Not published yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not published yet";
  return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function ProductPageInsightsPage() {
  const { token = "" } = useParams();
  const [insights, setInsights] = useState<ProductPageInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) { setLoading(false); setError("This private insights link is incomplete."); return; }
    setLoading(true); setError("");
    try { setInsights(await getProductPageInsights(token)); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load your insights."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <main className="phase8-page"><div className="phase8-state-card"><span className="phase8-card-kicker">StatusFly insights</span><div className="phase8-loading-mark"/><h1>Loading your page insights</h1><p>Gathering the latest activity for this product page.</p></div></main>;

  if (error || !insights) return <main className="phase8-page"><div className="phase8-state-card"><span className="phase8-card-kicker">StatusFly insights</span><h1>We couldn't open your insights.</h1><p>{error || "This product page could not be found."}</p><div className="phase8-state-actions"><Link className="button button-primary" to="/">Back to StatusFly<span className="button-accent">↗</span></Link></div></div></main>;

  const publicUrl = `/p/${insights.publicSlug}`;
  const editUrl = `/edit/${token}`;

  return (
    <main className="phase8-page">
      <div className="phase8-shell">
        <header className="phase8-topbar">
          <div><Link className="brand brand-mark" to="/">StatusFly</Link><span className="phase8-topbar-divider">/</span><span>Insights</span></div>
          <div className="phase8-topbar-actions"><Link className="button button-secondary" to={publicUrl}>View page<span className="button-accent">↗</span></Link><Link className="button button-secondary" to={editUrl}>Edit page<span className="button-accent">✎</span></Link></div>
        </header>

        <section className="phase8-heading">
          <div><span className="phase8-card-kicker">Your product page</span><h1>See what customers are doing.</h1><p>Simple numbers to help you understand whether your page is getting attention and moving people into WhatsApp.</p></div>
          <div className="phase8-product-meta"><strong>{insights.productName}</strong><span>{insights.brandName}</span><small>{insights.status === "published" ? "Live" : "Draft"} · Published {formatDate(insights.publishedAt)}</small></div>
        </section>

        <section className="phase8-metrics-grid" aria-label="Product page performance">
          <article className="phase8-metric-card phase8-metric-primary"><span>Page views</span><strong>{insights.pageViews.toLocaleString("en-NG")}</strong><p>Times the public page was opened.</p></article>
          <article className="phase8-metric-card"><span>WhatsApp clicks</span><strong>{insights.whatsappClicks.toLocaleString("en-NG")}</strong><p>Clicks on WhatsApp order buttons, not confirmed orders.</p></article>
          <article className="phase8-metric-card"><span>WhatsApp click rate</span><strong>{insights.whatsappConversionRate}%</strong><p>WhatsApp button clicks as a share of page views.</p></article>
          <article className="phase8-metric-card"><span>Shares</span><strong>{insights.shareClicks.toLocaleString("en-NG")}</strong><p>Share actions measured by StatusFly.</p></article>
        </section>

        {insights.pageType === "collection" ? (
          <section className="phase8-item-analytics-card" aria-labelledby="phase8-item-analytics-title">
            <div className="phase8-card-heading">
              <div><span className="phase8-card-kicker">Collection performance</span><h2 id="phase8-item-analytics-title">Which items get the most enquiries?</h2></div>
              <p>WhatsApp order-button clicks by item. These are clicks, not confirmed purchases.</p>
            </div>
            {insights.itemWhatsappClicks.length ? (
              <div className="phase8-item-analytics-list">
                {[...insights.itemWhatsappClicks].sort((a, b) => b.clicks - a.clicks).map((item) => (
                  <div className="phase8-item-analytics-row" key={item.productPageItemId}>
                    <span>{item.productName}</span>
                    <strong>{item.clicks.toLocaleString("en-NG")}</strong>
                  </div>
                ))}
              </div>
            ) : <p className="phase8-empty-analytics">No item-level clicks have been recorded yet.</p>}
          </section>
        ) : null}

        <section className="phase8-explain-card"><span className="phase8-card-kicker">How to read this</span><h2>Watch the movement, not just the numbers.</h2><div className="phase8-explain-grid"><p><strong>Views</strong> show whether the public page was opened.</p><p><strong>WhatsApp clicks</strong> show people who clicked to start a conversation, not completed orders.</p><p><strong>Shares</strong> show measured share actions such as copying or sharing the link.</p></div></section>

        <ProductPageFeedbackForm editToken={token} />
        <footer className="phase8-footer-note">StatusFly shows aggregate activity only. It does not expose customer identities or individual visitor histories here.</footer>
      </div>
    </main>
  );
}

export default ProductPageInsightsPage;
