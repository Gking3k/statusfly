import { useState } from "react";
import type { FormEvent } from "react";
import { submitFeedback } from "../api/feedback";

type ReuseIntent = "definitely" | "maybe" | "probably-not";

const improvements = [
  "More styles",
  "Animated statuses",
  "Custom branding",
  "More categories",
  "More customization",
];

function FeedbackForm() {
  const [rating, setRating] = useState(0);
  const [reuseIntent, setReuseIntent] = useState<ReuseIntent | "">("");
  const [improvement, setImprovement] = useState("");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!rating) {
      setStatus("error");
      setMessage("Please choose a rating.");
      return;
    }

    if (!reuseIntent) {
      setStatus("error");
      setMessage("Please tell us whether you'd use StatusFly again.");
      return;
    }

    try {
      setStatus("submitting");
      setMessage("");

      await submitFeedback({
        rating,
        reuseIntent,
        improvement: improvement || undefined,
        comment: comment.trim() || undefined,
      });

      setStatus("success");
      setMessage("Thanks. Your feedback will help shape what we build next.");
    } catch (error) {
      console.error(error);
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "We couldn't send your feedback. Please try again.",
      );
    }
  }

  if (status === "success") {
    return (
      <section className="feedback-panel feedback-success" aria-live="polite">
        <div className="feedback-success-mark">✓</div>
        <div>
          <span>THANK YOU</span>
          <strong>We appreciate the feedback.</strong>
          <p>{message}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="feedback-panel">
      <div className="feedback-heading">
        <div>
          <span>AFTER YOUR DOWNLOAD</span>
          <strong>How did we do?</strong>
        </div>
        <span>30 sec</span>
      </div>

      <form onSubmit={handleSubmit} className="feedback-form">
        <div className="feedback-field">
          <span>Rate your experience</span>
          <div className="feedback-stars" role="radiogroup" aria-label="Rate your experience">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={value <= rating ? "active" : ""}
                role="radio"
                aria-checked={value === rating}
                aria-label={`${value} out of 5 stars`}
                onClick={() => setRating(value)}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        <div className="feedback-field">
          <span>Would you use StatusFly again?</span>
          <div className="feedback-choice-grid">
            {([
              ["definitely", "Definitely"],
              ["maybe", "Maybe"],
              ["probably-not", "Probably not"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={reuseIntent === value ? "active" : ""}
                onClick={() => setReuseIntent(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="feedback-field">
          <span>What should we add next?</span>
          <select value={improvement} onChange={(event) => setImprovement(event.target.value)}>
            <option value="">Choose one (optional)</option>
            {improvements.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="feedback-field">
          <span>Anything else?</span>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Tell us what felt great or what could be better."
          />
        </label>

        <button
          className="feedback-submit"
          type="submit"
          disabled={status === "submitting"}
        >
          {status === "submitting" ? "Sending…" : "Send feedback"}
        </button>

        {status === "error" ? (
          <p className="feedback-error" role="alert">
            {message}
          </p>
        ) : null}
      </form>
    </section>
  );
}

export default FeedbackForm;
