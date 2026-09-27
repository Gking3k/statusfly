import { Link } from "react-router-dom";

function HomePage() {
  return (
    <main className="home-page">
      <div className="home-orb home-orb-one" />
      <div className="home-orb home-orb-two" />
      <div className="home-grid" />

      <nav className="home-nav">
        <div className="brand-lockup">
          <span className="brand-dot" />
          <span className="brand">StatusFly</span>
        </div>
        <span className="nav-note">A G3 Web Studio product</span>
      </nav>

      <section className="home-content">
        <div className="home-copy">
          <span className="eyebrow">WhatsApp creative, without the designer</span>
          <h1>
            Make your product
            <em>look worth buying.</em>
          </h1>
          <p>
            Upload one product photo and turn it into a five-part WhatsApp
            selling sequence — styled, written and ready to post.
          </p>

          <div className="home-actions">
            <Link className="button button-primary" to="/create">
              Create my pack — ₦1,000
              <span>↗</span>
            </Link>
            <span className="home-note">No account · No subscription</span>
          </div>
        </div>

        <div className="home-preview-stack" aria-hidden="true">
          <div className="home-card home-card-back home-card-street">
            <span>WHY IT</span>
            <strong>Made to be noticed.</strong>
          </div>
          <div className="home-card home-card-back home-card-luxe">
            <span>TODAY'S PRICE</span>
            <strong>₦2,500</strong>
          </div>
          <div className="home-card home-card-front">
            <span className="home-card-label">NEW DROP</span>
            <div className="home-product-shape" />
            <div className="home-card-copy">
              <strong>ROSE CLAY</strong>
              <span>Elite Cleanser</span>
            </div>
            <div className="home-card-footer">
              <span>BEAUTY</span>
              <strong>₦2,500</strong>
            </div>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <span>01 / 05</span>
        <span>Your product. Five statuses. Ready to sell.</span>
      </footer>
    </main>
  );
}

export default HomePage;
