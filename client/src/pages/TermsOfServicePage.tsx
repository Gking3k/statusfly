import { Link } from "react-router-dom";
import LegalPageLayout from "./LegalPageLayout";

function TermsOfServicePage() {
  return (
    <LegalPageLayout eyebrow="Using StatusFly" title="Terms of Service">
      <p>
        These Terms of Service explain the rules for using StatusFly. By creating,
        purchasing, editing, or sharing a StatusFly page, you agree to these terms.
        If you do not agree, please do not use the service.
      </p>

      <h2>1. What StatusFly provides</h2>
      <p>
        StatusFly lets sellers create a public page for a product or a collection
        of products, share that page, and direct interested customers to WhatsApp.
        The current collection option supports 2–10 products, with up to three
        images per product. Features may change as the service develops.
      </p>
      <p>
        StatusFly provides the page-building and page-hosting service. It is not the
        seller of the products displayed on a seller's page and does not arrange
        delivery or complete sales between sellers and their customers.
      </p>

      <h2>2. Prices and one-time payment</h2>
      <p>
        The current limited-time launch prices are ₦3,000 for a single-product page
        and ₦3,500 for a collection of 2–10 products. The applicable price is the
        amount shown at checkout before you pay. These launch prices may change for
        future purchases; a price change does not, by itself, change the amount
        already paid for a completed purchase.
      </p>
      <p>
        Under the current pricing, page creation is paid for once. There is no
        monthly subscription or recurring hosting fee charged to the seller. This
        one-time payment is not a promise of lifetime hosting or uninterrupted
        availability; hosting is covered in Section 5 below.
      </p>

      <h2>3. Payments, failed transactions, and refunds</h2>
      <p>
        Payments are processed through Paystack. A page is published or made
        available as paid only after the payment has been verified by StatusFly.
        Paystack's own terms and privacy practices also apply to the payment
        process. StatusFly does not ask you to send card details through WhatsApp.
      </p>
      <p>
        If money appears to have been deducted but your page was not published or
        access was not delivered, contact support and provide the payment reference
        and the email address used at checkout. We will investigate and work to
        resolve confirmed duplicate, failed, or undelivered transactions. Where a
        refund is appropriate, it will be handled in line with applicable law and
        payment-provider procedures. Contacting support does not guarantee that
        every request will qualify for a refund.
      </p>

      <h2>4. Your page and your responsibilities</h2>
      <p>
        You are responsible for the accuracy and legality of the information you
        submit, including product names, descriptions, prices, photos, availability,
        delivery information, and your WhatsApp contact details. You must have the
        rights and permissions needed to use the content you upload.
      </p>
      <p>You must not use StatusFly to publish or promote content that:</p>
      <ul>
        <li>is illegal, fraudulent, deceptive, or intended to scam customers;</li>
        <li>infringes another person's intellectual-property, privacy, or other rights;</li>
        <li>contains malicious software or attempts to compromise the service; or</li>
        <li>violates applicable law or these Terms of Service.</li>
      </ul>
      <p>
        You are responsible for handling customer questions, pricing disputes,
        orders, delivery, taxes or charges that apply to your business, returns,
        refunds, warranties, and fulfilment. Make your own terms clear to your
        customers before completing a sale.
      </p>

      <h2>5. Hosting, availability, and service changes</h2>
      <p>
        Your one-time payment is for the page-creation service as currently offered;
        it does not guarantee that a page will remain online forever. We intend to
        keep compliant pages accessible while StatusFly remains operational, but
        availability may be affected by maintenance, technical failures, security
        incidents, third-party providers, or circumstances outside our control.
      </p>
      <p>
        We will make reasonable efforts to maintain the service and give reasonable
        notice if we need to discontinue StatusFly or materially affect page
        availability, where practicable. We cannot guarantee uninterrupted access
        or a specific minimum hosting period. If a page must be restricted for
        legal, security, abuse-prevention, or policy reasons, we may take action
        without advance notice when necessary.
      </p>

      <h2>6. Editing links and access security</h2>
      <p>
        StatusFly does not currently require a seller account. Your private editing
        link acts as a credential for managing your page. Anyone who obtains the
        link may be able to edit the page, so do not post it publicly or share it
        with customers. Keep it and the email account where it was delivered secure.
      </p>
      <p>
        If you lose your editing link, use the <Link to="/recover-edit-link">editing-link recovery page</Link>
        and enter the same email address used at checkout. If a successful payment
        and recoverable access token are associated with that address, we will email
        the link there. Recovery is not guaranteed for every page, particularly if
        a token was not securely saved. You can also contact support for assistance.
        Do not send your private editing link to anyone claiming to be support unless
        you are sure the request is legitimate.
      </p>

      <h2>7. Public pages and third-party services</h2>
      <p>
        When you publish a page, its public-facing content may be viewed by anyone
        with the page link and may be shared elsewhere. Do not publish private or
        sensitive information that should not be public. When a visitor uses a
        WhatsApp button, they leave or interact with a third-party service. WhatsApp,
        Paystack, and other providers operate under their own terms, privacy
        policies, availability, and technical controls.
      </p>

      <h2>8. Suspending or removing a page</h2>
      <p>
        We may suspend, restrict, unpublish, or remove a page if we reasonably
        believe it violates these terms or the law, risks harm, threatens the
        security or operation of StatusFly, or exposes us or others to legal risk.
        Where appropriate and practicable, we will try to explain the reason or
        let you contact support about the decision.
      </p>

      <h2>9. Service limitations</h2>
      <p>
        We work to keep StatusFly reliable, but we cannot promise that the service
        will always be available, error-free, or compatible with every device or
        third-party service. StatusFly does not guarantee that a page will generate
        enquiries, customers, or revenue. To the extent permitted by law, StatusFly
        is not responsible for seller-customer disputes, missed sales, delivery
        issues, WhatsApp outages, or third-party service interruptions. Nothing in
        these terms excludes a right or liability that cannot lawfully be excluded.
      </p>

      <h2>10. Privacy</h2>
      <p>
        Our <Link to="/privacy">Privacy Policy</Link> explains the information we
        collect and how it is used. By using StatusFly, you acknowledge that your
        information will be handled as described in that policy.
      </p>

      <h2>11. Changes to these terms</h2>
      <p>
        We may update these terms as the service or its legal requirements change.
        We will post the revised version on this page and update the date above.
        Changes apply from the date they take effect and do not automatically
        change the price already paid for a completed purchase.
      </p>

      <h2>12. Applicable law and contact</h2>
      <p>
        These terms are intended to operate under applicable laws of Nigeria,
        subject to any mandatory consumer rights or legal protections that apply.
        If you have a question, complaint, or payment issue, contact us through
        <a href="https://wa.me/2347052840274" target="_blank" rel="noreferrer"> StatusFly support on WhatsApp</a>.
      </p>
    </LegalPageLayout>
  );
}

export default TermsOfServicePage;
