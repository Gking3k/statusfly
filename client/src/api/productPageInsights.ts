const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const REQUEST_TIMEOUT_MS = 10_000;

export interface ProductPageInsights {
  productPageId: string;
  publicSlug: string;
  brandName: string;
  productName: string;
  status: "draft" | "published" | "hidden";
  publishedAt: string | null;
  pageViews: number;
  whatsappClicks: number;
  shareClicks: number;
  whatsappConversionRate: number;
  shareRate: number;
}

export async function getProductPageInsights(editToken: string): Promise<ProductPageInsights> {
  if (!editToken) throw new Error("The product page edit token is missing.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${API_URL}/product-pages/edit/${encodeURIComponent(editToken)}/insights`,
      { headers: { Accept: "application/json" }, signal: controller.signal },
    );
    const data = (await response.json().catch(() => null)) as
      | { insights?: ProductPageInsights; error?: string }
      | null;
    if (!response.ok) throw new Error(data?.error || "We couldn't load your page insights.");
    if (!data?.insights?.productPageId) throw new Error("The server returned an invalid insights response.");
    return data.insights;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Loading insights timed out. Please try again.");
    }
    if (error instanceof Error) throw error;
    throw new Error("Unable to load your insights right now.");
  } finally {
    window.clearTimeout(timeout);
  }
}
