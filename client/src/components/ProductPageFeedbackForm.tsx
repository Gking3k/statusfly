import { useState } from "react";
import type { FormEvent } from "react";
import { submitProductPageFeedback, type ProductPageFeedbackOutcome } from "../api/productPageFeedback";

const OUTCOMES: Array<{ value: ProductPageFeedbackOutcome; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "not_yet", label: "Not yet" },
  { value: "inquiry", label: "I got an inquiry" },
  { value: "customer", label: "I got a customer" },
  { value: "not_shared", label: "I haven't shared it yet" },
];

const FEATURES = [
  "More product page customization",
  "Custom branding",
  "More image options",
  "Better sharing tools",
  "More analytics",
  "Something else",
];

export default function ProductPageFeedbackForm({ editToken }: { editToken: string }) {
  const [rating, setRating] = useState(0);
  const [outcome, setOutcome] = useState<ProductPageFeedbackOutcome | "">("");
  const [featureRequest, setFeatureRequest] = useState("");
  const [improvementText, setImprovementText] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rating) {
      setStatus("error");
      setMessage("Choose a rating from 1 to 5.");
      return;
    }
    setStatus("submitting");
    setMessage("");
    try {
      await submitProductPageFeedback(editToken, {
        rating,
        outcome: outcome || null,
        featureRequest: featureRequest || null,
        improvementText: improvementText.trim() || null,
      });
      setStatus("success");
      setMessage("Thanks. Your feedback helps us improve StatusFly.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to save your feedback.");
    }
  }

  if (status === "success") {
    return (
      <section className="phase8-feedback-card" aria-live="polite">
        <div className="phase8-feedback-mark">✓</div>
        <span className="phase8-card-kicker">Feedback received</span>
        <h2>Thanks for helping shape StatusFly.</h2>
        <p>{message}</p>
      </section>
    );
  }

  return (
    <section className="phase8-feedback-card">
      <div className="phase8-card-heading">
        <div>
          <span className="phase8-card-kicker">Product feedback</span>
          <h2>How is StatusFly working for you?</h2>
          <p>This stays private and is used to improve the product.</p>
        </div>
        <span className="phase8-time-note">30 sec</span>
      </div>

      <form onSubmit={handleSubmit} className="phase8-feedback-form">
        <div className="phase8-feedback-field">
          <span>Rate your experience</span>
          <div className="phase8-stars" role="radiogroup" aria-label="Rate your StatusFly experience">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={value <= rating ? "active" : ""}
                role="radio"
                aria-checked={value === rating}
                aria-label={`${value} out of 5`}
                onClick={() => setRating(value)}
              >★</button>
            ))}
          </div>
        </div>

        <div className="phase8-feedback-field">
          <span>Did StatusFly help you get a customer?</span>
          <div className="phase8-choice-grid">
            {OUTCOMES.map((item) => (
              <button key={item.value} type="button" className={outcome === item.value ? "active" : ""} onClick={() => setOutcome(item.value)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <label className="phase8-feedback-field">
          <span>What should we improve next?</span>
          <select value={featureRequest} onChange={(event) => setFeatureRequest(event.target.value)}>
            <option value="">Choose one (optional)</option>
            {FEATURES.map((feature) => <option key={feature} value={feature}>{feature}</option>)}
          </select>
        </label>

        <label className="phase8-feedback-field">
          <span>Anything else?</span>
          <textarea value={improvementText} onChange={(event) => setImprovementText(event.target.value)} maxLength={2000} rows={4} placeholder="Tell us what felt useful or what made selling harder." />
        </label>

        <button type="submit" className="button button-primary" disabled={status === "submitting"}>
          {status === "submitting" ? "Sending…" : "Send private feedback"}
          <span className="button-accent">{status === "submitting" ? "…" : "→"}</span>
        </button>

        {status === "error" ? <p className="phase8-feedback-error" role="alert">{message}</p> : null}
      </form>
    </section>
  );
}
