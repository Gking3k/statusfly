import { Link } from "react-router-dom";
import LegalPageLayout from "./LegalPageLayout";

function PrivacyPolicyPage() {
  return (
    <LegalPageLayout eyebrow="Your information" title="Privacy Policy">
      <p>
        This Privacy Policy explains how StatusFly handles information when you
        create or edit a page, make a payment, browse a published page, submit
        feedback, or contact support. Please read it alongside our
        <Link to="/terms"> Terms of Service</Link>.
      </p>

      <h2>1. Information we collect</h2>
      <p>Depending on how you use StatusFly, we may handle the following information:</p>
      <ul>
        <li>
          <strong>Page information:</strong> your brand or business name, product or
          collection names, descriptions, prices, photos, availability, product
          options, selling points, and delivery details that you submit.
        </li>
        <li>
          <strong>WhatsApp contact information:</strong> the WhatsApp number you
          provide for customer enquiries or orders. This number is used to create
          WhatsApp links for your page.
        </li>
        <li>
          <strong>Payment and access information:</strong> the email address you
          enter at checkout, payment reference, amount, currency, payment status,
          timestamps, and verification details. Paystack processes the transaction;
          StatusFly does not need your full card number or card security code to
          provide the page service.
        </li>
        <li>
          <strong>Usage events:</strong> events such as visits to the homepage and
          page builder, payment initiation, public page views, WhatsApp-button
          clicks, and share-button clicks. A random visitor identifier may be stored
          in your browser to help count certain site events.
        </li>
        <li>
          <strong>Feedback and support messages:</strong> ratings, comments, feature
          requests, and the information you choose to send us when asking for help.
        </li>
        <li>
          <strong>Technical and security information:</strong> information needed to
          operate, protect, troubleshoot, and prevent abuse of the service. Our
          hosting and infrastructure providers may also process technical logs as
          part of operating their systems.
        </li>
      </ul>

      <h2>2. Information stored in your browser</h2>
      <p>
        The page builder may save a draft of details you have entered in your
        browser's local storage so you can recover an unfinished form on that
        browser. A random visitor identifier may also be stored there for analytics.
        Other people using the same device or browser profile may be able to access
        locally saved information, so protect your device. Clearing browser site
        data can remove local drafts and the local visitor identifier, but it does
        not delete a page or payment record already stored on our servers.
      </p>

      <h2>3. How we use information</h2>
      <p>We use information to:</p>
      <ul>
        <li>create, publish, display, and let you edit your product pages;</li>
        <li>verify payments and send page links or payment-related messages;</li>
        <li>provide support and investigate payment, access, or technical issues, including matching a recovery request to successful page payments and emailing editing links to the checkout email address;</li>
        <li>measure page visits, WhatsApp clicks, sharing, and general service usage;</li>
        <li>maintain service security, prevent abuse, and troubleshoot errors; and</li>
        <li>meet legal, accounting, payment, and other applicable obligations.</li>
      </ul>

      <h2>4. Published page information</h2>
      <p>
        When you publish a page, the content you submit for public display can be
        seen by visitors and shared by you or others. The WhatsApp number you provide
        is used to create the page's contact/order link; when a visitor clicks that
        link, relevant link information is shared with WhatsApp. Do not submit
        sensitive or confidential information unless you intend it to be public or
        understand why it is needed.
      </p>

      <h2>5. Providers we use</h2>
      <p>
        StatusFly relies on third-party services to operate. These may include
        Paystack for payment processing, Supabase for database and image storage,
        Resend for email delivery, and hosting or infrastructure providers for
        running the application. WhatsApp is used to connect sellers and customers.
        These providers may process relevant information under their own terms and
        privacy policies. Their services and processing locations may change as the
        platform evolves.
      </p>
      <p>
        We do not sell your personal information as a product. We share information
        with providers where reasonably necessary to deliver, secure, or support
        StatusFly, or where required by law.
      </p>

      <h2>6. How long information is kept</h2>
      <p>
        We keep information for as long as reasonably necessary to provide the
        service, keep pages operating, maintain payment and accounting records,
        handle support requests and disputes, protect the platform, and meet legal
        obligations. The period may differ by information type. Published page
        content and analytics records may remain while the page and service are
        operating. We do not promise that every record can be deleted immediately
        on request.
      </p>

      <h2>7. Keeping information safe</h2>
      <p>
        We use technical and organizational measures intended to protect the
        information we handle. No online service or method of storage can be
        guaranteed completely secure. Your private editing link acts as a key to
        your page: anyone who has it may be able to make changes. Keep it private
        and secure the email account where you received it.
      </p>

      <h2>8. Your choices and requests</h2>
      <p>
        You can choose what information to include in your page, avoid publishing
        information you do not want public, and clear locally saved browser drafts.
        You may contact us to ask about access to, correction of, or deletion of
        your information. We will review requests under applicable law and may need
        to retain some records for payment, security, dispute-resolution, or legal
        reasons. We may ask for information to verify your identity or ownership
        before acting on a request.
      </p>

      <h2>9. Children</h2>
      <p>
        StatusFly is a tool for people and businesses creating product pages. It is
        not designed to collect personal information from children. Do not submit a
        child's personal information unless you have the lawful authority to do so.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        We may update this policy when our service, providers, or legal obligations
        change. The latest version and its effective date will be posted on this
        page.
      </p>

      <h2>11. Contact StatusFly</h2>
      <p>
        For privacy questions or requests, contact us through
        <a href="https://wa.me/2347052840274" target="_blank" rel="noreferrer"> StatusFly support on WhatsApp</a>.
        Please do not send your private editing link or payment-card details in a
        support message. We may ask for appropriate information to verify a request.
      </p>
    </LegalPageLayout>
  );
}

export default PrivacyPolicyPage;
