-- StatusFly Phase 9.1 — Owner/admin analytics events
-- Run once against the same production PostgreSQL database used by StatusFly.
-- This table contains only anonymous, randomly generated visitor IDs and event timestamps.

CREATE TABLE IF NOT EXISTS public.platform_analytics_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visitor_id uuid NOT NULL,
    event_type character varying(40) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_analytics_events_event_type_check CHECK (
        (event_type)::text = ANY (
            ARRAY[
                'home_view'::character varying,
                'create_view'::character varying,
                'draft_created'::character varying,
                'payment_started'::character varying,
                'payment_init_failed'::character varying,
                'public_product_page_view'::character varying
            ]::text[]
        )
    )
);

ALTER TABLE ONLY public.platform_analytics_events
    ADD CONSTRAINT platform_analytics_events_pkey PRIMARY KEY (id);

CREATE INDEX IF NOT EXISTS platform_analytics_events_visitor_idx
    ON public.platform_analytics_events USING btree (visitor_id);

CREATE INDEX IF NOT EXISTS platform_analytics_events_created_idx
    ON public.platform_analytics_events USING btree (created_at);

CREATE INDEX IF NOT EXISTS platform_analytics_events_type_idx
    ON public.platform_analytics_events USING btree (event_type);
