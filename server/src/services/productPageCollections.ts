import type { QueryResultRow } from "pg";
import { query, withTransaction } from "../db.js";

export type CollectionItemAvailability =
  | "available"
  | "low_stock"
  | "sold_out"
  | "coming_soon"
  | "preorder";

export interface ProductPageItemOption {
  name: string;
  values: string[];
}

export interface ProductPageItemInput {
  id?: string;
  productName: string;
  category: string;
  description: string;
  sellingPoints: string[];
  priceNaira: number;
  originalPriceNaira?: number | null;
  promotionText?: string | null;
  promotionEndAt?: string | null;
  availability: CollectionItemAvailability;
  options: ProductPageItemOption[];
}

interface QueryRunner {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

export interface ProductPageItemImageRow extends QueryResultRow {
  id: string;
  product_item_id: string;
  storage_key?: string;
  public_url: string;
  position: number;
  created_at: string;
}

export interface ProductPageItemRow extends QueryResultRow {
  id: string;
  product_page_id: string;
  position: number;
  product_name: string;
  category: string;
  description: string;
  selling_points: string[];
  price_naira: number | string;
  original_price_naira: number | string | null;
  promotion_text: string | null;
  promotion_end_at: string | null;
  availability: CollectionItemAvailability;
  options: ProductPageItemOption[];
  created_at: string;
  updated_at: string;
  images?: ProductPageItemImageRow[];
}

function jsonValue<T>(value: unknown, fallback: T): T {
  if (Array.isArray(value)) return value as T;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return (Array.isArray(parsed) ? parsed : fallback) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

async function insertItems(
  runner: QueryRunner,
  pageId: string,
  items: ProductPageItemInput[],
): Promise<ProductPageItemRow[]> {
  const rows: ProductPageItemRow[] = [];
  for (const [index, item] of items.entries()) {
    const result = await runner.query<ProductPageItemRow>(
      `INSERT INTO public.product_page_items (
        product_page_id, position, product_name, category, description,
        selling_points, price_naira, original_price_naira, promotion_text,
        promotion_end_at, availability, options
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12::jsonb)
      RETURNING *`,
      [
        pageId,
        index + 1,
        item.productName,
        item.category,
        item.description,
        JSON.stringify(item.sellingPoints),
        item.priceNaira,
        item.originalPriceNaira ?? null,
        item.promotionText ?? null,
        item.promotionEndAt || null,
        item.availability,
        JSON.stringify(item.options),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("A collection item could not be saved.");
    rows.push(row);
  }
  return rows;
}

export async function createProductPageItems(
  pageId: string,
  items: ProductPageItemInput[],
  runner?: QueryRunner,
): Promise<ProductPageItemRow[]> {
  if (runner) return insertItems(runner, pageId, items);
  return withTransaction((client) => insertItems(client, pageId, items));
}

export async function replaceProductPageItems(
  pageId: string,
  items: ProductPageItemInput[],
  runner?: QueryRunner,
): Promise<ProductPageItemRow[]> {
  const execute = async (client: QueryRunner) => {
    const currentResult = await client.query<{ id: string } & QueryResultRow>(
      `SELECT id FROM public.product_page_items WHERE product_page_id = $1`,
      [pageId],
    );
    const currentIds = new Set(currentResult.rows.map((row) => row.id));
    const retainedIds = new Set<string>();
    const saved: ProductPageItemRow[] = [];

    for (const [index, item] of items.entries()) {
      const existingId = item.id && currentIds.has(item.id) ? item.id : null;
      const values = [
        pageId,
        index + 1,
        item.productName,
        item.category,
        item.description,
        JSON.stringify(item.sellingPoints),
        item.priceNaira,
        item.originalPriceNaira ?? null,
        item.promotionText ?? null,
        item.promotionEndAt || null,
        item.availability,
        JSON.stringify(item.options),
      ];

      const result = existingId
        ? await client.query<ProductPageItemRow>(
            `UPDATE public.product_page_items SET
              position = $2, product_name = $3, category = $4,
              description = $5, selling_points = $6::jsonb,
              price_naira = $7, original_price_naira = $8,
              promotion_text = $9, promotion_end_at = $10,
              availability = $11, options = $12::jsonb, updated_at = now()
             WHERE product_page_id = $1 AND id = $13 RETURNING *`,
            [...values, existingId],
          )
        : await client.query<ProductPageItemRow>(
            `INSERT INTO public.product_page_items (
              product_page_id, position, product_name, category, description,
              selling_points, price_naira, original_price_naira, promotion_text,
              promotion_end_at, availability, options
            ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12::jsonb)
            RETURNING *`,
            values,
          );

      const row = result.rows[0];
      if (!row) throw new Error("A collection item could not be updated.");
      saved.push(row);
      if (existingId) retainedIds.add(existingId);
    }

    const removedIds = [...currentIds].filter((id) => !retainedIds.has(id));
    if (removedIds.length) {
      await client.query(
        `DELETE FROM public.product_page_items
         WHERE product_page_id = $1 AND id = ANY($2::uuid[])`,
        [pageId, removedIds],
      );
    }
    return saved;
  };

  if (runner) return execute(runner);
  return withTransaction(execute);
}

export async function isProductPageItemForPage(
  pageId: string,
  itemId: string,
): Promise<boolean> {
  const result = await query<{ id: string }>(
    `SELECT id FROM public.product_page_items
     WHERE product_page_id = $1::uuid AND id = $2::uuid
     LIMIT 1`,
    [pageId, itemId],
  );
  return Boolean(result.rows[0]);
}

export async function listProductPageItems(
  pageId: string,
  includeStorageKeys = false,
): Promise<ProductPageItemRow[]> {
  const result = await query<ProductPageItemRow>(
    `SELECT id, product_page_id, position, product_name, category, description,
       selling_points, price_naira, original_price_naira, promotion_text,
       promotion_end_at::text, availability, options, created_at, updated_at
     FROM public.product_page_items
     WHERE product_page_id = $1
     ORDER BY position ASC, created_at ASC`,
    [pageId],
  );

  const items = result.rows.map((row) => ({
    ...row,
    selling_points: jsonValue<string[]>(row.selling_points, []),
    options: jsonValue<ProductPageItemOption[]>(row.options, []),
  }));

  // Collection size is capped at 10 items. Fetch each item's image metadata
  // concurrently so the public page does not wait on 10 sequential DB round trips.
  return Promise.all(items.map(async (item) => ({
    ...item,
    images: await listProductPageItemImages(item.id, includeStorageKeys),
  })));
}

export async function listProductPageItemImages(
  itemId: string,
  includeStorageKeys = false,
): Promise<ProductPageItemImageRow[]> {
  const result = await query<ProductPageItemImageRow>(
    `SELECT id, product_item_id, ${includeStorageKeys ? "storage_key," : ""}
       public_url, position, created_at
     FROM public.product_page_item_images
     WHERE product_item_id = $1 ORDER BY position ASC, created_at ASC`,
    [itemId],
  );
  return result.rows;
}

export async function replaceProductPageItemImages(
  itemId: string,
  images: Array<{ storageKey: string; publicUrl: string }>,
): Promise<{ images: ProductPageItemImageRow[]; replacedStorageKeys: string[] }> {
  return withTransaction(async (client) => {
    const oldResult = await client.query<ProductPageItemImageRow>(
      `DELETE FROM public.product_page_item_images
       WHERE product_item_id = $1
       RETURNING id, product_item_id, storage_key, public_url, position, created_at`,
      [itemId],
    );
    const inserted: ProductPageItemImageRow[] = [];
    for (const [index, image] of images.entries()) {
      const result = await client.query<ProductPageItemImageRow>(
        `INSERT INTO public.product_page_item_images
          (product_item_id, storage_key, public_url, position)
         VALUES ($1, $2, $3, $4)
         RETURNING id, product_item_id, storage_key, public_url, position, created_at`,
        [itemId, image.storageKey, image.publicUrl, index + 1],
      );
      const row = result.rows[0];
      if (!row) throw new Error("A collection item image could not be saved.");
      inserted.push(row);
    }
    return {
      images: inserted,
      replacedStorageKeys: oldResult.rows.map((row) => row.storage_key).filter((key): key is string => Boolean(key)),
    };
  });
}

export async function getProductPageItemForEditToken(
  tokenHash: string,
  itemId: string,
): Promise<{ pageId: string; itemId: string } | null> {
  const result = await query<{ page_id: string; item_id: string }>(
    `SELECT page.id AS page_id, item.id AS item_id
     FROM public.product_pages page
     JOIN public.product_page_items item ON item.product_page_id = page.id
     WHERE page.edit_token_hash = $1 AND item.id = $2
     LIMIT 1`,
    [tokenHash, itemId],
  );
  const row = result.rows[0];
  return row ? { pageId: row.page_id, itemId: row.item_id } : null;
}
