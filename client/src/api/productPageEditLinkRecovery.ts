const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export async function requestProductPageEditLinkRecovery(email: string): Promise<string> {
  const response = await fetch(`${API_URL}/product-pages/recover-edit-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });

  const body = await response.json().catch(() => null) as
    | { message?: unknown; error?: unknown }
    | null;

  if (!response.ok) {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "We couldn't submit your recovery request. Please try again later.",
    );
  }

  return typeof body?.message === "string"
    ? body.message
    : "If a paid StatusFly page is associated with that email and recovery is available, we'll send the editing link shortly.";
}
