-- StatusFly Admin Phase 3 — transaction verification and refund tracking
-- Run after the Phase 1 admin-foundation and Phase 2 product-page migrations.
-- Does not rewrite or delete existing payment records.

BEGIN;

-- Allow the admin dashboard to record a server-side Paystack verification source.
ALTER TABLE public.product_page_payments
  DROP CONSTRAINT IF EXISTS product_page_payments_verified_via_check;
ALTER TABLE public.product_page_payments
  ADD CONSTRAINT product_page_payments_verified_via_check
  CHECK (verified_via IS NULL OR verified_via IN ('browser', 'webhook', 'admin'));

CREATE TABLE IF NOT EXISTS public.admin_payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.product_page_payments(id) ON DELETE RESTRICT,
  payment_reference varchar(100) NOT NULL,
  idempotency_key uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  paystack_refund_id bigint UNIQUE,
  amount_kobo integer NOT NULL CHECK (amount_kobo > 0),
  currency character(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  status varchar(32) NOT NULL DEFAULT 'initiating'
    CHECK (status IN (
      'initiating',
      'pending',
      'processing',
      'needs-attention',
      'processed',
      'failed',
      'initiation_unknown'
    )),
  reason varchar(1000) NOT NULL,
  created_by varchar(100) NOT NULL,
  last_provider_event varchar(40),
  provider_message varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS admin_payment_refunds_payment_created_idx
  ON public.admin_payment_refunds (payment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_payment_refunds_reference_created_idx
  ON public.admin_payment_refunds (payment_reference, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_payment_refunds_status_created_idx
  ON public.admin_payment_refunds (status, created_at DESC);

COMMENT ON TABLE public.admin_payment_refunds IS
  'StatusFly owner-initiated Paystack refunds. Original payment rows remain immutable financial history.';
COMMENT ON COLUMN public.admin_payment_refunds.status IS
  'Paystack refund lifecycle. initiation_unknown reserves refundable balance when a request outcome was ambiguous.';

COMMIT;
