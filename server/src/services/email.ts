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
      "Feedback email skipped: RESEND_API_KEY is not configured."
    );
    return;
  }

  if (!to) {
    console.warn(
      "Feedback email skipped: FEEDBACK_TO_EMAIL is not configured."
    );
    return;
  }

  if (!from) {
    console.warn(
      "Feedback email skipped: FEEDBACK_FROM_EMAIL is not configured."
    );
    return;
  }

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `StatusFly feedback — ${feedback.rating}/5`,
      html: `
        <h2>StatusFly Feedback</h2>

        <p><strong>Rating:</strong> ${feedback.rating}/5</p>

        <p>
          <strong>Would use again:</strong>
          ${feedback.wouldUseAgain}
        </p>

        <p>
          <strong>Requested feature:</strong>
          ${feedback.requestedFeature || "(None specified)"}
        </p>

        <p><strong>Message:</strong></p>

        <p>
          ${feedback.message || "(No written feedback)"}
        </p>
      `.trim(),
    }),
  });

  if (!emailResponse.ok) {
    const errorText = await emailResponse.text();

    throw new Error(
      `Resend email failed (${emailResponse.status}): ${errorText}`
    );
  }

  console.log("StatusFly feedback email sent successfully.");
}