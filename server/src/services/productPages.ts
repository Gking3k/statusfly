import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import { query, withTransaction } from "../db.js";
import {
  createProductPageItems,
  replaceProductPageItems,
  type ProductPageItemInput,
} from "./productPageCollections.js";

export type ProductPageAvailability =
  | "available"
  | "low_stock"
  | "sold_out"
  | "coming_soon"
  | "preorder";

export type ProductPageStatus = "draft" | "published" | "hidden";

export interface CreateProductPageInput {
  pageType?: "single" | "collection";
  collectionTitle?: string | null;
  collectionDescription?: string | null;
  items?: ProductPageItemInput[];
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

export interface UpdateProductPageInput {
  pageType?: "single" | "collection";
  collectionTitle?: string | null;
  collectionDescription?: string | null;
  items?: ProductPageItemInput[];
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

export async function getProductPageByEditToken(token: string) {
  const editTokenHash = hashEditToken(token);

  const result = await query(
    `
      SELECT
        id,
        public_slug,
        page_type,
        collection_title,
        collection_description,
        brand_name,
        whatsapp_number,
        delivery_info,
        product_name,
        category,
        description,
        selling_points,
        price_naira,
        original_price_naira,
        promotion_text,
        promotion_end_at,
        availability,
        status,
        admin_unpublished,
        published_at,
        archived_at,
        created_at,
        updated_at
      FROM product_pages
      WHERE edit_token_hash = $1
      LIMIT 1
    `,
    [editTokenHash],
  );

  return result.rows[0] ?? null;
}

export async function updateProductPageByEditToken(
  token: string,
  input: UpdateProductPageInput,
) {
  const editTokenHash = hashEditToken(token);
  return withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE product_pages
       SET
         page_type = COALESCE($1::varchar, page_type),
         collection_title = CASE
           WHEN $1::varchar IS NULL THEN collection_title
           WHEN $1::varchar = 'collection' THEN $2
           ELSE NULL
         END,
         collection_description = CASE
           WHEN $1::varchar IS NULL THEN collection_description
           WHEN $1::varchar = 'collection' THEN $3
           ELSE NULL
         END,
         brand_name = $4,
         whatsapp_number = $5,
         delivery_info = $6,
         product_name = $7,
         category = $8,
         description = $9,
         selling_points = $10::jsonb,
         price_naira = $11,
         original_price_naira = $12,
         promotion_text = $13,
         promotion_end_at = $14,
         availability = $15
       WHERE edit_token_hash = $16
       RETURNING
         id, public_slug, page_type, collection_title, collection_description,
         brand_name, whatsapp_number, delivery_info, product_name, category,
         description, selling_points, price_naira, original_price_naira,
         promotion_text, promotion_end_at, availability, status,
         admin_unpublished, published_at, archived_at, created_at, updated_at`,
      [
        input.pageType ?? null,
        input.collectionTitle ?? null,
        input.collectionDescription ?? null,
        input.brandName,
        input.whatsappNumber,
        input.deliveryInfo,
        input.productName,
        input.category,
        input.description,
        JSON.stringify(input.sellingPoints),
        input.priceNaira,
        input.originalPriceNaira ?? null,
        input.promotionText ?? null,
        input.promotionEndAt ?? null,
        input.availability,
        editTokenHash,
      ],
    );
    const row = result.rows[0] ?? null;
    if (row && input.pageType === "collection" && input.items) {
      await replaceProductPageItems(String(row.id), input.items, client);
    }
    return row;
  });
}

export interface CreatedProductPage {
  id: string;
  publicSlug: string;
  editToken: string;
  pageType?: "single" | "collection";
  items?: Array<{ id: string; position: number; productName: string }>;
}

function generatePublicSlug(): string {
  return randomBytes(6).toString("hex");
}

function generateEditToken(): string {
  return randomBytes(32).toString("hex");
}

function hashEditToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPrivateEditToken(token: string): string {
  return hashEditToken(token);
}

export async function createProductPage(
  input: CreateProductPageInput,
): Promise<CreatedProductPage> {
  const publicSlug = generatePublicSlug();
  const editToken = generateEditToken();
  const editTokenHash = hashEditToken(editToken);

  const created = await withTransaction(async (client) => {
    const result = await client.query<{
      id: string;
      public_slug: string;
    }>(
      `INSERT INTO product_pages (
        public_slug, edit_token_hash, page_type, collection_title,
        collection_description, brand_name, whatsapp_number, delivery_info,
        product_name, category, description, selling_points, price_naira,
        original_price_naira, promotion_text, promotion_end_at, availability, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb,
        $13, $14, $15, $16, $17, 'draft'
      ) RETURNING id, public_slug`,
      [
        publicSlug,
        editTokenHash,
        input.pageType ?? "single",
        input.pageType === "collection" ? input.collectionTitle?.trim() || "Our Collection" : null,
        input.pageType === "collection" ? input.collectionDescription?.trim() || null : null,
        input.brandName,
        input.whatsappNumber,
        input.deliveryInfo,
        input.productName,
        input.category,
        input.description,
        JSON.stringify(input.sellingPoints),
        input.priceNaira,
        input.originalPriceNaira ?? null,
        input.promotionText ?? null,
        input.promotionEndAt ?? null,
        input.availability,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Product page could not be created.");

    const items = input.pageType === "collection" && input.items?.length
      ? await createProductPageItems(row.id, input.items, client)
      : [];

    return { row, items };
  });

  return {
    id: created.row.id,
    publicSlug: created.row.public_slug,
    editToken,
    pageType: input.pageType ?? "single",
    items: created.items.map((item) => ({
      id: item.id,
      position: item.position,
      productName: item.product_name,
    })),
  };
}

export async function getProductPageBySlug(publicSlug: string) {
  const result = await query(
    `
      SELECT
        id,
        public_slug,
        page_type,
        collection_title,
        collection_description,
        brand_name,
        whatsapp_number,
        delivery_info,
        product_name,
        category,
        description,
        selling_points,
        price_naira,
        original_price_naira,
        promotion_text,
        promotion_end_at,
        availability,
        status,
        published_at,
        created_at,
        updated_at
      FROM product_pages
      WHERE public_slug = $1
      LIMIT 1
    `,
    [publicSlug],
  );

  return result.rows[0] ?? null;
}

export async function getPublishedProductPageBySlug(publicSlug: string) {
  const result = await query(
    `
      SELECT
        id,
        public_slug,
        page_type,
        collection_title,
        collection_description,
        brand_name,
        whatsapp_number,
        delivery_info,
        product_name,
        category,
        description,
        selling_points,
        price_naira,
        original_price_naira,
        promotion_text,
        promotion_end_at,
        availability,
        status,
        published_at
      FROM product_pages
      WHERE public_slug = $1
        AND status = 'published'
        AND archived_at IS NULL
        AND admin_unpublished = FALSE
      LIMIT 1
    `,
    [publicSlug],
  );

  return result.rows[0] ?? null;
}

export async function getPublishedProductPageSitemapEntries() {
  const result = await query<{
    public_slug: string;
    updated_at: Date;
  }>(
    `
      SELECT
        public_slug,
        updated_at
      FROM product_pages
      WHERE status = 'published'
        AND archived_at IS NULL
        AND admin_unpublished = FALSE
      ORDER BY updated_at DESC
    `,
  );

  return result.rows;
}

export async function getProductPageById(id: string) {
  const result = await query(
    `
      SELECT
        id,
        public_slug,
        page_type,
        collection_title,
        collection_description,
        brand_name,
        whatsapp_number,
        delivery_info,
        product_name,
        category,
        description,
        selling_points,
        price_naira,
        original_price_naira,
        promotion_text,
        promotion_end_at,
        availability,
        status,
        published_at,
        created_at,
        updated_at
      FROM product_pages
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function publishProductPageByEditToken(token: string) {
  const editTokenHash = hashEditToken(token);

  const result = await query(
    `
      UPDATE product_pages
      SET
        status = 'published',
        published_at = COALESCE(published_at, NOW())
      WHERE edit_token_hash = $1
        AND archived_at IS NULL
        AND admin_unpublished = FALSE
        AND EXISTS (
          SELECT 1
          FROM product_page_payments
          WHERE product_page_payments.product_page_id = product_pages.id
            AND product_page_payments.status = 'success'
        )
        AND (
          product_pages.page_type = 'single'
          OR (
            (SELECT COUNT(*) FROM public.product_page_items item
              WHERE item.product_page_id = product_pages.id) BETWEEN 2 AND 10
            AND NOT EXISTS (
              SELECT 1 FROM public.product_page_items item
              WHERE item.product_page_id = product_pages.id
                AND NOT EXISTS (
                  SELECT 1 FROM public.product_page_item_images image
                  WHERE image.product_item_id = item.id
                )
            )
          )
        )
      RETURNING
        id,
        public_slug,
        page_type,
        collection_title,
        collection_description,
        brand_name,
        whatsapp_number,
        delivery_info,
        product_name,
        category,
        description,
        selling_points,
        price_naira,
        original_price_naira,
        promotion_text,
        promotion_end_at,
        availability,
        status,
        published_at,
        created_at,
        updated_at
    `,
    [editTokenHash],
  );

  return result.rows[0] ?? null;
}