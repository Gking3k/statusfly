# StatusFly Admin — Phase 3: Payments & Refunds

This is a source overlay for the StatusFly client/server code supplied for Phase 3. It is not a full application archive. Apply it to the same repository that already contains the Phase 1 admin foundation and Phase 2 product-page manager.

## Included

- Admin dashboard tab: Payments & refunds
- Payment search, filters, pagination, summary amounts and payment detail view
- Server-side Paystack transaction verification with exact reference, amount, currency and product-page metadata checks
- Full and partial refund requests through Paystack, protected by admin authentication, audit logging, rate limiting, database row locking, refundable-balance checks, and idempotency keys
- Separate refund records and provider status refresh/webhook reconciliation
- Reconciliation path for uncertain refund responses. It only attaches a missing provider refund ID when the transaction matches and Paystack returns one unique refund carrying the local StatusFly marker. Ambiguous cases remain unchanged.
- Database migration and focused authorization/status tests

## Apply safely

1. Back up your local `statusfly` PostgreSQL database.
2. Apply `server/migrations/20261010_admin_payments.sql` to the local `statusfly` database first (pgAdmin Query Tool is fine). It assumes the Phase 1 admin foundation and Phase 2 product-page migrations have already been applied. It does not delete payment rows.
3. Extract this ZIP and copy the included `client/` and `server/` folders into the StatusFly repository root, preserving paths and allowing the matching source files to be replaced.
4. From the repository root, run:

   ```bash
   npm run typecheck
   npm run build
   ```

5. Run focused server tests from the `server/` folder in your Windows environment:

   ```bash
   node --import tsx --test tests/adminPayments.test.ts tests/adminRoutes.test.ts tests/adminProductPagesRoutes.test.ts tests/adminAudit.test.ts tests/adminAuth.test.ts
   ```

6. Start StatusFly locally, open `/admin`, and inspect the Payments & refunds tab.
7. Test verification against Paystack test-mode transactions first. Do not initiate a refund on a real/live transaction during development. A refund action calls Paystack and may return real money to a customer.

Only after local checks pass, back up production and apply the same migration to the exact Supabase database used by Render. Deploy the matching server/client source afterward. Do not run the SQL against an arbitrary database.

## Important behavior

- Original payment amount and reference are read-only in this dashboard. Verification queries Paystack and only reconciles when the provider reference, amount, currency and StatusFly product-page metadata match.
- A refund is stored in `admin_payment_refunds`; the original transaction is not overwritten.
- Refund initiation is not the same as completion. Paystack refund statuses are asynchronous; processed refunds may take additional time to reach a customer.
- `initiation_unknown` reserves the amount so a timeout cannot accidentally trigger a duplicate refund. Use **Reconcile** / inspect Paystack; do not retry blindly.
- `needs-attention` means Paystack needs additional action for the refund. This panel refreshes the state; it does not collect or submit customer bank details.
- This phase supports NGN product-page payments recorded in `product_page_payments`. It does not manage legacy payments from the unrelated fixed-price payment flow.
- Confirm that the existing Paystack webhook URL in the Paystack dashboard points to StatusFly's existing webhook endpoint. Refund lifecycle events use that endpoint too.

## Validation status in the build workspace

- Server `npm run typecheck`: passed
- Server `npm run build`: passed
- Client `npm run typecheck`: passed
- Compiled-route smoke check: passed for all five new payment/refund endpoints requiring an admin session; Paystack refund status parsing passed
- The TypeScript test runner and client production bundle were not validated in this Linux workspace because the uploaded dependencies contain Windows-native `esbuild` binaries. Run the commands above on Windows before deploying.
- No live Paystack refund or live database migration was executed while preparing this overlay.
