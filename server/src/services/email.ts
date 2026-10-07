function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function sendResendEmail(input: {
  to: string;
  from: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Resend email service is not configured.");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  if (input.idempotencyKey) {
    headers["Idempotency-Key"] = input.idempotencyKey;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Resend email failed (${response.status}): ${errorText}`,
    );
  }
}

function getProductPageFromEmail() {
  return (
    process.env.PRODUCT_PAGE_FROM_EMAIL?.trim() ||
    process.env.FEEDBACK_FROM_EMAIL?.trim() ||
    ""
  );
}

export async function sendProductPageAccessEmail(input: {
  email: string;
  brandName: string;
  productName: string;
  publicUrl: string;
  editUrl: string;
  paymentReference: string;
}): Promise<boolean> {
  const from = getProductPageFromEmail();

  if (!process.env.RESEND_API_KEY?.trim()) {
    console.warn(
      "Product page access email skipped: RESEND_API_KEY is not configured.",
    );
    return false;
  }

  if (!from) {
    console.warn(
      "Product page access email skipped: PRODUCT_PAGE_FROM_EMAIL is not configured.",
    );
    return false;
  }

  const brandName = escapeHtml(input.brandName);
  const productName = escapeHtml(input.productName);
  const publicUrl = escapeHtml(input.publicUrl);
  const editUrl = escapeHtml(input.editUrl);
  const paymentReference = escapeHtml(input.paymentReference);

  try {
    await sendResendEmail({
      to: input.email,
      from,
      subject: `Your StatusFly page is live — ${input.productName}`,
      idempotencyKey: `statusfly-product-page-access/${input.paymentReference}`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#171717;max-width:620px;margin:0 auto;padding:32px 20px;background:#f8f6f1;">
          <div style="background:#171717;color:#ffffff;border-radius:18px;padding:22px 24px;margin-bottom:20px;">
            <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.72;">StatusFly</div>
            <h1 style="font-size:28px;line-height:1.15;margin:10px 0 0;">Your product page is live.</h1>
          </div>

          <div style="background:#ffffff;border:1px solid #e5e1d8;border-radius:18px;padding:24px;">
            <p style="margin-top:0;">Your payment has been confirmed and your page for <strong>${brandName} · ${productName}</strong> is now public.</p>

            <p style="margin:24px 0 8px;font-weight:700;">Public page</p>
            <p style="margin:0 0 18px;"><a href="${publicUrl}" style="color:#8f5b2a;word-break:break-all;">${publicUrl}</a></p>

            <p style="margin:24px 0 8px;font-weight:700;">Private edit link</p>
            <p style="margin:0 0 12px;">Use this link later to edit your product page. You do not need an account.</p>
            <p style="margin:0 0 18px;"><a href="${editUrl}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Edit your page</a></p>
            <p style="margin:0;font-size:13px;color:#6b6b6b;word-break:break-all;">${editUrl}</p>

            <div style="margin-top:24px;padding:14px 16px;background:#f4f1eb;border-radius:12px;font-size:13px;color:#4a4742;">
              Keep your private edit link safe. Anyone who has it can edit this page. Do not post it publicly or share it with customers.
            </div>
          </div>

          <p style="font-size:12px;color:#777;line-height:1.6;margin:18px 4px 0;">
            Payment reference: ${paymentReference}<br />
            StatusFly · ₦3,000 one-time product page
          </p>
        </div>
      `.trim(),
    });

    console.log(
      `StatusFly product page access email sent successfully for ${input.paymentReference}.`,
    );
    return true;
  } catch (error) {
    console.error(
      `StatusFly product page access email failed for ${input.paymentReference}:`,
      error,
    );
    return false;
  }
}

export async function sendFeedbackEmail(feedback: {
  rating: number;
  wouldUseAgain: string;
  requestedFeature: string;
  message: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_TO_EMAIL;
  const from = process.env.FEEDBACK_FROM_EMAIL;

  if (!apiKey) {
    console.warn(
      "Feedback email skipped: RESEND_API_KEY is not configured.",
    );
    return;
  }

  if (!to) {
    console.warn(
      "Feedback email skipped: FEEDBACK_TO_EMAIL is not configured.",
    );
    return;
  }

  if (!from) {
    console.warn(
      "Feedback email skipped: FEEDBACK_FROM_EMAIL is not configured.",
    );
    return;
  }

  await sendResendEmail({
    to,
    from,
    subject: `StatusFly feedback — ${feedback.rating}/5`,
    html: `
      <h2>StatusFly Feedback</h2>
      <p><strong>Rating:</strong> ${feedback.rating}/5</p>
      <p><strong>Would use again:</strong> ${escapeHtml(feedback.wouldUseAgain)}</p>
      <p><strong>Requested feature:</strong> ${escapeHtml(feedback.requestedFeature || "(None specified)")}</p>
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(feedback.message || "(No written feedback)")}</p>
    `.trim(),
  });

  console.log("StatusFly feedback email sent successfully.");
}

function formatFeedbackOutcome(outcome: string | null) {
  switch (outcome) {
    case "yes":
      return "Yes";
    case "not_yet":
      return "Not yet";
    case "inquiry":
      return "I got an inquiry";
    case "customer":
      return "I got a customer";
    case "not_shared":
      return "I have not shared it yet";
    default:
      return "Not provided";
  }
}

export async function sendProductPageFeedbackEmail(input: {
  productPageId: string;
  brandName: string;
  productName: string;
  publicSlug: string;
  rating: number;
  outcome: string | null;
  featureRequest: string | null;
  improvementText: string | null;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.FEEDBACK_TO_EMAIL?.trim();
  const from = process.env.FEEDBACK_FROM_EMAIL?.trim();

  if (!apiKey) {
    console.warn(
      "Product page feedback email skipped: RESEND_API_KEY is not configured.",
    );
    return false;
  }

  if (!to) {
    console.warn(
      "Product page feedback email skipped: FEEDBACK_TO_EMAIL is not configured.",
    );
    return false;
  }

  if (!from) {
    console.warn(
      "Product page feedback email skipped: FEEDBACK_FROM_EMAIL is not configured.",
    );
    return false;
  }

  const brandName = escapeHtml(input.brandName);
  const productName = escapeHtml(input.productName);
  const outcome = escapeHtml(formatFeedbackOutcome(input.outcome));
  const featureRequest = escapeHtml(input.featureRequest || "None specified");
  const improvementText = escapeHtml(
    input.improvementText || "No written feedback",
  );

  const configuredSiteUrl = (
    process.env.PUBLIC_SITE_URL?.trim() ||
    process.env.CLIENT_URL?.trim() ||
    "https://statusfly.com"
  ).replace(/\/+$/, "");

  const publicUrl = `${configuredSiteUrl}/p/${encodeURIComponent(input.publicSlug)}`;

  try {
    await sendResendEmail({
      to,
      from,
      subject: `StatusFly product feedback — ${input.rating}/5`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#171717;max-width:620px;margin:0 auto;padding:32px 20px;background:#f8f6f1;">
          <div style="background:#171717;color:#ffffff;border-radius:18px;padding:22px 24px;margin-bottom:20px;">
            <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.72;">StatusFly</div>
            <h1 style="font-size:28px;line-height:1.15;margin:10px 0 0;">New product feedback.</h1>
          </div>

          <div style="background:#ffffff;border:1px solid #e5e1d8;border-radius:18px;padding:24px;">
            <p style="margin-top:0;"><strong>${brandName} · ${productName}</strong></p>

            <p style="margin:20px 0 8px;font-weight:700;">Rating</p>
            <p style="margin:0;">${input.rating}/5</p>

            <p style="margin:20px 0 8px;font-weight:700;">Did StatusFly help get a customer?</p>
            <p style="margin:0;">${outcome}</p>

            <p style="margin:20px 0 8px;font-weight:700;">Feature request</p>
            <p style="margin:0;">${featureRequest}</p>

            <p style="margin:20px 0 8px;font-weight:700;">Improvement feedback</p>
            <p style="margin:0;white-space:pre-wrap;">${improvementText}</p>

            <p style="margin:24px 0 0;font-size:13px;color:#6b6b6b;">
              Product page: <a href="${escapeHtml(publicUrl)}" style="color:#8f5b2a;">${escapeHtml(publicUrl)}</a>
            </p>
          </div>

          <p style="font-size:12px;color:#777;line-height:1.6;margin:18px 4px 0;">
            Product page ID: ${escapeHtml(input.productPageId)}<br />
            StatusFly feedback notification
          </p>
        </div>
      `.trim(),
    });

    console.log(
      `StatusFly product page feedback email sent successfully for ${input.productPageId}.`,
    );
    return true;
  } catch (error) {
    console.error(
      `StatusFly product page feedback email failed for ${input.productPageId}:`,
      error,
    );
    return false;
  }
}
