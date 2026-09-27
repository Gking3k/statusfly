const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const REQUEST_TIMEOUT_MS = 15_000;

export interface InitializePaymentResponse {
  success: true;
  reference: string;
  accessCode: string;
}

export interface VerifyPaymentResponse {
  success: true;
  verified: boolean;
  status: string;
  reference: string;
  message?: string;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The request timed out. Please try again.");
    }

    throw new Error("Unable to reach StatusFly right now. Please try again.");
  } finally {
    window.clearTimeout(timeout);
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as
    | T
    | { message?: string }
    | null;

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? data.message
        : undefined;

    throw new Error(message || "Something went wrong. Please try again.");
  }

  return data as T;
}

export async function initializePayment(params: {
  email: string;
  campaignId: string;
  productName: string;
}) {
  const response = await fetchWithTimeout(`${API_URL}/payments/initialize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  return parseJson<InitializePaymentResponse>(response);
}

export async function verifyPayment(params: {
  reference: string;
  campaignId: string;
}) {
  const search = new URLSearchParams({
    campaignId: params.campaignId,
  });

  const response = await fetchWithTimeout(
    `${API_URL}/payments/verify/${encodeURIComponent(params.reference)}?${search.toString()}`,
  );

  return parseJson<VerifyPaymentResponse>(response);
}
