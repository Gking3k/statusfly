
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { trackPlatformEvent } from "../api/platformAnalytics";

function HomePage() {
  useEffect(() => {
    trackPlatformEvent("home_view");
  }, []);

  return (
    <main className="home-page">
      <div className="home-shell">
        <nav className="home-nav">
          <span className="brand brand-mark">StatusFly</span>

          <span className="home-nav-note">
            WhatsApp-first product pages
          </span>
        </nav>

        <section className="home-hero">
          <div>
            <span className="home-eyebrow">For people selling on WhatsApp</span>

            <h1>
              <span>Your product.</span>
              <span>One focused</span>
              <span className="accent-word">sales page.</span>
            </h1>

            <p className="home-description">
              Stop sending customers through a long conversation just to
              explain what you are selling. Put the product, price, offer,
              delivery details and WhatsApp order button on one clean page.
            </p>

            <div className="home-actions">
              <Link className="button button-primary" to="/create">
                Create my product page
                <span className="button-accent">→</span>
              </Link>

              <Link className="button button-secondary" to="/create">
                ₦3,000 once
              </Link>
            </div>

            <p className="home-microcopy">
              No account · No subscription · Up to 3 product images
            </p>
          </div>

          <div className="home-visual" aria-label="Example StatusFly product page">
            <span className="home-visual-note">What your customer sees</span>

            <div className="home-float-card top">
              <span>Share anywhere</span>
              <strong>One link from your status.</strong>
              <p>
                Post the same product page on WhatsApp, Instagram, Facebook or
                anywhere else.
              </p>
            </div>

            <div className="home-float-card bottom">
              <span>One clear action</span>
              <strong>Order on WhatsApp.</strong>
              <p>
                The customer reaches you with the product context already in
                the conversation.
              </p>
            </div>

            <div className="home-page-mock">
              <div className="home-mock-topbar">
                <span className="home-mock-brand">The Monarch Collection</span>
                <span className="home-mock-pill">Available now</span>
              </div>

              <div className="home-mock-image">
                <div className="home-mock-image-label">PRODUCT PREVIEW</div>
                <div className="home-mock-image-glow" aria-hidden="true" />
              </div>

              <div className="home-mock-content">
                <p className="home-mock-category">Luxury bags</p>

                <h2>Structured Mini Tote</h2>

                <p>
                  A compact everyday bag with a polished finish and enough
                  room for the essentials.
                </p>

                <div className="home-mock-price">
                  <strong>₦85,000</strong>
                  <span>₦100,000</span>
                </div>

                <div className="home-mock-cta">
                  <span>Nationwide delivery available</span>
                  <strong>Order on WhatsApp</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="home-proof">
          <article className="home-proof-card">
            <strong>One product, not a full store.</strong>
            <p>
              Build a focused page around the product you need to sell today.
            </p>
          </article>

          <article className="home-proof-card">
            <strong>Built for the way people already buy.</strong>
            <p>
              Customers read, decide and move straight into your WhatsApp
              conversation.
            </p>
          </article>

          <article className="home-proof-card">
            <strong>Pay once and publish.</strong>
            <p>
              One page costs ₦3,000. No monthly plan is needed for the V1
              experience.
            </p>
          </article>
        </section>
      </div>
    </main>
  );
}

export default HomePage;
