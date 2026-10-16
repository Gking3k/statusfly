import type { IncomingMessage, ServerResponse } from "node:http";

type PageRecord = Record<string, unknown>;
type PreviewRequest = IncomingMessage & { url?: string };

const SITE_URL = (process.env.PUBLIC_SITE_URL?.trim() || "https://statusfly.app").replace(/\/+$/, "");
const API_URL = (process.env.STATUSFLY_API_URL?.trim() || process.env.VITE_API_URL?.trim() || "").replace(/\/+$/, "");
const FALLBACK_TITLE = "StatusFly — Your product. One focused sales page.";
const FALLBACK_DESCRIPTION = "Explore products and contact the seller directly through WhatsApp with StatusFly.";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function asRecord(value: unknown): PageRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as PageRecord
    : null;
}

function textValue(record: PageRecord, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function imageValue(value: unknown): string {
  const record = asRecord(value);
  const raw = record ? textValue(record, "public_url", "publicUrl") : "";
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function htmlPage({ title, description, url, image, status = 200 }: {
  title: string;
  description: string;
  url: string;
  image: string;
  status?: number;
}) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeUrl = escapeHtml(url);
  const safeImage = image ? escapeHtml(image) : "";
  const imageTags = safeImage
    ? `<meta property="og:image" content="${safeImage}"><meta property="og:image:alt" content="${safeTitle}"><meta name="twitter:image" content="${safeImage}"><meta name="twitter:image:alt" content="${safeTitle}">`
    : "";
  return {
    status,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><meta name="description" content="${safeDescription}"><link rel="canonical" href="${safeUrl}"><meta property="og:type" content="website"><meta property="og:site_name" content="StatusFly"><meta property="og:title" content="${safeTitle}"><meta property="og:description" content="${safeDescription}"><meta property="og:url" content="${safeUrl}">${imageTags}<meta name="twitter:card" content="${safeImage ? "summary_large_image" : "summary"}"><meta name="twitter:title" content="${safeTitle}"><meta name="twitter:description" content="${safeDescription}"></head><body><main><h1>${safeTitle}</h1><p>${safeDescription}</p><a href="${safeUrl}">Open this page on StatusFly</a></main></body></html>`,
  };
}

export default async function handler(req: PreviewRequest, res: ServerResponse) {
  const requestUrl = new URL(req.url || "/api/share-preview", "https://statusfly.app");
  const slug = requestUrl.searchParams.get("slug") || "";
  if (!/^[A-Za-z0-9-]{6,80}$/.test(slug)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(htmlPage({ title: FALLBACK_TITLE, description: FALLBACK_DESCRIPTION, url: SITE_URL, image: `${SITE_URL}/favicon-512.png`, status: 400 }).html);
    return;
  }

  const publicUrl = `${SITE_URL}/p/${encodeURIComponent(slug)}`;
  if (!API_URL || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api$/i.test(API_URL)) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(htmlPage({ title: FALLBACK_TITLE, description: FALLBACK_DESCRIPTION, url: publicUrl, image: `${SITE_URL}/favicon-512.png`, status: 503 }).html);
    return;
  }

  try {
    const response = await fetch(`${API_URL}/product-pages/${encodeURIComponent(slug)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      const missing = response.status === 404;
      const output = htmlPage({ title: missing ? "Page unavailable · StatusFly" : FALLBACK_TITLE, description: missing ? "This product page is not currently available." : FALLBACK_DESCRIPTION, url: publicUrl, image: `${SITE_URL}/favicon-512.png`, status: missing ? 404 : 503 });
      res.statusCode = output.status;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(output.html);
      return;
    }

    const payload = asRecord(await response.json());
    const nestedData = asRecord(payload?.data);
    const page = asRecord(payload?.productPage ?? nestedData?.productPage);
    if (!page) throw new Error("The product page response was incomplete.");

    const isCollection = textValue(page, "page_type", "pageType") === "collection";
    const brandName = textValue(page, "brand_name", "brandName") || "A StatusFly seller";
    const productName = textValue(page, "product_name", "productName");
    const collectionName = textValue(page, "collection_title", "collectionTitle") || `${brandName} Collection`;
    const title = isCollection ? `${collectionName} · ${brandName} | StatusFly` : `${productName || "Product"} · ${brandName} | StatusFly`;
    const description = (isCollection
      ? textValue(page, "collection_description", "collectionDescription") || `Explore products from ${brandName} on StatusFly and message the seller through WhatsApp.`
      : textValue(page, "description") || `View ${productName || "this product"} from ${brandName} on StatusFly and message the seller through WhatsApp.`).slice(0, 200);

    const pageImages = Array.isArray(page.images) ? page.images : [];
    let image = imageValue(pageImages[0]);
    if (isCollection) {
      const items = Array.isArray(page.items) ? page.items : [];
      const firstItem = asRecord(items[0]);
      const itemImages = firstItem && Array.isArray(firstItem.images) ? firstItem.images : [];
      image = imageValue(itemImages[0]);
    }

    const output = htmlPage({ title, description, url: publicUrl, image });
    res.statusCode = output.status;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=120");
    res.end(output.html);
  } catch {
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(htmlPage({ title: FALLBACK_TITLE, description: FALLBACK_DESCRIPTION, url: publicUrl, image: `${SITE_URL}/favicon-512.png`, status: 503 }).html);
  }
}
