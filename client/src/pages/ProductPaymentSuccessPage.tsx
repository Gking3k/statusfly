import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { verifyProductPagePayment } from "../api/productPagePayments";
import { getProductPageDraftHandoff } from "../utils/productPageDraft";

function ProductPaymentSuccessPage() {
  const location = useLocation();

  const [status, setStatus] = useState<
    "loading" | "success" | "error"
  >("loading");

  const [message, setMessage] = useState(
    "Confirming your payment securely.",
  );

  const [publicSlug, setPublicSlug] = useState("");
  const [editToken, setEditToken] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  const reference = useMemo(
    () =>
      new URLSearchParams(location.search)
        .get("reference")
        ?.trim() || "",
    [location.search],
  );

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      if (!reference) {
        setStatus("error");
        setMessage(
          "This payment confirmation link is incomplete.",
        );
        return;
      }

      try {
        const result =
          await verifyProductPagePayment(reference);

        const handoff =
          getProductPageDraftHandoff();

        if (cancelled) {
          return;
        }

        setPublicSlug(result.publicSlug);

        setEditToken(
          handoff?.publicSlug === result.publicSlug
            ? handoff.editToken
            : "",
        );

        setEmailSent(result.emailSent === true);

        setStatus("success");

        setMessage(
          result.emailSent === true
            ? "Your payment is confirmed, your product page is live, and we emailed you a secure backup of your page access details."
            : "Your payment is confirmed and your product page is live. Keep the private edit link below somewhere safe.",
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        setStatus("error");

        setMessage(
          error instanceof Error
            ? error.message
            : "We couldn't confirm the payment yet.",
        );
      }
    }

    void verify();

    return () => {
      cancelled = true;
    };
  }, [reference]);

  const publicUrl = publicSlug
    ? `/p/${publicSlug}`
    : "";

  const editUrl = editToken
    ? `/edit/${editToken}`
    : "";

  if (status === "loading") {
    return (
      <main className="payment-result-page">
        <div className="payment-result-card">
          <span className="payment-result-kicker">
            StatusFly
          </span>

          <div
            className="payment-result-spinner"
            aria-hidden="true"
          />

          <h1>Confirming your payment</h1>

          <p>{message}</p>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="payment-result-page">
        <div className="payment-result-card">
          <span className="payment-result-kicker">
            StatusFly
          </span>

          <div className="payment-result-icon payment-result-icon-error">
            !
          </div>

          <h1>
            We couldn't confirm the payment.
          </h1>

          <p>{message}</p>

          <div className="payment-result-actions">
            <Link
              className="button button-primary"
              to="/create"
            >
              Return to builder
              <span className="button-accent">
                ↗
              </span>
            </Link>

            {reference ? (
              <span className="payment-reference">
                Reference: {reference}
              </span>
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="payment-result-page">
      <div className="payment-result-card success">
        <span className="payment-result-kicker">
          Payment confirmed
        </span>

        <div className="payment-result-icon">
          ✓
        </div>

        <h1>
          Your product page is live.
        </h1>

        <p>{message}</p>

        <div className="payment-live-url">
          <span>Public page</span>

          <strong>
            {window.location.origin}
            {publicUrl}
          </strong>
        </div>

        <div className="payment-result-actions">
          <Link
            className="button button-primary"
            to={publicUrl}
          >
            View product page
            <span className="button-accent">
              ↗
            </span>
          </Link>

          {editUrl ? (
            <Link
              className="button button-secondary"
              to={editUrl}
            >
              Edit your page ✎
            </Link>
          ) : null}

          {editUrl ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${window.location.origin}${editUrl}`,
                  );
                } catch {
                  // Link remains visible below.
                }
              }}
            >
              Copy private edit link
            </button>
          ) : null}
        </div>

        {editUrl ? (
          <div className="payment-private-link">
            <span>Private edit link</span>

            <code>
              {window.location.origin}
              {editUrl}
            </code>
          </div>
        ) : null}

        <p className="payment-result-note">
          {emailSent
            ? "We also sent these access details to your email. Save the private edit link because it is your access to this page — no account is required."
            : "Keep this private edit link safe. It is your access to this page, and no account is required."}
        </p>
      </div>
    </main>
  );
}

export default ProductPaymentSuccessPage;