# StatusFly Admin — Phase 4: Analytics Controls & Reporting

This is a source overlay for the StatusFly repository with Phases 1–3 already applied. Copy the included `client/` and `server/` paths into the repository root, allowing matching files to be overwritten.

## What's included

- Platform-wide analytics reset controls for selected counters: unique visitors, homepage views, creation-page views, drafts created, payment starts, payment setup failures, public product-page views, product-page views, WhatsApp clicks, and share clicks.
- Per-product-page reset controls for views, WhatsApp clicks, and share clicks in the product-page Inspect dialog.
- Reset actions create reporting baselines in `public.admin_analytics_baselines`; they do not delete analytics events. The latest baseline for each metric/scope supersedes older baselines.
- Reset controls require a reason, confirmation, admin authentication, rate limiting, and a transactional audit record.
- Product-page reset baselines apply to that page's admin list/details and seller insights. Platform-wide resets of product engagement metrics apply across all pages' displayed insights.
- Money and customer feedback are not resettable. Payment records, gross amounts, refund records, and feedback records are preserved.
- Overview revenue reporting now distinguishes gross successful payments, processed refunds, pending refunds, and net revenue after processed refunds.
- Tests for reset input validation and an unauthenticated reset endpoint.

## Database prerequisites

**Phase 4 has no new SQL migration.** It reuses the baseline and audit tables introduced in `server/migrations/20261010_admin_foundation.sql` and the refund table introduced in `server/migrations/20261010_admin_payments.sql`. Those earlier migrations must already be applied to both the local database and the specific Supabase database used by Render. There is no need to rerun them for Phase 4.

Applying migrations once to local PostgreSQL and once to Supabase is normal because they are separate databases. Do not repeatedly rerun SQL files unless they are designed to be safely rerunnable. Back up production before any future schema change.

## Apply and test

1. Back up your local `statusfly` database.
2. Extract this overlay at the repository root, preserving paths. No SQL migration is needed for Phase 4.
3. From the repository root, run:

   ```bash
   npm run typecheck
   npm run build
   ```

4. From `server/`, run the focused admin tests:

   ```bash
   node --import tsx --test tests/adminAnalyticsReset.test.ts tests/adminRoutes.test.ts tests/adminPayments.test.ts tests/adminProductPagesRoutes.test.ts tests/adminAudit.test.ts tests/adminAuth.test.ts
   ```

5. Start the app against the local database and log in at `/admin`.
6. First test resets against local test data only. Select one counter, enter a reason, confirm, and verify that the displayed count starts from zero while historical rows remain present. Generate a new event to confirm the count increases again. Try a per-page reset from Product pages → Inspect as well.
7. Verify that the Money & feedback panel continues to show payment/refund figures and that processed refunds reduce net revenue while pending refunds are listed separately.

## Important cautions

- A **platform-wide product engagement reset affects displayed product engagement counts across all pages**, including seller insights. Use individual-page reset when only one page should start a new reporting baseline.
- Baselines do not delete old records, but older events are excluded from current displayed counters after the baseline.
- Never use the production reset control for local testing. It changes what the dashboard reports for the production environment, even though it retains the underlying history.
- No reset changes payment records, refunds, revenue transactions, or customer feedback.

## Validation in the preparation workspace

- Server typecheck: passed
- Server build: passed
- Client typecheck: passed
- Reset payload validation smoke checks: 5 passed
- Unauthenticated reset route smoke check: passed
- The TypeScript test runner and client production bundle could not be run in this Linux workspace because the supplied dependencies contain Windows-specific native binaries. Run the listed test/build commands on your Windows machine before deployment.
- No database migration, live reset, Paystack action, or deployment was performed while preparing this overlay.
