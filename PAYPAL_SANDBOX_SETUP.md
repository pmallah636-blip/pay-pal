# PayMind PayPal Sandbox setup

## 1. Rotate exposed credentials

If a PayPal Client Secret was ever pasted into chat, screenshots, source code, or a shared file, regenerate it in PayPal Developer Dashboard → Apps & Credentials → Sandbox app. Do not put the secret in a browser file or commit it.

## 2. Configure local environment

Copy `paypal-sandbox.env.example` to `.env.local` and replace the placeholders.

Required values:

- `NEXT_PUBLIC_PAYPAL_CLIENT_ID`: Sandbox REST app Client ID; public browser SDK value.
- `PAYPAL_CLIENT_ID`: same Client ID for server-to-server OAuth.
- `PAYPAL_CLIENT_SECRET`: rotated Sandbox secret; server only.
- `PAYPAL_WEBHOOK_ID`: ID of the registered webhook, not a Webhooks Simulator identifier.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase project and public anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only key used by verified webhook handling and server persistence.
- `PAYMIND_DEMO_MODE=true`: optional, local development only; enables seeded sample invoice checkout. It is ignored in production.

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `PAYPAL_CLIENT_SECRET` in client components, `NEXT_PUBLIC_*` variables, screenshots, or Git.

## 2a. Browser checkout uses JavaScript SDK v6

The checkout button loads the Sandbox SDK v6 core script from `https://www.sandbox.paypal.com/web-sdk/v6/core`, initializes it with the public Client ID, checks PayPal eligibility, and starts a one-time payment session. The SDK's `createOrder` callback returns `{ orderId }`; order creation and capture stay on PayMind's server. The Client Secret is never sent to the browser.

## 3. Apply database migrations

Run the SQL files in order in Supabase SQL Editor:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_preview_and_demonstration.sql`
3. `supabase/migrations/003_payments_auth_and_webhooks.sql`
4. `supabase/migrations/004_alter_preview_identifiers_to_text.sql`
5. `supabase/migrations/005_fix_preview_rls_and_token_hash.sql`

Migration 003 creates the durable PayPal payment ledger, profile-on-signup trigger, authenticated invoice/milestone ownership policies, and server-only webhook event storage. Apply it before testing persistence. Migrations 004–005 harden preview/session security and token storage; apply them in order on databases that need the forward fixes.

## 4. Create an account

Open Settings → Account & secure payment access. Create a freelancer account, confirm the email if Supabase email confirmation is enabled, then sign in. To process a real invoice, the signed-in freelancer must own the project linked to that invoice. Seeded invoice IDs are only available when local demo mode is enabled.

## 5. Sandbox buyer and seller

In PayPal Developer Dashboard, create/use one Sandbox Business account (seller) and one Sandbox Personal account (buyer). Use the Personal account credentials only on PayPal's Sandbox approval page. These are test transactions, not real money.

## 6. Register a webhook

Deploy the app or expose local development through a secure HTTPS tunnel, then register:

`https://YOUR_PUBLIC_HTTPS_HOST/api/paypal/webhook`

Subscribe to:

- `CHECKOUT.ORDER.APPROVED`
- `PAYMENT.CAPTURE.PENDING`
- `PAYMENT.CAPTURE.DENIED`
- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.REFUNDED`

Copy the webhook's ID (not its simulator ID) to `PAYPAL_WEBHOOK_ID`. PayMind verifies the PayPal transmission signature before it writes an event. Event IDs are unique, so duplicate webhook deliveries are acknowledged without applying the same update again.

PayPal's Webhooks Simulator emits mock events. Simulator mock events cannot be verified as genuine transmissions with the normal postback signature check. Test webhook verification using a real Sandbox checkout.

## 7. Run locally

```powershell
npm install
npm run build
npm run dev
```

Open `http://localhost:3000/settings`, configure Supabase, sign in, and then open `/payments`. The local sample invoice flow requires `PAYMIND_DEMO_MODE=true` and a Supabase service-role key so the order/capture records can persist. Production never accepts the demo-mode fallback.

## Persistence and security notes

- Order creation reads amount/currency from server-owned invoice data, not browser-supplied amounts.
- The signed-in freelancer must own the project linked to a production invoice.
- Captures must be `COMPLETED` and amount/currency must match the saved order before an invoice is marked paid.
- Verified webhook events and payment records are stored in Supabase via the server-only service-role client.
- Local reminders use browser storage and the Notification API; they are not server push notifications and only run while the app is open. Seller reminders use the signed-in seller’s RLS-protected projects. Client reminders require a confirmed client account whose email matches the client contact email saved on the project. Each side sets its own role and reminder schedule in Settings.

## APIMatic PayPal context (optional developer aid)

APIMatic PayPal context plugin skills were used for API-semantics review (OAuth/auth, Orders create/capture, webhook signature verification flow, amount/currency validation, refunds, error handling, idempotency). This is a development/reference aid only and is not a runtime dependency. PayMind still uses direct server-side PayPal REST calls and server-side verification.
