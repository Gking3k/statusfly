import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 465),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendFeedbackEmail(feedback: {
  rating: number;
  wouldUseAgain: string;
  requestedFeature: string;
  message: string;
}) {
  const to = process.env.FEEDBACK_TO_EMAIL;

  if (!to) {
    console.warn(
        "Feedback email skipped: FEEDBACK_TO_EMAIL is not configured."
    );
    return;
 }

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject: `StatusFly feedback — ${feedback.rating}/5`,
    text: `
StatusFly Feedback

Rating: ${feedback.rating}/5
Would use again: ${feedback.wouldUseAgain}
Requested feature: ${feedback.requestedFeature}

Message:
${feedback.message || "(No written feedback)"}
    `.trim(),
  });
}