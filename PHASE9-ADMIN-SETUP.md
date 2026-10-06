# StatusFly Phase 9 — Owner Admin Analytics

This overlay adds a private owner dashboard at `/admin` plus anonymous platform analytics tracking.
It does not replace the existing seller insights system.

## 1. Run the database migration

Run `statusfly-phase9-admin.sql` once against the same production PostgreSQL database used by StatusFly (your Supabase database).

## 2. Add Render environment variables

Add these to the **server** service in Render:

```text
STATUSFLY_ADMIN_USERNAME=your-admin-username
STATUSFLY_ADMIN_PASSWORD=your-long-random-admin-password
STATUSFLY_ADMIN_SESSION_SECRET=your-random-secret-at-least-32-characters
```

Generate a strong session secret in Git Bash with:

```bash
openssl rand -hex 32
```

Do not commit the real values to GitHub.

## 3. Deploy

Deploy the updated server and client normally.

The dashboard is available at:

```text
https://statusfly.com/admin
```

## 4. What the dashboard tracks

- Anonymous unique visitors (random browser visitor ID)
- Home-page views
- Create-page views
- Drafts created
- Payment starts
- Payment initialization failures
- Successful product-page payments
- Revenue
- Published product pages
- Product-page views
- WhatsApp clicks
- Share clicks
- Top published product pages
- Recent payments (email masked)
- Recent feedback and ratings

The existing product-page analytics table remains the source for seller-facing page views, WhatsApp clicks, and shares.

## 5. Authentication model

The owner signs in with the server-side username/password. The server returns a short-lived HMAC-signed admin session token. The browser keeps that token in `sessionStorage` for the current browser session. The analytics API refuses requests without a valid token.

There is no seller access to `/admin` in this version.
