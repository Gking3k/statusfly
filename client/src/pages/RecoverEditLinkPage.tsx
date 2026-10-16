import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { requestProductPageEditLinkRecovery } from "../api/productPageEditLinkRecovery";
import LegalPageLayout from "./LegalPageLayout";

type RecoveryStatus = "idle" | "submitting" | "submitted" | "error";

function RecoverEditLinkPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<RecoveryStatus>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const responseMessage = await requestProductPageEditLinkRecovery(email);
      setMessage(responseMessage);
      setStatus("submitted");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "We couldn't submit your request. Please try again later.",
      );
      setStatus("error");
    }
  }

  return (
    <LegalPageLayout
      eyebrow="Page access"
      title="Recover your editing link"
      showUpdated={false}
    >
      <p>
        Enter the email address you used when paying for your StatusFly page. If
        a successful payment and recoverable page are associated with that email,
        we'll send the private editing link to that inbox.
      </p>

      <form className="recovery-form" onSubmit={handleSubmit}>
        <label htmlFor="recovery-email">Email used at checkout</label>
        <input
          id="recovery-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          disabled={status === "submitting"}
        />
        <button
          className="button button-primary recovery-submit"
          type="submit"
          disabled={status === "submitting"}
        >
          {status === "submitting" ? "Sending request…" : "Send recovery email"}
          <span className="button-accent" aria-hidden="true">→</span>
        </button>
        {message ? (
          <p
            className={`recovery-feedback ${status === "error" ? "is-error" : "is-success"}`}
            role={status === "error" ? "alert" : "status"}
          >
            {message}
          </p>
        ) : null}
      </form>

      <p className="recovery-privacy-note">
        For privacy, this page does not confirm whether an email has a paid page.
        If a recovery email doesn't arrive, check your spam folder and make sure
        you entered the same address used at checkout. Some older pages may not
        be recoverable automatically if their access token was not securely saved.
      </p>
      <p>
        Still stuck? <a href="https://wa.me/2347052840274" target="_blank" rel="noreferrer">Contact StatusFly support on WhatsApp</a>.
      </p>
      <p><Link to="/">Return to StatusFly</Link></p>
    </LegalPageLayout>
  );
}

export default RecoverEditLinkPage;
