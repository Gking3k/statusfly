const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const REQUEST_TIMEOUT_MS = 10_000;
const IMAGE_UPLOAD_TIMEOUT_MS = 30_000;

export type ProductPageAvailability =
  | "available"
  | "low_stock"
  | "sold_out"
  | "coming_soon"
  | "preorder";

export interface ProductPageItemOption {
  name: string;
  values: string[];
}

export interface ProductPageItemRequest {
  id?: string;
  productName: string;
  category: string;
  description: string;
  sellingPoints: string[];
  priceNaira: number;
  originalPriceNaira?: number | null;
  promotionText?: string | null;
  promotionEndAt?: string | null;
  availability: ProductPageAvailability;
  options: ProductPageItemOption[];
}

export interface ProductPageItemImage {
  id: string;
  productItemId: string;
  storageKey?: string;
  publicUrl: string;
  position: number;
  createdAt: string;
}

export interface EditableProductPageItem {
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
  availability: ProductPageAvailability;
  options: ProductPageItemOption[];
  images: ProductPageItemImage[];
}

export interface CreateProductPageRequest {
  pageType?: "single" | "collection";
  collectionTitle?: string | null;
  collectionDescription?: string | null;
  items?: ProductPageItemRequest[];
  brandName: string;
  whatsappNumber: string;
  deliveryInfo: string;
  productName: string;
  category: string;
  description: string;
  sellingPoints: string[];
  priceNaira: number;
  originalPriceNaira?: number | null;
  promotionText?: string | null;
  promotionEndAt?: string | null;
  availability: ProductPageAvailability;
}

export interface CreatedProductPage {
  id: string;
  publicSlug: string;
  editToken: string;
  pageType?: "single" | "collection";
  items?: Array<{ id: string; position: number; productName: string }>;
}

export interface ProductPageImage {
  id: string;
  productPageId: string;
  storageKey: string;
  publicUrl: string;
  position: number;
  createdAt: string;
}

export interface EditableProductPage {
  id: string;
  publicSlug: string;
  pageType: "single" | "collection";
  collectionTitle: string | null;
  collectionDescription: string | null;
  items: EditableProductPageItem[];
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
  availability: ProductPageAvailability;
  status: "draft" | "published" | "hidden";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  images: ProductPageImage[];
}

interface CreateProductPageResponse {
  message: string;
  productPage: CreatedProductPage;
}

interface EditableProductPageApiRow {
  id: string;
  public_slug: string;
  page_type?: "single" | "collection";
  collection_title?: string | null;
  collection_description?: string | null;
  items?: Array<{
    id: string;
    product_page_id: string;
    position: number;
    product_name: string;
    category: string;
    description: string;
    selling_points: unknown;
    price_naira: number | string;
    original_price_naira: number | string | null;
    promotion_text: string | null;
    promotion_end_at: string | null;
    availability: ProductPageAvailability;
    options: unknown;
    images?: Array<{
      id: string;
      product_item_id: string;
      storage_key?: string;
      public_url: string;
      position: number;
      created_at: string;
    }>;
  }>;
  brand_name: string;
  whatsapp_number: string;
  delivery_info: string;
  product_name: string;
  category: string;
  description: string;
  selling_points: unknown;
  price_naira: number | string;
  original_price_naira: number | string | null;
  promotion_text: string | null;
  promotion_end_at: string | null;
  availability: ProductPageAvailability;
  status: "draft" | "published" | "hidden";
  published_at: string | null;
  created_at: string;
  updated_at: string;
  images?: Array<{
    id: string;
    product_page_id: string;
    storage_key: string;
    public_url: string;
    position: number;
    created_at: string;
  }>;
}

interface EditableProductPageResponse {
  productPage: EditableProductPageApiRow;
}

interface UpdateProductPageRequest
  extends CreateProductPageRequest {}

interface UpdateProductPageResponse {
  message: string;
  productPage: EditableProductPageApiRow;
}

interface UploadProductPageImagesResponse {
  message: string;
  images: Array<{
    id: string;
    product_page_id: string;
    storage_key: string;
    public_url: string;
    position: number;
    created_at: string;
  }>;
}

function parseSellingPoints(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parseSellingPoints(parsed);
    } catch {
      return [];
    }
  }

  return [];
}

function parseOptions(value: unknown): ProductPageItemOption[] {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value) as unknown; } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const option = candidate as { name?: unknown; values?: unknown };
    if (typeof option.name !== "string" || !Array.isArray(option.values)) return [];
    const values = option.values.filter((entry): entry is string => typeof entry === "string");
    return values.length ? [{ name: option.name, values }] : [];
  }).slice(0, 3);
}

function parseNumber(value: number | string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapEditableProductPage(
  row: EditableProductPageApiRow,
): EditableProductPage {
  const priceNaira = parseNumber(row.price_naira);

  if (priceNaira === null) {
    throw new Error("The server returned an invalid product price.");
  }

  return {
    id: row.id,
    publicSlug: row.public_slug,
    pageType: row.page_type === "collection" ? "collection" : "single",
    collectionTitle: row.collection_title ?? null,
    collectionDescription: row.collection_description ?? null,
    items: (row.items ?? []).map((item) => ({
      id: item.id,
      position: item.position,
      productName: item.product_name,
      category: item.category,
      description: item.description,
      sellingPoints: parseSellingPoints(item.selling_points),
      priceNaira: parseNumber(item.price_naira) ?? 0,
      originalPriceNaira: parseNumber(item.original_price_naira),
      promotionText: item.promotion_text,
      promotionEndAt: item.promotion_end_at,
      availability: item.availability,
      options: parseOptions(item.options),
      images: (item.images ?? []).map((image) => ({
        id: image.id,
        productItemId: image.product_item_id,
        storageKey: image.storage_key,
        publicUrl: image.public_url,
        position: image.position,
        createdAt: image.created_at,
      })).sort((a, b) => a.position - b.position),
    })),
    brandName: row.brand_name,
    whatsappNumber: row.whatsapp_number,
    deliveryInfo: row.delivery_info,
    productName: row.product_name,
    category: row.category,
    description: row.description,
    sellingPoints: parseSellingPoints(row.selling_points),
    priceNaira,
    originalPriceNaira: parseNumber(row.original_price_naira),
    promotionText: row.promotion_text,
    promotionEndAt: row.promotion_end_at,
    availability: row.availability,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    images: (row.images ?? [])
      .map((image) => ({
        id: image.id,
        productPageId: image.product_page_id,
        storageKey: image.storage_key,
        publicUrl: image.public_url,
        position: image.position,
        createdAt: image.created_at,
      }))
      .sort((a, b) => a.position - b.position),
  };
}

export async function createProductPage(
  payload: CreateProductPageRequest,
): Promise<CreateProductPageResponse> {
  const controller = new AbortController();

  const timeout = window.setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}/product-pages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = (await response.json().catch(() => null)) as
      | CreateProductPageResponse
      | { error?: string }
      | null;

    if (!response.ok) {
      throw new Error(
        data && "error" in data && data.error
          ? data.error
          : "We couldn't create your product page. Please try again.",
      );
    }

    if (
      !data ||
      !("productPage" in data) ||
      !data.productPage?.id ||
      !data.productPage?.publicSlug ||
      !data.productPage?.editToken
    ) {
      throw new Error(
        "The server returned an invalid product page response.",
      );
    }

    return data;
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

    throw new Error(
      "Unable to create your product page right now.",
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function getEditableProductPage(
  editToken: string,
): Promise<EditableProductPage> {
  if (!editToken) {
    throw new Error("The product page edit token is missing.");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${API_URL}/product-pages/edit/${encodeURIComponent(editToken)}`,
      {
        method: "GET",
        signal: controller.signal,
      },
    );

    const data = (await response.json().catch(() => null)) as
      | EditableProductPageResponse
      | { error?: string }
      | null;

    if (!response.ok) {
      throw new Error(
        data && "error" in data && data.error
          ? data.error
          : "We couldn't load this product page.",
      );
    }

    if (!data || !("productPage" in data) || !data.productPage?.id) {
      throw new Error("The server returned an invalid product page response.");
    }

    return mapEditableProductPage(data.productPage);
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "Loading the product page timed out. Please check your connection and try again.",
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

export async function updateProductPage(
  editToken: string,
  payload: UpdateProductPageRequest,
): Promise<EditableProductPage> {
  if (!editToken) {
    throw new Error("The product page edit token is missing.");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${API_URL}/product-pages/edit/${encodeURIComponent(editToken)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );

    const data = (await response.json().catch(() => null)) as
      | UpdateProductPageResponse
      | { error?: string }
      | null;

    if (!response.ok) {
      throw new Error(
        data && "error" in data && data.error
          ? data.error
          : "We couldn't save your changes. Please try again.",
      );
    }

    if (!data || !("productPage" in data) || !data.productPage?.id) {
      throw new Error("The server returned an invalid update response.");
    }

    return mapEditableProductPage(data.productPage);
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "Saving your changes timed out. Please check your connection and try again.",
      );
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Unable to save your changes right now.");
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function uploadProductPageImages(
  editToken: string,
  images: File[],
): Promise<UploadProductPageImagesResponse> {
  if (!editToken) {
    throw new Error("The product page edit token is missing.");
  }

  if (!images.length) {
    throw new Error("Add at least one product image.");
  }

  if (images.length > 3) {
    throw new Error("You can upload a maximum of 3 images.");
  }

  const formData = new FormData();

  for (const image of images) {
    formData.append("images", image);
  }

  const controller = new AbortController();

  const timeout = window.setTimeout(() => {
    controller.abort();
  }, IMAGE_UPLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${API_URL}/product-pages/edit/${encodeURIComponent(
        editToken,
      )}/images`,
      {
        method: "POST",
        body: formData,
        signal: controller.signal,
      },
    );

    const data = (await response.json().catch(() => null)) as
      | UploadProductPageImagesResponse
      | { error?: string }
      | null;

    if (!response.ok) {
      throw new Error(
        data && "error" in data && data.error
          ? data.error
          : "We couldn't upload your product images. Please try again.",
      );
    }

    if (
      !data ||
      !("images" in data) ||
      !Array.isArray(data.images) ||
      data.images.length !== images.length
    ) {
      throw new Error(
        "The server returned an invalid image upload response.",
      );
    }

    return data;
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "The image upload timed out. Please check your connection and try again.",
      );
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      "Unable to upload product images right now.",
    );
  } finally {
    window.clearTimeout(timeout);
  }
}


export async function uploadProductPageItemImages(
  editToken: string,
  itemId: string,
  images: File[],
): Promise<Array<{ id: string; product_item_id: string; storage_key: string; public_url: string; position: number; created_at: string }>> {
  if (!editToken || !itemId) throw new Error("The collection item edit link is missing.");
  if (!images.length || images.length > 3) throw new Error("Each item needs 1–3 images.");
  const formData = new FormData();
  for (const image of images) formData.append("images", image);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), IMAGE_UPLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${API_URL}/product-pages/edit/${encodeURIComponent(editToken)}/items/${encodeURIComponent(itemId)}/images`,
      { method: "POST", body: formData, signal: controller.signal },
    );
    const data = await response.json().catch(() => null) as
      | { message?: string; images?: Array<{ id: string; product_item_id: string; storage_key: string; public_url: string; position: number; created_at: string }>; error?: string }
      | null;
    if (!response.ok || !data?.images) {
      throw new Error(data?.error || "Unable to upload collection item images.");
    }
    return data.images;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Image upload timed out. Check your connection and try again.");
    }
    if (error instanceof Error) throw error;
    throw new Error("Unable to upload collection item images.");
  } finally {
    window.clearTimeout(timeout);
  }
}
