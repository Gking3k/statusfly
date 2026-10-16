-- StatusFly: support secure recovery of paid product-page editing links.
-- The application stores edit tokens encrypted for email delivery while the
-- product_pages table continues to store only the SHA-256 verification hash.

BEGIN;

ALTER TABLE public.product_page_payments
  ADD COLUMN IF NOT EXISTS edit_token_encrypted text;

CREATE INDEX IF NOT EXISTS product_page_payments_edit_link_recovery_email_idx
  ON public.product_page_payments (lower(customer_email), created_at DESC)
  WHERE status = 'success'
    AND customer_email IS NOT NULL
    AND edit_token_encrypted IS NOT NULL;

COMMENT ON COLUMN public.product_page_payments.edit_token_encrypted IS
  'AES-256-GCM encrypted product-page edit token retained for secure post-payment access email and owner-requested link recovery.';

COMMIT;
