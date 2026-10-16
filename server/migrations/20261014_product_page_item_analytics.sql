-- StatusFly Phase 5 — link collection WhatsApp clicks to the selected item.
-- Additive only: existing aggregate events remain valid and are not deleted.

BEGIN;

ALTER TABLE public.product_page_analytics_events
  ADD COLUMN IF NOT EXISTS product_page_item_id uuid
  REFERENCES public.product_page_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS product_page_analytics_item_event_idx
  ON public.product_page_analytics_events
    (product_page_id, product_page_item_id, event_type, created_at DESC);

COMMENT ON COLUMN public.product_page_analytics_events.product_page_item_id IS
  'Optional collection item associated with a WhatsApp ordering click; null for page-level events.';

COMMIT;
