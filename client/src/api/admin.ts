const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const ADMIN_TOKEN_KEY = "statusfly:admin-session";

export type AdminAnalyticsRange = "7d" | "30d" | "all";

export interface AdminAnalytics {
  range: AdminAnalyticsRange;
  generatedAt: string;
  visitors: {
    unique: number;
    homeViews: number;
    createViews: number;
    publicProductPageViews: number;
  };
  funnel: {
    draftsCreated: number;
    paymentStarts: number;
    paymentInitFailures: number;
    successfulPayments: number;
    publishedPages: number;
  };
  productActivity: {
    pageViews: number;
    whatsappClicks: number;
    shareClicks: number;
  };
  business: {
    totalPages: number;
    totalPublishedPages: number;
    totalSuccessfulPayments: number;
    totalRevenueNaira: number;
    periodSuccessfulPayments: number;
    periodRevenueNaira: number;
    periodFeedbackCount: number;
    periodAverageRating: number | null;
    totalFeedbackCount: number;
    totalAverageRating: number | null;
  };
  topProducts: Array<{
    publicSlug: string;
    brandName: string;
    productName: string;
    pageViews: number;
    whatsappClicks: number;
    shareClicks: number;
  }>;
  recentPayments: Array<{
    reference: string;
    amountNaira: number;
    status: string;
    customerEmail: string | null;
    productName: string;
    brandName: string;
    createdAt: string;
  }>;
  recentFeedback: Array<{
    rating: number;
    outcome: string | null;
    featureRequest: string | null;
    improvementText: string | null;
    productName: string | null;
    brandName: string | null;
    createdAt: string;
  }>;
}

interface AdminLoginResponse {
  success: true;
  token: string;
  expiresInSeconds: number;
}

function getErrorMessage(data: unknown, fallback: string) {
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

export function getAdminSessionToken() {
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearAdminSessionToken() {
  try {
    window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function saveAdminSessionToken(token: string) {
  try {
    window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    throw new Error(
      "Your browser could not save the admin session. Please enable session storage and try again.",
    );
  }
}

async function adminFetch(path: string, init: RequestInit = {}) {
  const token = getAdminSessionToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (response.status === 401) {
    clearAdminSessionToken();
  }

  return response;
}

export async function loginAdmin(username: string, password: string) {
  const response = await fetch(`${API_URL}/admin/login`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
    cache: "no-store",
  });

  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(data, "Unable to sign in to admin.")
    );
  }

  if (
    !data ||
    typeof data !== "object" ||
    !("token" in data) ||
    typeof data.token !== "string" ||
    !data.token
  ) {
    throw new Error("The server returned an invalid admin session.");
  }

  saveAdminSessionToken(data.token);

  return data as AdminLoginResponse;
}

export async function getAdminAnalytics(
  range: AdminAnalyticsRange,
) {
  const response = await adminFetch(
    `/admin/analytics?range=${encodeURIComponent(range)}`,
  );
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        data,
        response.status === 401
          ? "Your admin session has expired."
          : "Unable to load StatusFly analytics.",
      ),
    );
  }

  if (
    !data ||
    typeof data !== "object" ||
    !("analytics" in data)
  ) {
    throw new Error("The server returned invalid analytics data.");
  }

  return data.analytics as AdminAnalytics;
}
