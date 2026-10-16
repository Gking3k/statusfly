import { useEffect } from "react";
import { Link } from "react-router-dom";
import { trackPlatformEvent } from "../api/platformAnalytics";
import heroPreview from "../assets/statusfly-homepage-hero.webp";

const Check = () => <span className="home-check" aria-hidden="true">✓</span>;

function HomePage() {
  useEffect(() => {
    trackPlatformEvent("home_view");
  }, []);

  return (
    <main className="home-page phase7-home">
      <div className="home-shell">
        <nav className="home-nav" aria-label="Main navigation">
          <Link className="home-brand" to="/" aria-label="StatusFly home">
            <span className="home-brand-symbol" aria-hidden="true">S</span>
            <span className="home-brand-word">StatusFly</span>
          </Link>

          <div className="home-nav-links">
            <a href="#how-it-works">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </div>

          <Link className="home-nav-cta" to="/create">
            Get started <span aria-hidden="true">↗</span>
          </Link>
        </nav>

        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <span className="home-eyebrow"><span className="home-eyebrow-dot" /> For businesses selling online</span>
            <h1 id="home-title">
              What you sell.<br />One link.<br />
              <span className="accent-word">A clearer way to buy.</span>
            </h1>
            <p className="home-description">
              Create a professional page for your products, services or offers. Give customers the details they need, then let them order or enquire through WhatsApp.
            </p>

            <div className="home-actions">
              <Link className="button button-primary home-primary-cta" to="/create">
                Create my product page <span className="button-accent" aria-hidden="true">→</span>
              </Link>
              <div className="home-price-chip"><strong>₦3,000</strong><span>one time</span></div>
            </div>

            <div className="home-checklist" aria-label="Included benefits">
              <span><Check /> No account required</span>
              <span><Check /> No subscription</span>
              <span><Check /> Up to 3 product images</span>
            </div>

            <div className="home-inline-format-links">
              <Link to="/create">Single product page <span>₦3,000</span></Link>
              <Link to="/create/collection">Product collection <span>₦3,500</span></Link>
            </div>
          </div>

          <div className="home-visual-wrap">
            <div className="home-visual">
              <img
                className="home-preview-image"
                src={heroPreview}
                alt="StatusFly product page example displayed on a phone, with product photos, a price, clear details and a WhatsApp order button"
                fetchPriority="high"
              />
            </div>
          </div>
        </section>

        <section className="home-proof" aria-label="Why StatusFly">
          <article className="home-proof-card">
            <span className="home-proof-icon" aria-hidden="true">↯</span>
            <div><strong>Focused pages</strong><p>Show one product, service or offer without needing a full online store.</p></div>
          </article>
          <article className="home-proof-card">
            <span className="home-proof-icon home-proof-icon-chat" aria-hidden="true">◔</span>
            <div><strong>WhatsApp orders</strong><p>Customers message you directly to order or ask questions.</p></div>
          </article>
          <article className="home-proof-card">
            <span className="home-proof-icon" aria-hidden="true">▥</span>
            <div><strong>Built for real businesses</strong><p>Simple, fast and mobile-friendly, wherever you share your link.</p></div>
          </article>
        </section>

        <section className="home-how section-anchor" id="how-it-works" aria-labelledby="how-title">
          <div className="home-section-heading">
            <span className="home-section-kicker">A simpler way to sell</span>
            <h2 id="how-title">From product details to a shareable page.</h2>
            <p>No complicated store setup. Just the details customers need to make a decision.</p>
          </div>
          <div className="home-steps-grid">
            <article className="home-step-card"><span className="home-step-number">01</span><span className="home-step-icon" aria-hidden="true">＋</span><h3>Create your page</h3><p>Add your product photos, price, description and useful details.</p></article>
            <article className="home-step-card"><span className="home-step-number">02</span><span className="home-step-icon" aria-hidden="true">↗</span><h3>Share one link</h3><p>Put your page in your WhatsApp status, social bio or messages.</p></article>
            <article className="home-step-card"><span className="home-step-number">03</span><span className="home-step-icon" aria-hidden="true">☏</span><h3>Connect on WhatsApp</h3><p>Customers tap the order button to start a message with you.</p></article>
          </div>
        </section>

        <section className="home-formats section-anchor" id="pricing" aria-labelledby="pricing-title">
          <div className="home-section-heading home-section-heading-row">
            <div><span className="home-section-kicker">Straightforward pricing</span><h2 id="pricing-title">Choose the page that fits your products.</h2><p>Pay once for the page you create. No monthly subscription.</p></div>
            <span className="home-price-assurance"><Check /> One-time payment</span>
          </div>
          <div className="home-pricing-grid">
            <article className="home-pricing-card">
              <div className="home-pricing-card-top"><span className="home-pricing-icon" aria-hidden="true">▣</span><span className="home-pricing-tag">Single product</span></div>
              <h3>A focused page for one offer.</h3>
              <p className="home-pricing-description">Best when you want to give one product, service or promotion its own clear page.</p>
              <div className="home-pricing-price">₦3,000 <span>one time</span></div>
              <ul><li><Check /> Product details and pricing</li><li><Check /> Up to 3 product images</li><li><Check /> WhatsApp order or enquiry button</li><li><Check /> Private editing link</li></ul>
              <Link className="button button-primary home-pricing-cta" to="/create">Create a single page <span aria-hidden="true">→</span></Link>
            </article>
            <article className="home-pricing-card home-pricing-card-featured">
              <div className="home-pricing-card-top"><span className="home-pricing-icon" aria-hidden="true">▦</span><span className="home-pricing-tag">Product collection</span></div>
              <h3>Several products. One link.</h3>
              <p className="home-pricing-description">Ideal for a small catalogue when customers need to browse more than one item.</p>
              <div className="home-pricing-price">₦3,500 <span>one time</span></div>
              <ul><li><Check /> 2–10 products on one page</li><li><Check /> Up to 3 images per product</li><li><Check /> Individual WhatsApp order buttons</li><li><Check /> Private editing link</li></ul>
              <Link className="button button-primary home-pricing-cta" to="/create/collection">Create a collection <span aria-hidden="true">→</span></Link>
            </article>
          </div>
          <p className="home-pricing-footnote">StatusFly helps customers view your offer and contact you on WhatsApp. You handle customer conversations, payments and fulfilment directly.</p>
        </section>

                
        <section className="home-faq section-anchor" id="faq" aria-labelledby="faq-title">
          <div className="home-section-heading">
            <span className="home-section-kicker">A few useful answers</span>
            <h2 id="faq-title">Good questions. Clear answers.</h2>
          </div>

          <div className="home-faq-list">
            <details>
              <summary>Do I need to create an account?</summary>
              <p>
                No account is required to create your page. You will receive a private
                editing link to return to and manage your page. Keep this link secure
                and save a backup somewhere safe.
              </p>
            </details>

            <details>
              <summary>Is the payment monthly?</summary>
              <p>
                No. Payment is made once, with no monthly subscription or recurring
                hosting fee charged under our current pricing. The limited-time launch
                prices are ₦3,000 for a single-product page and ₦3,500 for a collection
                of 2–10 products.
              </p>
            </details>

            <details>
              <summary>How long will my StatusFly page stay online?</summary>
              <p>
                Your payment is a one-time payment, not a guarantee of permanent
                hosting. Your page will remain hosted while the StatusFly service
                remains operational and your page complies with our <Link to="/terms">Terms of Service</Link>.
                We will make reasonable efforts to keep your page accessible and give
                reasonable notice if we need to discontinue the service. Availability
                depends on our infrastructure, maintenance, and service policies.
              </p>
            </details>

            <details>
              <summary>Will I have to pay hosting or renewal fees later?</summary>
              <p>
                There are no recurring hosting or renewal fees charged to you under
                our current pricing. However, continued hosting depends on StatusFly
                remaining operational and its service policies. We cannot guarantee
                lifetime hosting.
              </p>
            </details>

            <details>
              <summary>Can customers pay or order directly on StatusFly?</summary>
              <p>
                StatusFly showcases your products and directs customers to message you
                on WhatsApp. You arrange payment, delivery, and fulfilment directly
                with your customers. StatusFly does not process payments for your
                customers' purchases or handle delivery.
              </p>
            </details>

            <details>
              <summary>Does StatusFly take a commission on my sales?</summary>
              <p>
                No. StatusFly does not take a commission on sales made through your
                WhatsApp conversations. You pay the applicable one-time page creation
                fee, and you handle your customer transactions directly.
              </p>
            </details>

            <details>
              <summary>What's the difference between a single-product page and a collection?</summary>
              <p>
                A single-product page showcases one product and currently costs
                ₦3,000. A collection lets you showcase 2–10 products on one page and
                currently costs ₦3,500. Both are one-time payments under our launch
                pricing.
              </p>
            </details>

            <details>
              <summary>Can I edit my page after creating it?</summary>
              <p>
                Yes. Use your private editing link to return to your page and make
                changes supported by the page editor. Keep the link private and store
                it somewhere safe.
              </p>
            </details>

            <details>
              <summary>What happens if I lose my private editing link?</summary>
              <p>
                Your private editing link is how you return to your page without an
                account. If you lose it, <Link to="/recover-edit-link">request a recovery email </Link>
                using the same email address you used at checkout. Recovery is only
                available for eligible successful payments where the access token was
                securely saved. You can also contact StatusFly support if you need help.
              </p>
            </details>

            <details>
              <summary>Are the current prices permanent?</summary>
              <p>
                No. ₦3,000 for a single-product page and ₦3,500 for a collection are
                limited-time launch prices and may increase for future purchases.
                The price displayed at checkout will apply to your purchase.
              </p>
            </details>
          </div>
        </section>

        <section className="home-final-cta">
          <div><span className="home-section-kicker">Ready when you are</span><h2>Give your next customer a clearer way to buy.</h2><p>Create your page, share the link and continue the conversation on WhatsApp.</p></div>
          <div className="home-final-actions"><Link className="button button-primary" to="/create">Create my product page <span className="button-accent" aria-hidden="true">→</span></Link><Link className="home-final-secondary" to="/create/collection">Create a collection · ₦3,500</Link></div>
        </section>

        <footer className="home-footer">
          <Link className="home-brand" to="/" aria-label="StatusFly home"><span className="home-brand-symbol" aria-hidden="true">S</span><span className="home-brand-word">StatusFly</span></Link>
          <span>Simple product pages. WhatsApp-first ordering.</span>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQs</a>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/recover-edit-link">Recover edit link</Link>
          <a href="https://wa.me/2347052840274" target="_blank" rel="noreferrer">WhatsApp support</a>
          <span className="home-footer-copy">© {new Date().getFullYear()} StatusFly</span>
        </footer>
      </div>
    </main>
  );
}

export default HomePage;
