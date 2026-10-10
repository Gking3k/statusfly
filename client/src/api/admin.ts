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
    totalGrossRevenueNaira: number;
    totalProcessedRefundNaira: number;
    totalPendingRefundNaira: number;
    totalRevenueNaira: number;
    periodSuccessfulPayments: number;
    periodGrossRevenueNaira: number;
    periodProcessedRefundNaira: number;
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

export type AdminAnalyticsResetScope = "platform" | "product_page";
export type AdminAnalyticsResetMetric =
  | "unique_visitors"
  | "home_views"
  | "create_views"
  | "drafts_created"
  | "payment_starts"
  | "payment_init_failures"
  | "public_product_page_views"
  | "product_page_views"
  | "whatsapp_clicks"
  | "share_clicks";

export interface AdminAnalyticsResetRequest {
  scopeType: AdminAnalyticsResetScope;
  scopeId?: string;
  metricKeys: AdminAnalyticsResetMetric[];
  reason: string;
}

export interface AdminAnalyticsResetResponse {
  success: true;
  scopeType: AdminAnalyticsResetScope;
  scopeId: string | null;
  metricKeys: AdminAnalyticsResetMetric[];
  resetAt: string;
  historicalEventsPreserved: true;
  financialRecordsChanged: false;
}

export interface AdminAuditEvent {
  id: string;
  actorUsername: string;
  action: string;
  entityType: string;
  entityId: string | null;
  outcome: "started" | "succeeded" | "failed";
  reason: string | null;
  createdAt: string;
}

export async function getAdminAuditLog(limit = 20): Promise<AdminAuditEvent[]> {
  const response = await adminFetch(
    `/admin/audit-log?limit=${encodeURIComponent(String(limit))}`,
  );
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(data, "Unable to load the admin activity log."),
    );
  }

  if (
    !data ||
    typeof data !== "object" ||
    !("events" in data) ||
    !Array.isArray(data.events)
  ) {
    throw new Error("The server returned invalid admin activity data.");
  }

  return data.events as AdminAuditEvent[];
}

export type AdminProductPageStatus = "draft" | "published" | "hidden";
export type AdminProductPageStatusFilter =
  | "all"
  | "draft"
  | "published"
  | "hidden"
  | "archived";

export interface AdminProductPageListItem {
  id: string;
  publicSlug: string;
  brandName: string;
  productName: string;
  category: string;
  priceNaira: number;
  status: AdminProductPageStatus;
  archivedAt: string | null;
  isArchived: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  imageCount: number;
  paymentCount: number;
  successfulPaymentCount: number;
  lifetimeRevenueNaira: number;
  pageViews: number;
  whatsappClicks: number;
  shareClicks: number;
}

export interface AdminProductPagesResponse {
  pages: AdminProductPageListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminProductPageDetail {
  page: AdminProductPageListItem & {
    whatsappNumber: string;
    deliveryInfo: string;
    description: string;
    sellingPoints: string[];
    originalPriceNaira: number | null;
    promotionText: string | null;
    promotionEndAt: string | null;
    availability: string;
    feedbackCount: number;
    averageRating: number | null;
  };
  images: Array<{ id: string; publicUrl: string; position: number }>;
}

async function adminMutation<T>(path: string, method: "PATCH" | "POST" | "DELETE", body?: unknown): Promise<T> {
  const response = await adminFetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "Unable to complete the admin action."));
  }

  return data as T;
}

export async function resetAdminAnalytics(
  input: AdminAnalyticsResetRequest,
): Promise<AdminAnalyticsResetResponse> {
  return adminMutation<AdminAnalyticsResetResponse>("/admin/analytics/reset", "POST", input);
}

export interface AdminRevenueResetRequest {
  reason: string;
  confirmed: true;
}

export interface AdminRevenueResetResponse {
  success: true;
  resetAt: string;
  historicalFinancialRecordsPreserved: true;
  financialRecordsChanged: false;
}

export async function resetAdminRevenueReporting(
  input: AdminRevenueResetRequest,
): Promise<AdminRevenueResetResponse> {
  return adminMutation<AdminRevenueResetResponse>("/admin/analytics/revenue-reset", "POST", input);
}

export async function getAdminProductPages(options: {
  q: string;
  status: AdminProductPageStatusFilter;
  page: number;
  pageSize?: number;
}): Promise<AdminProductPagesResponse> {
  const params = new URLSearchParams({
    q: options.q,
    status: options.status,
    page: String(options.page),
    pageSize: String(options.pageSize ?? 20),
  });
  const response = await adminFetch(`/admin/product-pages?${params.toString()}`);
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "Unable to load product pages."));
  }
  if (!data || typeof data !== "object" || !("pages" in data) || !("pagination" in data)) {
    throw new Error("The server returned invalid product-page data.");
  }
  return data as AdminProductPagesResponse;
}

export async function getAdminProductPageDetail(id: string): Promise<AdminProductPageDetail> {
  const response = await adminFetch(`/admin/product-pages/${encodeURIComponent(id)}`);
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "Unable to load product-page details."));
  }
  if (!data || typeof data !== "object" || !("page" in data) || !("images" in data)) {
    throw new Error("The server returned invalid product-page details.");
  }
  return data as AdminProductPageDetail;
}

export async function setAdminProductPageStatus(
  id: string,
  status: "published" | "hidden",
  reason: string | null,
) {
  return adminMutation<{ productPage: { id: string; status: AdminProductPageStatus } }>(
    `/admin/product-pages/${encodeURIComponent(id)}/status`,
    "PATCH",
    { status, reason },
  );
}

export async function archiveAdminProductPage(id: string, reason: string | null) {
  return adminMutation<{ productPage: { id: string; status: AdminProductPageStatus; archived: true } }>(
    `/admin/product-pages/${encodeURIComponent(id)}/archive`,
    "POST",
    { reason },
  );
}

export async function restoreAdminProductPage(id: string, reason: string | null) {
  return adminMutation<{ productPage: { id: string; status: AdminProductPageStatus; archived: false } }>(
    `/admin/product-pages/${encodeURIComponent(id)}/restore`,
    "POST",
    { reason },
  );
}

export async function permanentlyDeleteAdminProductPage(id: string, reason: string) {
  return adminMutation<{
    success: true;
    deleted: true;
    imageCount: number;
    storageCleanup: "attempted" | "skipped_non_production";
  }>(
    `/admin/product-pages/${encodeURIComponent(id)}`,
    "DELETE",
    { reason },
  );
}

export type AdminManagedPaymentStatus = "pending" | "success" | "failed" | "invalid";
export type AdminManagedPaymentStatusFilter = "all" | AdminManagedPaymentStatus;
export type AdminManagedRefundStatus =
  | "initiating"
  | "pending"
  | "processing"
  | "needs-attention"
  | "processed"
  | "failed"
  | "initiation_unknown";

export interface AdminManagedPayment {
  id: string;
  productPageId: string;
  reference: string;
  amountKobo: number;
  currency: string;
  status: AdminManagedPaymentStatus;
  customerEmail: string | null;
  productName: string;
  brandName: string;
  publicSlug: string;
  createdAt: string;
  verifiedAt: string | null;
  verifiedVia: string | null;
  processedRefundKobo: number;
  pendingRefundKobo: number;
  refundableKobo: number;
  refundCount: number;
  latestRefundStatus: AdminManagedRefundStatus | null;
}

export interface AdminManagedRefund {
  id: string;
  paymentReference: string;
  paystackRefundId: number | null;
  amountKobo: number;
  currency: string;
  status: AdminManagedRefundStatus;
  reason: string;
  createdBy: string;
  lastProviderEvent: string | null;
  providerMessage: string | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
}

export interface AdminPaymentDetailResponse {
  payment: AdminManagedPayment;
  refunds: AdminManagedRefund[];
}

export interface AdminPaymentsResponse {
  payments: AdminManagedPayment[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    paymentCount: number;
    successfulPayments: number;
    grossRevenueKobo: number;
    processedRefundKobo: number;
    netRevenueKobo: number;
    pendingRefundKobo: number;
  };
}

export async function getAdminPayments(options: {
  q: string;
  status: AdminManagedPaymentStatusFilter;
  page: number;
  pageSize?: number;
}): Promise<AdminPaymentsResponse> {
  const params = new URLSearchParams({
    q: options.q,
    status: options.status,
    page: String(options.page),
    pageSize: String(options.pageSize ?? 20),
  });
  const response = await adminFetch(`/admin/payments?${params.toString()}`);
  const data = await readJson(response);
  if (!response.ok) throw new Error(getErrorMessage(data, "Unable to load payment records."));
  if (!data || typeof data !== "object" || !("payments" in data) || !("pagination" in data) || !("summary" in data)) {
    throw new Error("The server returned invalid payment data.");
  }
  return data as AdminPaymentsResponse;
}

export async function getAdminPaymentDetail(reference: string): Promise<AdminPaymentDetailResponse> {
  const response = await adminFetch(`/admin/payments/${encodeURIComponent(reference)}`);
  const data = await readJson(response);
  if (!response.ok) throw new Error(getErrorMessage(data, "Unable to load payment details."));
  if (!data || typeof data !== "object" || !("payment" in data) || !("refunds" in data)) {
    throw new Error("The server returned invalid payment details.");
  }
  return data as AdminPaymentDetailResponse;
}

export interface AdminPaymentVerificationResponse extends AdminPaymentDetailResponse {
  verification: {
    matched: boolean;
    outcome: string;
    providerStatus: string;
    message: string;
    payment: AdminManagedPayment | null;
  };
}

export async function verifyAdminPayment(reference: string): Promise<AdminPaymentVerificationResponse> {
  const response = await adminFetch(`/admin/payments/${encodeURIComponent(reference)}/verify`, {
    method: "POST",
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(getErrorMessage(data, "Unable to verify payment with Paystack."));
  if (!data || typeof data !== "object" || !("verification" in data) || !("payment" in data) || !("refunds" in data)) {
    throw new Error("The server returned invalid payment verification data.");
  }
  return data as AdminPaymentVerificationResponse;
}

export async function initiateAdminRefund(input: {
  reference: string;
  amountKobo: number;
  reason: string;
  requestId: string;
}): Promise<{ refund: AdminManagedRefund; replayed: boolean; payment: AdminPaymentDetailResponse | null }> {
  const response = await adminFetch(`/admin/payments/${encodeURIComponent(input.reference)}/refunds`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amountKobo: input.amountKobo,
      reason: input.reason,
      requestId: input.requestId,
    }),
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(getErrorMessage(data, "Unable to initiate refund."));
  if (!data || typeof data !== "object" || !("refund" in data)) {
    throw new Error("The server returned invalid refund data.");
  }
  return data as { refund: AdminManagedRefund; replayed: boolean; payment: AdminPaymentDetailResponse | null };
}

export async function refreshAdminRefund(id: string): Promise<{
  refund: AdminManagedRefund;
  payment: AdminPaymentDetailResponse | null;
}> {
  const response = await adminFetch(`/admin/refunds/${encodeURIComponent(id)}/refresh`, {
    method: "POST",
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(getErrorMessage(data, "Unable to refresh refund status."));
  if (!data || typeof data !== "object" || !("refund" in data)) {
    throw new Error("The server returned invalid refund status data.");
  }
  return data as { refund: AdminManagedRefund; payment: AdminPaymentDetailResponse | null };
}
