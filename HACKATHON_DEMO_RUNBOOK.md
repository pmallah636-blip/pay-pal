# PayMind hackathon demo runbook

## Product story

PayMind helps a freelancer connect the original agreement to the work submitted for review and the payment evidence recorded for that project. The distinctive AI workflow is:

1. Extract agreement terms and acceptance criteria from contract text.
2. Save the selected requirements to a project and milestone.
3. Inspect a submitted ZIP/text delivery as text only.
4. Compare the inspected text with the saved requirements and return exact file quotations that can be checked by a human.
5. Keep the result attached to the milestone as a browser-local demo evidence report.

The review is decision support. It is not a functional test, security scan, legal opinion, certification, or automatic acceptance decision.

## Local setup

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and configure the existing PayPal/Supabase values as needed.
3. For local unauthenticated demonstration only, set `PAYMIND_DEMO_MODE=true` while running `next dev`. This flag is ignored in production.
4. To use AI extraction and AI delivery review, configure `PAYMIND_AI_PROVIDER` as `gemini` or `openai`, set `PAYMIND_AI_MODEL` to a model supported by the chosen provider, and add only the matching server-side key (`GEMINI_API_KEY` or `OPENAI_API_KEY`). Do not expose keys in browser variables or commit `.env.local`.
5. Run `npm run dev` and open `http://localhost:3000`.

In production, AI API routes require a verified Supabase user session. The local demo flag does not open production endpoints to anonymous requests.

## Suggested 2–3 minute product demonstration

### 1. Create a guided example

- Open **Projects**.
- Select **Load example project (DEMO)**.
- Open **Portfolio Website Delivery (DEMO)**.
- Point out that its fictional agreement, client, amount, three milestones, and acceptance criteria are clearly marked as demonstration data.

### 2. Show contract intelligence

- Open **Contracts** and select the example project.
- The saved example agreement loads into the editor.
- Click **Analyze agreement** (confirm the AI-processing consent first).
- Show explicit, inferred, and missing fields, exact evidence quotations, deterministic issue checks, and editable extracted values.
- Save findings to the project.

If no AI provider is configured, the page will disclose that it is using deterministic extraction. Do not describe that as an AI result.

### 3. Show the AI Delivery Check

- Open the example project's first milestone and select **Check delivery**.
- Download `paymind-sample-delivery.zip` from the Delivery Check page.
- Upload the ZIP, confirm permission to send it for AI-assisted review, and run the check.
- Show the inspected file list, exact quotations, evidence-found / not-found / human-review states, skipped-file count, and SHA-256 identity hash.
- Download the JSON evidence report.

Uploaded code is inspected as text only. PayMind does not execute the archive or prove that the website works. The example contact form shows a local browser confirmation and does not send data to a backend.

### 4. Show the shared project workspace

- Open **Projects** to show milestone delivery and payment schedule.
- Open **Overview** to show dates generated from the same workspace records.
- Switch the Settings demo view between Merchant and Client to show role-specific wording. This is a presentation filter over local demo data, not real account impersonation or cross-device collaboration.

### 5. Explain PayPal accurately

The local Payments page is intentionally a browser-local planning/history demo and does not call PayPal or Supabase. The separate server-side PayPal Orders/capture/webhook APIs remain in the codebase. Only describe an actual Sandbox payment or verified webhook after a real Sandbox buyer approval, server capture, and genuine webhook signature verification have been completed.

## Demo limitations to disclose

- Browser-local projects, contract notes, manual payments, calendar dates, and delivery report metadata stay in the current browser's localStorage.
- They do not synchronize to another user's browser or device.
- Manual payment entries are demo records, never verified PayPal captures.
- Secure client preview requires a valid server-backed session and the existing authentication/ownership rules. A browser-local project does not automatically become a server-backed project.
- Delivery Check currently inspects supported text files inside ZIPs and individual text files. PDFs, images and other binaries are skipped/not parsed.
- No uploaded program is executed. Code/text presence is not proof that a feature works or is secure.
- AI delivery findings use best-effort credential redaction and exact quotation validation, but do not guarantee every secret format is detected.
