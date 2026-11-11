# PayMind

PayMind is a freelancer protection workspace for cross-border projects. It connects contract review, milestone planning, PayPal Sandbox payment records, client review, and digital delivery evidence.

## Main areas

- **Overview:** project, milestone, calendar and payment summaries from the shared browser-local demo workspace.
- **Contracts & Agreements:** AI-assisted contract extraction, evidence-backed findings and a what-if payment structure simulator.
- **Projects:** projects, client details, milestones, due dates and payment schedules in the browser-local demo workspace.
- **Delivery Check:** compares contract/milestone requirements with text evidence from a submitted ZIP or supported text file.
- **AI Scope Change Detector:** compares a new client request with the saved agreement, surfaces quoted evidence and ambiguity, and drafts a change order for both parties to review. It never changes the contract or invents a price/deadline. Uploaded code is never executed; the report is evidence assistance, not functional/security certification.
- **Payments:** browser-local demo payment planner and history. The separate PayPal Sandbox API/checkout routes remain available for a real Sandbox integration test.
- **Settings:** workspace-view selection, Supabase sign-in, and customizable milestone reminders.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Replace the example values in `.env.local` with your own credentials. Never commit `.env.local` or share your PayPal Client Secret or Supabase service-role key.

## PayPal Sandbox setup

Follow [PAYPAL_SANDBOX_SETUP.md](./PAYPAL_SANDBOX_SETUP.md) for:

- Creating a Sandbox app and configuring the Client ID and rotated Secret.
- Applying Supabase migrations in order.
- Testing with Sandbox Personal (buyer) and Business (seller) accounts.
- Registering the public HTTPS webhook endpoint and verifying event signatures.

The checkout demo currently supports USD invoices. Orders and captures are created server-side. PayMind only marks an invoice paid after PayPal reports a completed capture whose amount and currency match the saved invoice. This is a Sandbox integration, not a live-money or escrow service.

## Milestone reminders

See [MILESTONE_REMINDERS.md](./MILESTONE_REMINDERS.md). Users can select 3-, 2-, and 1-day reminders, optionally add their own reminder offsets, and enable browser notifications. The reminder bell and preferences are scoped to the signed-in account on the current browser. Reminders are checked while PayMind is open; this version does not include background push delivery or cross-device preference sync.

## Database setup

Apply the SQL migrations in order in the Supabase SQL Editor:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_preview_and_demonstration.sql`
3. `supabase/migrations/003_payments_auth_and_webhooks.sql`
4. `supabase/migrations/004_alter_preview_identifiers_to_text.sql`
5. `supabase/migrations/005_fix_preview_rls_and_token_hash.sql`

Migrations 004–005 harden preview sessions (identifier compatibility, removal of insecure public preview policies, and token-hash storage). Use forward migrations for corrections on existing databases. Do **not** run remote `supabase db push`/reset against production from this repo without an explicit, reviewed target.

## AI delivery evidence check

The `/deliverables` page supports a local demo workflow: select a project/milestone, upload a ZIP or supported text file (up to 8 MB), and compare inspected text with saved contract/milestone requirements. The archive inspector rejects path traversal, caps entry count/uncompressed size/compression ratio, skips secrets/dependencies/generated folders, and never executes uploaded content. AI findings must cite exact snippets from inspected files; unmatched quotations are downgraded to human review. If the configured Gemini/OpenAI provider is unavailable, the app labels the result as a deterministic text-match fallback. Reports are saved in this browser's demo workspace only; uploaded files are not retained by this feature.

This review does **not** prove code runs, is secure, meets full requirements, or is accepted by the client. PDFs and binary assets are not text-inspected by this version. In production, AI endpoints require a verified Supabase user session; local demo access is available only when `PAYMIND_DEMO_MODE=true` outside production. Delivery-review files are processed in memory and report metadata is saved in this browser's demo workspace, not persisted to a server database.

## AG Studio (Phase 1)

PayMind includes an AG Studio-powered Financial Intelligence dashboard (`/intelligence`) using `ag-studio-react`/`ag-studio` with the Agent Framework and a server-proxied LLM adapter (`/api/intelligence/studio`). AG Grid Enterprise/AG Studio are commercial packages (45-day trial noted by AG Grid); production use requires appropriate licensing. The AG Studio, contract-analysis, simulator and delivery-review AI routes require a verified Supabase user session in production. Local demo access is available only when `PAYMIND_DEMO_MODE=true` outside production. AI provider keys remain server-side.

## Testing

```bash
npx tsc --noEmit
npx eslint .
npm test
npm run build
```

`npm test` runs the project’s Node-based suites (security, preview-security, notifications, PayPal logic, migration integrity, financial intelligence, AG Studio, intelligence access, workspace UX and delivery review). Preview/PayPal end-to-end flows that require live Supabase or PayPal Sandbox credentials are **not** fully exercised by local unit/static tests; see `PAYPAL_SANDBOX_SETUP.md` and the release report for manual steps.

## APIMatic PayPal context (development/review)

The official APIMatic PayPal context plugin (`npx context-plugins install paypal`) was installed for PayPal API reference/skill context. Relevant TypeScript PayPal guidance is copied project-locally under `.kilo/skills/paypal-apimatic-context/` for Kilo Code skill discovery where compatible. APIMatic is **not** a runtime dependency; PayMind keeps its existing direct server-side PayPal REST integration. Review upstream license/terms before redistribution.

## Known limitations

- The separate legacy Supabase demo-data module still contains seeded fixtures for routes that explicitly import it. The new browser-local workspace starts empty unless the user loads an example project. Never present local demo records as live production records.
- **Milestone communications (Part 2):** configurable deadline reminders exist, but the requested structured actions/history (small change request, request more time, propose revised deadline, unable to complete, future contact, persistent communication history by project/milestone) are **not fully implemented** in this workspace. See [MILESTONE_REMINDERS.md](./MILESTONE_REMINDERS.md).
- Production payment operations require Supabase Auth, invoice ownership, the server-side service-role key, and migration 003+.
- PayPal webhooks require a registered webhook ID and a publicly reachable HTTPS endpoint. The PayPal Webhooks Simulator emits mock events that cannot pass the standard transmission-signature verification endpoint; use a real Sandbox checkout for signature verification.
- Client deadline reminders require a confirmed Supabase account whose email matches the email stored in the project's client contact record.
- Browser notifications require permission and a running browser. No notification is delivered while the app is fully closed.
- Real Supabase integration, real PayPal Sandbox end-to-end capture/webhook verification, and multi-instance concurrent idempotency were **not executed** in this environment (no safe disposable DB/credentials/tunnel). RLS/ownership/FK/persistence are covered by SQL review + static/mocked tests where available.
- PayMind is not an escrow service and does not hold funds. Do not add fake client reputation, fake fraud detection, or false payment confirmation.
