import { query } from "../db.js";

export type ProductPageFeedbackOutcome =
  | "yes"
  | "not_yet"
  | "inquiry"
  | "customer"
  | "not_shared";

export interface CreateProductPageFeedbackInput {
  productPageId?: string | null;
  rating: number;
  outcome?: ProductPageFeedbackOutcome | null;
  featureRequest?: string | null;
  improvementText?: string | null;
}

export interface ProductPageFeedback {
  id: string;
  product_page_id: string | null;
  rating: number;
  outcome: ProductPageFeedbackOutcome | null;
  feature_request: string | null;
  improvement_text: string | null;
  created_at: string;
}

export async function createProductPageFeedback(
  input: CreateProductPageFeedbackInput,
): Promise<ProductPageFeedback> {
  const result = await query<ProductPageFeedback>(
    `
      INSERT INTO product_page_feedback (
        product_page_id,
        rating,
        outcome,
        feature_request,
        improvement_text
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        product_page_id,
        rating,
        outcome,
        feature_request,
        improvement_text,
        created_at
    `,
    [
      input.productPageId ?? null,
      input.rating,
      input.outcome ?? null,
      input.featureRequest ?? null,
      input.improvementText ?? null,
    ],
  );

  const feedback = result.rows[0];

  if (!feedback) {
    throw new Error("Feedback could not be created.");
  }

  return feedback;
}

export async function listProductPageFeedback(
  productPageId: string,
): Promise<ProductPageFeedback[]> {
  const result = await query<ProductPageFeedback>(
    `
      SELECT
        id,
        product_page_id,
        rating,
        outcome,
        feature_request,
        improvement_text,
        created_at
      FROM product_page_feedback
      WHERE product_page_id = $1
      ORDER BY created_at DESC
    `,
    [productPageId],
  );

  return result.rows;
}