import {
  UserProfile,
  Project,
  Milestone,
  Invoice,
  DeliveryPassport,
  PreviewSession,
} from "@/types/database.types";

export const MOCK_USER_PROFILE: UserProfile = {
  id: "usr_mock_001",
  email: "araha.freelance@gmail.com",
  full_name: "A. Raha",
  role: "freelancer",
  country: "IN",
  business_name: "Raha Digital Systems",
  gstin: "27AADCR1234F1Z5",
  has_lut: true, // Zero-rated export of services
  created_at: "2026-01-15T10:00:00Z",
};

export const MOCK_PROJECTS: Project[] = [
  {
    id: "proj_001",
    freelancer_id: "usr_mock_001",
    client_id: "cl_001",
    client_name: "Nexus Labs Inc.",
    title: "AI Payment Gateway & Intelligence Dashboard",
    description: "Next.js microservices frontend with real-time risk assessment and PayPal integration.",
    currency: "USD",
    total_amount: 3200.0,
    status: "active",
    protection_level: "high",
    created_at: "2026-10-15T08:00:00Z",
    updated_at: "2026-11-02T12:00:00Z",
  },
  {
    id: "proj_002",
    freelancer_id: "usr_mock_001",
    client_id: "cl_002",
    client_name: "Vanguard Global Tech",
    title: "Micro-SaaS Multi-Tenant Billing Engine",
    description: "Multi-currency subscription and recurring invoice engine.",
    currency: "USD",
    total_amount: 1800.0,
    status: "in_review",
    protection_level: "balanced",
    created_at: "2026-09-20T11:30:00Z",
    updated_at: "2026-11-01T16:45:00Z",
  },
];

export const MOCK_MILESTONES: Milestone[] = [
  {
    id: "ms_001",
    project_id: "proj_001",
    title: "Milestone 1: Architecture Specification & Database Schema",
    description: "Approved technical blueprint and PostgreSQL migrations with RLS policies.",
    amount: 1000.0,
    currency: "USD",
    order_index: 1,
    status: "paid",
    due_date: "2026-10-25",
    acceptance_criteria: [
      "Architecture diagram delivered",
      "PostgreSQL DDL scripts verified",
      "API specs approved by client",
    ],
    paypal_order_id: "SANDBOX-ORD-92817234",
    paypal_capture_id: "CAP-887123490",
    paypal_status: "COMPLETED",
    created_at: "2026-10-15T08:30:00Z",
  },
  {
    id: "ms_002",
    project_id: "proj_001",
    title: "Milestone 2: Payment Gateway Integration",
    description: "Full PayPal sandbox checkout with webhook signature verification.",
    amount: 1200.0,
    currency: "USD",
    order_index: 2,
    status: "under_client_review",
    due_date: "2026-11-08",
    acceptance_criteria: [
      "PayPal Orders v2 integration complete",
      "Webhook HMAC validation active",
    ],
    paypal_order_id: "SANDBOX-ORD-44910283",
    paypal_status: "APPROVED",
    created_at: "2026-10-15T08:30:00Z",
  },
  {
    id: "ms_003",
    project_id: "proj_001",
    title: "Milestone 3: Final Digital Handover & Delivery Passport",
    description: "Production build, cryptographic SHA-256 manifest, and handover sign-off.",
    amount: 1000.0,
    currency: "USD",
    order_index: 3,
    status: "pending",
    due_date: "2026-11-20",
    acceptance_criteria: [
      "End-to-end automated tests pass",
      "Delivery Passport generated with immutable hash",
      "Source repository transferred securely",
    ],
    paypal_status: "NOT_CREATED",
    created_at: "2026-10-15T08:30:00Z",
  },
];

export const MOCK_INVOICES: Invoice[] = [
  {
    id: "inv_001",
    project_id: "proj_001",
    milestone_id: "ms_001",
    invoice_number: "PM-2026-001",
    amount: 1000.0,
    currency: "USD",
    status: "paid",
    due_date: "2026-10-25",
    paid_at: "2026-10-24T18:30:00Z",
    created_at: "2026-10-15T09:00:00Z",
  },
  {
    id: "inv_002",
    project_id: "proj_001",
    milestone_id: "ms_002",
    invoice_number: "PM-2026-002",
    amount: 1200.0,
    currency: "USD",
    status: "sent",
    due_date: "2026-11-08",
    created_at: "2026-10-28T10:00:00Z",
  },
];

export const MOCK_DELIVERY_PASSPORT: DeliveryPassport = {
  id: "dp_001",
  project_id: "proj_001",
  milestone_id: "ms_001",
  product_name: "PayMind Architecture & Schema Bundle",
  version: "v1.0.0",
  file_name: "paymind-arch-v1.0.0.zip",
  file_size_bytes: 4829104,
  sha256_hash: "8f4e2b10a9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2",
  checks: [
    {
      requirement_id: "REQ-01",
      requirement_title: "PostgreSQL DDL with strict RLS policies",
      test_type: "static_code",
      status: "PASSED",
      evidence_notes: "Schema validated with 14 tables and RLS enabled on all customer tables.",
    },
    {
      requirement_id: "REQ-02",
      requirement_title: "PayPal Orders v2 API endpoint specification",
      test_type: "automated",
      status: "PASSED",
      evidence_notes: "Type-safe Zod schema and Postman collection verified.",
    },
    {
      requirement_id: "REQ-03",
      requirement_title: "End-to-end zero-trust client preview isolation",
      test_type: "manual",
      status: "PASSED",
      evidence_notes: "Sandboxed execution verified without host access.",
    },
  ],
  all_passed: true,
  client_review_status: "accepted",
  handover_completed: true,
  handover_timestamp: "2026-10-24T18:15:00Z",
  created_at: "2026-10-24T17:00:00Z",
};


export const MOCK_PREVIEW_SESSIONS: PreviewSession[] = [
  {
    id: "prev_session_881",
    project_id: "proj_001",
    milestone_id: "ms_002",
    project_title: "AI Payment Gateway & Intelligence Dashboard",
    version: "v1.2.0-rc2",
    seller_id: "usr_mock_001",
    seller_name: "A. Raha (Raha Digital Systems)",
    client_name: "Nexus Labs Inc.",
    client_email: "billing@nexuslabs.io",
    session_token: "tok_live_demo_881",
    status: "active",
    created_at: "2026-11-07T08:00:00Z",
    expires_at: "2026-11-09T08:00:00Z",
    access_count: 4,
    last_accessed_at: "2026-11-07T09:30:00Z",
    allowed_parts: {
      interactive_preview: true,
      documentation: true,
      source_inspection_requestable: true,
    },
    watermark_text: "NEXUS LABS INC. • REF: PM-2026-002 • PREVIEW SESSION #881 • PAYMIND ZERO-TRUST DELIVERY",
    preview_content: {
      type: "web_app",
      title: "Interactive Milestone 2 Preview Application",
      description: "Sandboxed client preview environment. Features simulated PayPal checkout button, webhook status monitor, and risk scoring interface.",
      entry_html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PayMind Client Deliverable Preview</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b1120; color: #f1f5f9; padding: 24px; margin: 0; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
    h2 { margin-top: 0; color: #38bdf8; font-size: 18px; }
    .status { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .btn { background: #0284c7; color: white; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; }
    .btn:hover { background: #0369a1; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .log-box { background: #020617; border: 1px solid #1e293b; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; color: #94a3b8; height: 120px; overflow-y: auto; }
  </style>
</head>
<body>
  <div class="card">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <h2>Client Milestone 2: PayPal Checkout & Webhook Monitor</h2>
      <span class="status">Sandbox Active</span>
    </div>
    <p style="font-size: 13px; color: #94a3b8; margin: 8px 0 16px 0;">This interactive application is running inside a secure, zero-trust isolated iframe container.</p>
    <div class="grid">
      <div style="background:#0f172a; padding:16px; border-radius:8px; border:1px solid #1e293b;">
        <h4 style="margin:0 0 8px 0; color:#e2e8f0; font-size:14px;">Simulate Order Creation</h4>
        <p style="font-size:12px; color:#64748b; margin-bottom:12px;">Amount: USD 1,200.00 (Milestone 2)</p>
        <button class="btn" onclick="triggerTest()">Execute Sandbox Checkout</button>
      </div>
      <div style="background:#0f172a; padding:16px; border-radius:8px; border:1px solid #1e293b;">
        <h4 style="margin:0 0 8px 0; color:#e2e8f0; font-size:14px;">Server Event Dispatcher</h4>
        <div id="log" class="log-box">[18:30:12] Ready for client demonstration tests...<br>[18:30:14] Listening for PayPal Webhook event: PAYMENT.CAPTURE.COMPLETED</div>
      </div>
    </div>
  </div>
  <script>
    function triggerTest() {
      const log = document.getElementById('log');
      const time = new Date().toLocaleTimeString();
      log.innerHTML += '<br><span style="color:#38bdf8;">[' + time + '] POST /api/paypal/create-order -> Order ID: SANDBOX-ORD-44910283 (CREATED)</span>';
      log.scrollTop = log.scrollHeight;
    }
  </script>
</body>
</html>`,
      read_only_files: [
        {
          path: "src/services/paypal/orders.ts",
          language: "typescript",
          content: `// PayMind Secure Deliverable Preview
// Note: Sensitive client secrets and private credentials are stripped
import { getCachedAccessToken } from "./auth";

export async function createMilestoneOrder(milestoneId: string, amount: number, currency = "USD") {
  const token = await getCachedAccessToken();
  const res = await fetch("https://api-m.sandbox.paypal.com/v2/checkout/orders", {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${token}\`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": \`paymind-req-\${milestoneId}\`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: milestoneId,
          amount: {
            currency_code: currency,
            value: amount.toFixed(2),
          },
        },
      ],
    }),
  });
  return res.json();
}`,
          size_bytes: 840,
          sha256: "3b9a7c2d1e0f8a9b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b",
        },
        {
          path: "src/services/paypal/webhook.ts",
          language: "typescript",
          content: `// Webhook HMAC signature verification
import { verifySignature } from "./crypto";

export async function handleWebhookEvent(headers: Headers, rawBody: string) {
  const signature = headers.get("PAYPAL-TRANSMISSION-SIG");
  const authAlgo = headers.get("PAYPAL-AUTH-ALGO");
  const certUrl = headers.get("PAYPAL-CERT-URL");
  
  const isValid = await verifySignature({ signature, authAlgo, certUrl, rawBody });
  if (!isValid) {
    throw new Error("Invalid PayPal webhook signature: Event rejected.");
  }
  return { status: "VERIFIED", processed: true };
}`,
          size_bytes: 620,
          sha256: "7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f",
        },
      ],
    },
    source_inspection: {
      enabled: false,
      seller_authorized: false,
      client_accepted_terms: false,
      terms_text: "Mutual Source-Code Inspection Agreement: The client agrees that source code viewed in this portal is proprietary intellectual property of the seller provided strictly for functional verification. Viewing code does not convey copyright or license ownership until milestone payment and final contractual handover are complete. Browser-based display cannot technically prevent manual copying, photos, or transcription; both parties acknowledge and accept this limitation.",
    },
    demonstration: {
      id: "demo_conf_001",
      summary: "Live milestone 2 demonstration covering PayPal Orders v2 creation, sandboxed checkout, and webhook HMAC verification.",
      seller_confirmed: true,
      seller_confirmed_at: "2026-11-03T16:00:00Z",
      client_confirmed: false,
      requirements: [
        {
          id: "REQ-01",
          title: "PayPal Orders v2 server-side creation & capture",
          status: "accepted",
          feedback: "Tested with sandbox personal account, capture completes cleanly without client-side secrets.",
        },
        {
          id: "REQ-02",
          title: "Webhook HMAC signature validation & idempotency",
          status: "reviewed",
          feedback: "Simulated event delivered; verified in webhook transaction log.",
        },
        {
          id: "REQ-03",
          title: "Zero-trust client preview isolation & watermark",
          status: "pending",
          feedback: "",
        },
      ],
    },
    audit_logs: [
      {
        timestamp: "2026-11-03T10:00:00Z",
        action: "PREVIEW_SESSION_CREATED",
        actor: "seller",
        actor_name: "A. Raha",
        details: "Generated 48-hour secure preview token for Nexus Labs Inc.",
      },
      {
        timestamp: "2026-11-03T14:15:20Z",
        action: "PREVIEW_ACCESSED",
        actor: "client",
        actor_name: "Nexus Labs Billing",
        details: "Authenticated via session token tok_live_demo_881.",
      },
      {
        timestamp: "2026-11-03T14:25:00Z",
        action: "REQUIREMENT_ACCEPTED",
        actor: "client",
        actor_name: "Nexus Labs Billing",
        details: "Marked REQ-01 as accepted.",
      },
      {
        timestamp: "2026-11-03T16:00:00Z",
        action: "DEMONSTRATION_CONFIRMED",
        actor: "seller",
        actor_name: "A. Raha",
        details: "Seller confirmed completion of Milestone 2 demonstration.",
      },
    ],
  },
];

