-- StatusFly Phase 1 — Admin security, audit log, and analytics reset baselines
-- Review before applying. Run against the StatusFly production PostgreSQL database
-- only after taking a fresh database backup. This migration preserves existing events
-- and payments; it does not reset or delete user data.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- The analytics service already reads this table. The earlier Phase 9.1 SQL created
-- it separately; this migration makes the setup repeatable if it is not present yet.
CREATE TABLE IF NOT EXISTS public.platform_analytics_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visitor_id uuid NOT NULL,
    event_type character varying(40) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.platform_analytics_events'::regclass
          AND conname = 'platform_analytics_events_pkey'
    ) THEN
        ALTER TABLE public.platform_analytics_events
            ADD CONSTRAINT platform_analytics_events_pkey PRIMARY KEY (id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.platform_analytics_events'::regclass
          AND conname = 'platform_analytics_events_event_type_check'
    ) THEN
        ALTER TABLE public.platform_analytics_events
            ADD CONSTRAINT platform_analytics_events_event_type_check CHECK (
                event_type IN (
                    'home_view',
                    'create_view',
                    'draft_created',
                    'payment_started',
                    'payment_init_failed',
                    'public_product_page_view'
                )
            );
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS platform_analytics_events_visitor_idx
    ON public.platform_analytics_events USING btree (visitor_id);
CREATE INDEX IF NOT EXISTS platform_analytics_events_created_idx
    ON public.platform_analytics_events USING btree (created_at);
CREATE INDEX IF NOT EXISTS platform_analytics_events_type_idx
    ON public.platform_analytics_events USING btree (event_type);

-- Append-only record of privileged admin actions. Do not store passwords,
-- access tokens, full customer contact details, or payment credentials in details.
CREATE TABLE IF NOT EXISTS public.admin_action_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    actor_username character varying(100) NOT NULL,
    action character varying(100) NOT NULL,
    entity_type character varying(40) NOT NULL,
    entity_id text,
    outcome character varying(20) NOT NULL DEFAULT 'succeeded',
    reason character varying(1000),
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT admin_action_logs_outcome_check
        CHECK (outcome IN ('started', 'succeeded', 'failed')),
    CONSTRAINT admin_action_logs_details_object_check
        CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX IF NOT EXISTS admin_action_logs_created_idx
    ON public.admin_action_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_action_logs_entity_idx
    ON public.admin_action_logs USING btree (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_action_logs_action_idx
    ON public.admin_action_logs USING btree (action, created_at DESC);

-- Analytics reset requests create a new baseline rather than deleting event history.
-- Each new row supersedes older baselines for the same scope + metric.
-- Financial metrics are deliberately excluded from the supported metric list.
CREATE TABLE IF NOT EXISTS public.admin_analytics_baselines (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    scope_type character varying(20) NOT NULL,
    scope_id uuid,
    metric_key character varying(60) NOT NULL,
    reset_by character varying(100) NOT NULL,
    reason character varying(1000),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT admin_analytics_baselines_scope_check CHECK (
        (scope_type = 'platform' AND scope_id IS NULL)
        OR (scope_type = 'product_page' AND scope_id IS NOT NULL)
    ),
    CONSTRAINT admin_analytics_baselines_metric_check CHECK (
        metric_key IN (
            'unique_visitors',
            'home_views',
            'create_views',
            'drafts_created',
            'payment_starts',
            'payment_init_failures',
            'public_product_page_views',
            'product_page_views',
            'whatsapp_clicks',
            'share_clicks'
        )
    )
);

CREATE INDEX IF NOT EXISTS admin_analytics_baselines_lookup_idx
    ON public.admin_analytics_baselines USING btree
       (scope_type, scope_id, metric_key, created_at DESC);

COMMENT ON TABLE public.admin_action_logs IS
    'Append-only audit trail for StatusFly owner/admin actions.';
COMMENT ON TABLE public.admin_analytics_baselines IS
    'Reporting baselines used to zero selected analytics without deleting historical events.';

COMMIT;
