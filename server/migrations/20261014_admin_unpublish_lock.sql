-- StatusFly Phase 3 — enforce admin-controlled unpublishing.
-- Hidden pages that pre-date this migration are treated as administratively hidden
-- so a seller cannot republish them using an existing private edit link.
-- This migration preserves page contents, payment records and refund records.

BEGIN;

ALTER TABLE public.product_pages
  ADD COLUMN IF NOT EXISTS admin_unpublished boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS admin_unpublished_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_unpublished_by text,
  ADD COLUMN IF NOT EXISTS admin_unpublish_reason text;

UPDATE public.product_pages
   SET admin_unpublished = TRUE
 WHERE status = 'hidden'
   AND admin_unpublished = FALSE;

CREATE INDEX IF NOT EXISTS product_pages_admin_unpublished_idx
  ON public.product_pages (admin_unpublished)
  WHERE admin_unpublished = TRUE;

COMMENT ON COLUMN public.product_pages.admin_unpublished IS
  'When true, seller edit links cannot republish this page; only an authenticated admin may clear the restriction.';
COMMENT ON COLUMN public.product_pages.admin_unpublished_at IS
  'Timestamp when an administrator applied the publication restriction; may be NULL for legacy hidden pages.';
COMMENT ON COLUMN public.product_pages.admin_unpublished_by IS
  'Admin username that applied the publication restriction when available.';
COMMENT ON COLUMN public.product_pages.admin_unpublish_reason IS
  'Administrative reason recorded when a page is unpublished.';

COMMIT;
