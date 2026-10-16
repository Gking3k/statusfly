import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const SUPPORT_URL = "https://wa.me/2347052840274";

interface LegalPageLayoutProps {
  eyebrow: string;
  title: string;
  children: ReactNode;
  showUpdated?: boolean;
}

function LegalPageLayout({ eyebrow, title, children, showUpdated = true }: LegalPageLayoutProps) {
  return (
    <main className="home-page phase7-home legal-page">
      <div className="home-shell">
        <nav className="home-nav" aria-label="Main navigation">
          <Link className="home-brand" to="/" aria-label="StatusFly home">
            <span className="home-brand-symbol" aria-hidden="true">S</span>
            <span className="home-brand-word">StatusFly</span>
          </Link>

          <div className="home-nav-links">
            <Link to="/#pricing">Pricing</Link>
            <Link to="/#faq">FAQ</Link>
          </div>

          <Link className="home-nav-cta" to="/create">
            Get started <span aria-hidden="true">↗</span>
          </Link>
        </nav>

        <article className="legal-content" aria-labelledby="legal-title">
          <Link className="legal-back-link" to="/">← Back to StatusFly</Link>
          <span className="home-section-kicker">{eyebrow}</span>
          <h1 id="legal-title">{title}</h1>
          {showUpdated ? <p className="legal-updated">Last updated: 16 October 2026</p> : null}
          <div className="legal-body">{children}</div>

          <aside className="legal-support-note" aria-label="StatusFly support contact">
            <h2>Need help?</h2>
            <p>
              Contact StatusFly support on WhatsApp for questions about your page,
              payments, editing links, or these policies.
            </p>
            <a href={SUPPORT_URL} target="_blank" rel="noreferrer">
              Chat with StatusFly support <span aria-hidden="true">↗</span>
            </a>
          </aside>
        </article>

        <footer className="home-footer legal-footer">
          <Link className="home-brand" to="/" aria-label="StatusFly home">
            <span className="home-brand-symbol" aria-hidden="true">S</span>
            <span className="home-brand-word">StatusFly</span>
          </Link>
          <span>Simple product pages. WhatsApp-first ordering.</span>
          <Link to="/#pricing">Pricing</Link>
          <Link to="/#faq">FAQs</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/recover-edit-link">Recover edit link</Link>
          <a href={SUPPORT_URL} target="_blank" rel="noreferrer">WhatsApp support</a>
          <span className="home-footer-copy">© {new Date().getFullYear()} StatusFly</span>
        </footer>
      </div>
    </main>
  );
}

export default LegalPageLayout;
