# StatusFly — Dedicated Net Revenue Reporting Reset

This patch adds a separately audited reporting baseline for the **Overview → Net revenue** metric.
It does **not** add a financial metric to `admin_analytics_baselines`; the existing analytics reset allowlist and database constraint remain unchanged.

## Behavior

- Admin-only `POST /api/admin/analytics/revenue-reset` endpoint, rate-limited separately from ordinary analytics resets.
- Explicit client confirmation, required reason, and transactional audit entry.
- Revenue baseline stored in `public.admin_revenue_baselines`.
- The baseline applies only to `business.periodRevenueNaira`, the Net revenue metric shown in the Overview, across the 7-day, 30-day, and All time range selections.
- The Purchases count, payment totals, gross and refund summaries, and all-time Net revenue under Money & feedback are not reset by this action.
- Payment, refund, and analytics-event rows are never deleted or modified by this feature.

## Files

The ZIP contains replacement files under their original `client/` and `server/` paths plus a new migration and tests. Extract it at the StatusFly project root.

## Apply and verify

1. Back up the local StatusFly database.
2. Apply `server/migrations/20261010_admin_revenue_baselines.sql` to the **local** database first. Apply it to Supabase only after local verification and your normal production backup/release process.
3. Run from the project root:

   ```bash
   npm run typecheck
   npm run build
   ```

4. From `server/`, run the focused tests:

   ```bash
   node --import tsx --test tests/adminRevenueReset.test.ts tests/adminRoutes.test.ts tests/adminAnalyticsReset.test.ts tests/adminPayments.test.ts tests/adminProductPagesRoutes.test.ts tests/adminAudit.test.ts tests/adminAuth.test.ts
   ```

5. Test with local data only. Use a reason, confirm the reset, check that the Overview Net revenue shows zero immediately after reset, and create a new test payment to verify that revenue starts increasing again. Confirm Purchases and Money & feedback's All-time totals are unchanged.

No live reset, database migration, payment/refund action, or deployment was performed while preparing this patch.
