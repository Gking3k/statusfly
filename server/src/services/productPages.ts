import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import { query } from "../db.js";

export type ProductPageAvailability =
  | "available"
  | "low_stock"
  | "sold_out"
  | "coming_soon"
  | "preorder";

export type ProductPageStatus = "draft" | "published" | "hidden";

export interface CreateProductPageInput {
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

  const result = await query(
    `
      UPDATE product_pages
      SET
        brand_name = $1,
        whatsapp_number = $2,
        delivery_info = $3,
        product_name = $4,
        category = $5,
        description = $6,
        selling_points = $7::jsonb,
        price_naira = $8,
        original_price_naira = $9,
        promotion_text = $10,
        promotion_end_at = $11,
        availability = $12
      WHERE edit_token_hash = $13
      RETURNING
        id,
        public_slug,
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
        archived_at,
        created_at,
        updated_at
    `,
    [
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

  return result.rows[0] ?? null;
}

export interface CreatedProductPage {
  id: string;
  publicSlug: string;
  editToken: string;
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

  const result = await query<{
    id: string;
    public_slug: string;
  }>(
    `
      INSERT INTO product_pages (
        public_slug,
        edit_token_hash,
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
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9::jsonb,
        $10,
        $11,
        $12,
        $13,
        $14,
        'draft'
      )
      RETURNING id, public_slug
    `,
    [
      publicSlug,
      editTokenHash,
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

  if (!row) {
    throw new Error("Product page could not be created.");
  }

  return {
    id: row.id,
    publicSlug: row.public_slug,
    editToken,
  };
}

export async function getProductPageBySlug(publicSlug: string) {
  const result = await query(
    `
      SELECT
        id,
        public_slug,
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
        AND EXISTS (
          SELECT 1
          FROM product_page_payments
          WHERE product_page_payments.product_page_id = product_pages.id
            AND product_page_payments.status = 'success'
        )
      RETURNING
        id,
        public_slug,
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