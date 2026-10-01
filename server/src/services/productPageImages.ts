import { query } from "../db.js";

export interface ProductPageImage {
  id: string;
  product_page_id: string;
  storage_key: string;
  public_url: string;
  position: number;
  created_at: string;
}

export async function listProductPageImages(
  productPageId: string,
): Promise<ProductPageImage[]> {
  const result = await query<ProductPageImage>(
    `
      SELECT
        id,
        product_page_id,
        storage_key,
        public_url,
        position,
        created_at
      FROM product_page_images
      WHERE product_page_id = $1
      ORDER BY position ASC
    `,
    [productPageId],
  );

  return result.rows;
}

export async function addProductPageImage(
  productPageId: string,
  storageKey: string,
  publicUrl: string,
  position: number,
): Promise<ProductPageImage> {
  if (!Number.isInteger(position) || position < 1 || position > 3) {
    throw new Error("Image position must be between 1 and 3.");
  }

  const result = await query<ProductPageImage>(
    `
      INSERT INTO product_page_images (
        product_page_id,
        storage_key,
        public_url,
        position
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        product_page_id,
        storage_key,
        public_url,
        position,
        created_at
    `,
    [productPageId, storageKey, publicUrl, position],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error("Product page image could not be created.");
  }

  return row;
}

export async function deleteProductPageImage(
  productPageId: string,
  imageId: string,
): Promise<boolean> {
  const result = await query(
    `
      DELETE FROM product_page_images
      WHERE id = $1
        AND product_page_id = $2
    `,
    [imageId, productPageId],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function deleteAllProductPageImages(
  productPageId: string,
): Promise<ProductPageImage[]> {
  const result = await query<ProductPageImage>(
    `
      DELETE FROM product_page_images
      WHERE product_page_id = $1
      RETURNING
        id,
        product_page_id,
        storage_key,
        public_url,
        position,
        created_at
    `,
    [productPageId],
  );

  return result.rows;
}

