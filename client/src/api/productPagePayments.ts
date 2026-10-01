const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const REQUEST_TIMEOUT_MS = 15_000;

export interface InitializeProductPagePaymentResponse {
  authorizationUrl: string;
  reference: string;
  amountKobo: number;
  currency: "NGN";
}

export interface VerifyProductPagePaymentResponse {
  success: boolean;
  alreadyVerified: boolean;
  publicSlug: string;
  productPageId: string;
  emailSent: boolean;
}

function getErrorMessage(
  data: unknown,
  fallback: string,
) {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string" &&
    data.error.trim()
  ) {
    return data.error;
  }

  return fallback;
}

async function readJson(response: Response) {
  return response.json().catch(() => null) as Promise<unknown>;
}

export async function initializeProductPagePayment(
  editToken: string,
  email: string,
): Promise<InitializeProductPagePaymentResponse> {
  if (!editToken || !email.trim()) {
    throw new Error("Payment details are incomplete.");
  }

  const controller = new AbortController();

  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `${API_URL}/product-pages/edit/${encodeURIComponent(editToken)}/payment/initialize`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
        }),
        signal: controller.signal,
      },
    );

    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(
        getErrorMessage(
          data,
          "We couldn't start the payment. Please try again.",
        ),
      );
    }

    if (
      !data ||
      typeof data !== "object" ||
      !("authorizationUrl" in data) ||
      typeof data.authorizationUrl !== "string" ||
      !data.authorizationUrl ||
      !("reference" in data) ||
      typeof data.reference !== "string" ||
      !data.reference
    ) {
      throw new Error(
        "The server returned an invalid payment session.",
      );
    }

    return data as InitializeProductPagePaymentResponse;
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "The payment request timed out. Please check your connection and try again.",
      );
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Unable to start payment right now.");
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function verifyProductPagePayment(
  reference: string,
): Promise<VerifyProductPagePaymentResponse> {
  if (!reference.trim()) {
    throw new Error("Payment reference is missing.");
  }

  const controller = new AbortController();

  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `${API_URL}/product-pages/payment/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      },
    );

    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(
        getErrorMessage(
          data,
          "We couldn't verify your payment yet.",
        ),
      );
    }

    if (
      !data ||
      typeof data !== "object" ||
      !("success" in data) ||
      data.success !== true ||
      !("publicSlug" in data) ||
      typeof data.publicSlug !== "string" ||
      !data.publicSlug
    ) {
      throw new Error(
        "The server returned an invalid payment confirmation.",
      );
    }

    return data as VerifyProductPagePaymentResponse;
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "Payment verification timed out. Please try again.",
      );
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      "Unable to verify payment right now.",
    );
  } finally {
    window.clearTimeout(timeout);
  }
}