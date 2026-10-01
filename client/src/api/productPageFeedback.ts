const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const REQUEST_TIMEOUT_MS = 10_000;

export type ProductPageFeedbackOutcome = "yes" | "not_yet" | "inquiry" | "customer" | "not_shared";

export async function submitProductPageFeedback(
  editToken: string,
  input: {
    rating: number;
    outcome?: ProductPageFeedbackOutcome | null;
    featureRequest?: string | null;
    improvementText?: string | null;
  },
) {
  if (!editToken) throw new Error("The product page edit token is missing.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${API_URL}/product-pages/edit/${encodeURIComponent(editToken)}/feedback`,
      {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      },
    );
    const data = (await response.json().catch(() => null)) as
      | { success?: boolean; message?: string }
      | null;
    if (!response.ok) throw new Error(data?.message || "We couldn't save your feedback. Please try again.");
    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The feedback request timed out. Please try again.");
    }
    if (error instanceof Error) throw error;
    throw new Error("Unable to save your feedback right now.");
  } finally {
    window.clearTimeout(timeout);
  }
}
