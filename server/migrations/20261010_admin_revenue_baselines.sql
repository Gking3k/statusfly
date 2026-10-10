-- Dedicated reporting baseline for the Overview Net revenue card.
-- This table does not modify payment or refund records and does not alter analytics reset constraints.
BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_revenue_baselines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reset_by character varying(100) NOT NULL,
    reason character varying(1000) NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS admin_revenue_baselines_created_idx
    ON public.admin_revenue_baselines USING btree (created_at DESC);

COMMENT ON TABLE public.admin_revenue_baselines IS
    'Append-only reporting baselines for the StatusFly Overview Net revenue card; historical payment and refund records remain unchanged.';

COMMIT;
