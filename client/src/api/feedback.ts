const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const REQUEST_TIMEOUT_MS = 10_000;

export async function submitFeedback(params: {
  rating: number;
  reuseIntent: "definitely" | "maybe" | "probably-not";
  improvement?: string;
  comment?: string;
}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${API_URL}/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    const data = (await response.json().catch(() => null)) as
      | { message?: string; success?: boolean }
      | null;

    if (!response.ok) {
      throw new Error(data?.message || "We couldn't send your feedback. Please try again.");
    }

    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The feedback request timed out. Please try again.");
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Unable to send feedback right now. Please try again.");
  } finally {
    window.clearTimeout(timeout);
  }
}
