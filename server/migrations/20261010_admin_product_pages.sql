-- StatusFly Admin Phase 2 — Product-page management
-- Apply to the same PostgreSQL database used by the API (local and production as needed).
-- Existing pages remain unarchived because archived_at is nullable and defaults to NULL.
-- This migration does not delete, update, or otherwise modify existing product/payment data.

BEGIN;

ALTER TABLE public.product_pages
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS product_pages_admin_status_created_idx
  ON public.product_pages (status, created_at DESC);

CREATE INDEX IF NOT EXISTS product_pages_admin_archived_created_idx
  ON public.product_pages (archived_at, created_at DESC);

COMMENT ON COLUMN public.product_pages.archived_at IS
  'StatusFly owner-dashboard archive marker. Archived pages remain in the database for audit and payment-history preservation.';

COMMIT;
