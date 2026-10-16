-- StatusFly Phase 4 — multi-product collection pages.
-- Additive migration: preserves existing page fields, payment rows, and legacy images.
-- Apply once to the local database and once to the Supabase database used by Render.

BEGIN;

ALTER TABLE public.product_pages
  ADD COLUMN IF NOT EXISTS page_type varchar(20) NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS collection_title varchar(140),
  ADD COLUMN IF NOT EXISTS collection_description varchar(1000);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.product_pages'::regclass
      AND conname = 'product_pages_page_type_check'
  ) THEN
    ALTER TABLE public.product_pages
      ADD CONSTRAINT product_pages_page_type_check
      CHECK (page_type IN ('single', 'collection'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.product_page_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_page_id uuid NOT NULL REFERENCES public.product_pages(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 10),
  product_name varchar(120) NOT NULL,
  category varchar(50) NOT NULL,
  description varchar(1000) NOT NULL,
  selling_points jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(selling_points) = 'array'),
  price_naira numeric(12, 0) NOT NULL CHECK (price_naira > 0),
  original_price_naira numeric(12, 0),
  promotion_text varchar(180),
  promotion_end_at date,
  availability varchar(20) NOT NULL DEFAULT 'available'
    CHECK (availability IN ('available', 'low_stock', 'sold_out', 'coming_soon', 'preorder')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(options) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_page_items_original_price_check
    CHECK (original_price_naira IS NULL OR original_price_naira > price_naira)
);

CREATE INDEX IF NOT EXISTS product_page_items_page_position_idx
  ON public.product_page_items (product_page_id, position, created_at);

CREATE TABLE IF NOT EXISTS public.product_page_item_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_item_id uuid NOT NULL REFERENCES public.product_page_items(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  public_url text NOT NULL,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_page_item_images_item_position_idx
  ON public.product_page_item_images (product_item_id, position, created_at);

COMMENT ON COLUMN public.product_pages.page_type IS
  'single keeps the legacy one-product experience; collection enables child product cards.';
COMMENT ON TABLE public.product_page_items IS
  'Items displayed on a StatusFly product collection page. Legacy single-product fields remain on product_pages.';
COMMENT ON TABLE public.product_page_item_images IS
  'Up to three images per product item on a StatusFly collection page.';

COMMIT;
