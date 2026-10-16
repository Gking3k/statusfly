const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const REQUEST_TIMEOUT_MS = 10_000;

export interface PublicProductPageImage {
  id: string;
  publicUrl: string;
  position: number;
}

export interface PublicProductPageItemOption {
  name: string;
  values: string[];
}

export interface PublicProductPageItem {
  id: string;
  position: number;
  productName: string;
  category: string;
  description: string;
  sellingPoints: string[];
  priceNaira: number;
  originalPriceNaira: number | null;
  promotionText: string | null;
  promotionEndAt: string | null;
  availability: "available" | "low_stock" | "sold_out" | "coming_soon" | "preorder";
  options: PublicProductPageItemOption[];
  images: PublicProductPageImage[];
}

export interface PublicProductPageData {
  id: string;
  publicSlug: string;
  pageType: "single" | "collection";
  collectionTitle: string | null;
  collectionDescription: string | null;
  items: PublicProductPageItem[];
  brandName: string;
  whatsappNumber: string;
  deliveryInfo: string;
  productName: string;
  category: string;
  description: string;
  sellingPoints: string[];
  priceNaira: number;
  originalPriceNaira: number | null;
  promotionText: string | null;
  promotionEndAt: string | null;
  availability:
    | "available"
    | "low_stock"
    | "sold_out"
    | "coming_soon"
    | "preorder";
  publishedAt: string | null;
  images: PublicProductPageImage[];
}

interface RawRecord {
  id?: unknown;
  public_slug?: unknown;
  publicSlug?: unknown;
  page_type?: unknown;
  pageType?: unknown;
  collection_title?: unknown;
  collectionTitle?: unknown;
  collection_description?: unknown;
  collectionDescription?: unknown;
  brand_name?: unknown;
  brandName?: unknown;
  whatsapp_number?: unknown;
  whatsappNumber?: unknown;
  delivery_info?: unknown;
  deliveryInfo?: unknown;
  product_name?: unknown;
  productName?: unknown;
  category?: unknown;
  description?: unknown;
  selling_points?: unknown;
  sellingPoints?: unknown;
  price_naira?: unknown;
  priceNaira?: unknown;
  original_price_naira?: unknown;
  originalPriceNaira?: unknown;
  promotion_text?: unknown;
  promotionText?: unknown;
  promotion_end_at?: unknown;
  promotionEndAt?: unknown;
  availability?: unknown;
  options?: unknown;
  published_at?: unknown;
  publishedAt?: unknown;
  public_url?: unknown;
  publicUrl?: unknown;
  storage_key?: unknown;
  product_item_id?: unknown;
  position?: unknown;
  images?: unknown;
  items?: unknown;
}
interface RawResponse {
  productPage?: RawRecord;
  images?: RawRecord[];
  data?: {
    productPage?: RawRecord;
    images?: RawRecord[];
  };
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asSellingPoints(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeImage(image: RawRecord, index: number): PublicProductPageImage | null {
  const publicUrl =
    asString(image.publicUrl) || asString(image.public_url);

  if (!publicUrl) {
    return null;
  }

  return {
    id: asString(image.id, `image-${index + 1}`),
    publicUrl,
    position: asNumber(image.position, index + 1),
  };
}

function asOptions(value: unknown): PublicProductPageItemOption[] {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value) as unknown; } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const option = candidate as { name?: unknown; values?: unknown };
    if (typeof option.name !== "string" || !Array.isArray(option.values)) return [];
    const values = option.values.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean);
    return values.length ? [{ name: option.name, values }] : [];
  }).slice(0, 3);
}

function normalizeItem(raw: RawRecord, index: number): PublicProductPageItem | null {
  const productName = asString(raw.productName) || asString(raw.product_name);
  if (!productName) return null;
  const rawImages = Array.isArray(raw.images) ? raw.images : [];
  const images = rawImages.map((image, imageIndex) => normalizeImage(image as RawRecord, imageIndex))
    .filter((image): image is PublicProductPageImage => Boolean(image))
    .sort((a, b) => a.position - b.position)
    .slice(0, 3);
  const availability = asString(raw.availability, "available") as PublicProductPageItem["availability"];
  const originalRaw = raw.originalPriceNaira ?? raw.original_price_naira;
  const original = originalRaw === null || originalRaw === undefined || originalRaw === "" ? null : asNumber(originalRaw, 0);
  return {
    id: asString(raw.id, `item-${index + 1}`),
    position: asNumber(raw.position, index + 1),
    productName,
    category: asString(raw.category),
    description: asString(raw.description),
    sellingPoints: asSellingPoints(raw.sellingPoints ?? raw.selling_points),
    priceNaira: asNumber(raw.priceNaira ?? raw.price_naira, 0),
    originalPriceNaira: original && original > 0 ? original : null,
    promotionText: asNullableString(raw.promotionText) ?? asNullableString(raw.promotion_text),
    promotionEndAt: asNullableString(raw.promotionEndAt) ?? asNullableString(raw.promotion_end_at),
    availability,
    options: asOptions(raw.options),
    images,
  };
}

function normalizeResponse(data: RawResponse): PublicProductPageData | null {
  const productPage = data.productPage ?? data.data?.productPage;

  if (!productPage) {
    return null;
  }

  const rawImagesCandidate =
    productPage.images ??
    data.images ??
    data.data?.images ??
    [];

  const rawImages = Array.isArray(rawImagesCandidate)
    ? rawImagesCandidate
    : [];
  const images = rawImages
    .map((image, index) => normalizeImage(image, index))
    .filter((image): image is PublicProductPageImage => Boolean(image))
    .sort((a, b) => a.position - b.position)
    .slice(0, 3);

  const availability = asString(productPage.availability, "available") as
    PublicProductPageData["availability"];
  const rawItemsCandidate = productPage.items ?? [];
  const items = Array.isArray(rawItemsCandidate)
    ? rawItemsCandidate.map((item, index) => normalizeItem(item as RawRecord, index)).filter((item): item is PublicProductPageItem => Boolean(item))
    : [];

  return {
    id: asString(productPage.id),
    publicSlug:
      asString(productPage.publicSlug) ||
      asString(productPage.public_slug),
    pageType: asString(productPage.pageType) === "collection" || asString(productPage.page_type) === "collection" ? "collection" : "single",
    collectionTitle: asNullableString(productPage.collectionTitle) ?? asNullableString(productPage.collection_title),
    collectionDescription: asNullableString(productPage.collectionDescription) ?? asNullableString(productPage.collection_description),
    items,
    brandName:
      asString(productPage.brandName) ||
      asString(productPage.brand_name),
    whatsappNumber:
      asString(productPage.whatsappNumber) ||
      asString(productPage.whatsapp_number),
    deliveryInfo:
      asString(productPage.deliveryInfo) ||
      asString(productPage.delivery_info),
    productName:
      asString(productPage.productName) ||
      asString(productPage.product_name),
    category: asString(productPage.category),
    description: asString(productPage.description),
    sellingPoints: asSellingPoints(
      productPage.sellingPoints ?? productPage.selling_points,
    ),
    priceNaira:
      asNumber(productPage.priceNaira, NaN) ||
      asNumber(productPage.price_naira, 0),
    originalPriceNaira: (() => {
      const value =
        productPage.originalPriceNaira ??
        productPage.original_price_naira;

      if (value === null || value === undefined || value === "") {
        return null;
      }

      const number = asNumber(value, 0);
      return number > 0 ? number : null;
    })(),
    promotionText:
      asNullableString(productPage.promotionText) ??
      asNullableString(productPage.promotion_text),
    promotionEndAt:
      asNullableString(productPage.promotionEndAt) ??
      asNullableString(productPage.promotion_end_at),
    availability,
    publishedAt:
      asNullableString(productPage.publishedAt) ??
      asNullableString(productPage.published_at),
    images,
  };
}

export async function getPublicProductPage(
  slug: string,
): Promise<PublicProductPageData> {
  const controller = new AbortController();

  const timeout = window.setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${API_URL}/product-pages/${encodeURIComponent(slug)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      },
    );

    const data = (await response.json().catch(() => null)) as
      | RawResponse
      | { error?: string; message?: string }
      | null;

    if (!response.ok) {
      const message =
        data && "error" in data && data.error
          ? data.error
          : data && "message" in data && data.message
            ? data.message
            : response.status === 404
              ? "This product page is not available."
              : "We couldn't load this product page.";

      throw new Error(message);
    }

    const page = normalizeResponse(data as RawResponse);

    if (!page || !page.publicSlug || !page.productName) {
      throw new Error("The server returned an invalid product page.");
    }

    return page;
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "The request timed out. Please check your connection and try again.",
      );
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Unable to load this product page right now.");
  } finally {
    window.clearTimeout(timeout);
  }
}
