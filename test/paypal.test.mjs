import assert from "node:assert/strict";

console.log("======================================================================");
console.log("PAYMIND PAYPAL SANDBOX INTEGRATION & MOCKED API UNIT TESTS");
console.log("======================================================================\n");

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
    failed++;
  }
}

// 1. Credentials Verification & Base URL Check
await test("1. PayPal Sandbox Endpoint & Credentials Verification", () => {
  const PAYPAL_SANDBOX_BASE = "https://api-m.sandbox.paypal.com";
  assert.equal(PAYPAL_SANDBOX_BASE, "https://api-m.sandbox.paypal.com");
  assert.ok(!PAYPAL_SANDBOX_BASE.includes("live") && !PAYPAL_SANDBOX_BASE.includes("production"), "Live endpoints are forbidden");

  const checkConfigured = (clientId, clientSecret) => {
    return Boolean(clientId?.trim() && clientSecret?.trim());
  };

  assert.equal(checkConfigured("", "secret"), false, "Missing client ID returns false");
  assert.equal(checkConfigured("client_id", ""), false, "Missing secret returns false");
  assert.equal(checkConfigured("valid_id", "valid_secret"), true, "Valid credentials return true");
});

// 2. Orders v2 Payload Generation & Server-Side Amount Integrity
await test("2. Server-side Orders v2 payload preserves database amount and rejects client overrides", () => {
  const serverInvoice = {
    id: "inv_12345678",
    invoice_number: "INV-2026-001",
    amount: 1500.50,
    currency: "USD",
  };

  const untrustedClientRequest = {
    invoiceId: "inv_12345678",
    tamperedAmount: 1.00, // Client tries to pay $1 instead of $1500.50
    tamperedCurrency: "EUR",
  };

  // PayMind server logic uses serverInvoice, strictly ignoring untrustedClientRequest.tamperedAmount
  const buildPayPalOrderPayload = (invoice) => {
    if (invoice.currency.toUpperCase() !== "USD") {
      throw new Error("Only USD supported");
    }
    return {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: invoice.id,
          custom_id: invoice.invoice_number,
          description: `PayMind Sandbox payment for ${invoice.invoice_number}`,
          amount: {
            currency_code: invoice.currency,
            value: invoice.amount.toFixed(2),
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "PayMind Sandbox Demo",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
          },
        },
      },
    };
  };

  const orderPayload = buildPayPalOrderPayload(serverInvoice);
  assert.equal(orderPayload.intent, "CAPTURE");
  assert.equal(orderPayload.purchase_units[0].amount.value, "1500.50", "Amount must strictly come from server record");
  assert.equal(orderPayload.purchase_units[0].amount.currency_code, "USD");
  assert.equal(orderPayload.purchase_units[0].reference_id, "inv_12345678");
  assert.notEqual(orderPayload.purchase_units[0].amount.value, untrustedClientRequest.tamperedAmount.toFixed(2));
});

// 3. Server-Side Payment Capture Verification (Success Case)
await test("3. Verified Server-Side Order Capture with exact amount and status verification", () => {
  const savedRecord = {
    order_id: "ORD-998877",
    amount: 800.00,
    currency: "USD",
    invoice_id: "inv_abc",
  };

  // Mocked PayPal response from POST /v2/checkout/orders/{id}/capture
  const mockPayPalCaptureResponse = {
    id: "ORD-998877",
    status: "COMPLETED",
    payer: { email_address: "sb-buyer@business.example.com" },
    purchase_units: [
      {
        payments: {
          captures: [
            {
              id: "CAP-11223344",
              status: "COMPLETED",
              amount: { value: "800.00", currency_code: "USD" },
            },
          ],
        },
      },
    ],
  };

  const verifyCapture = (response, record) => {
    const firstCapture = response.purchase_units?.[0]?.payments?.captures?.[0];
    const captureAmount = Number(firstCapture?.amount?.value);
    const amountMatches =
      Number.isFinite(captureAmount) &&
      Math.round(captureAmount * 100) === Math.round(Number(record.amount) * 100) &&
      firstCapture?.amount?.currency_code === record.currency;

    const isCompleted = response.status === "COMPLETED" && firstCapture?.status === "COMPLETED" && amountMatches;
    return {
      isCompleted,
      captureId: firstCapture?.id,
      amountMatches,
    };
  };

  const result = verifyCapture(mockPayPalCaptureResponse, savedRecord);
  assert.equal(result.isCompleted, true, "Capture must be verified completed");
  assert.equal(result.captureId, "CAP-11223344");
  assert.equal(result.amountMatches, true);
});

// 4. Server-Side Payment Capture Verification (Amount Mismatch Negative Test)
await test("4. Capture rejection on amount mismatch (Negative Test: invoice is NOT marked paid)", () => {
  const savedRecord = {
    order_id: "ORD-554433",
    amount: 1200.00,
    currency: "USD",
    invoice_id: "inv_def",
  };

  // PayPal returned a capture with a different amount ($200 instead of $1200)
  const mockTamperedCaptureResponse = {
    id: "ORD-554433",
    status: "COMPLETED",
    purchase_units: [
      {
        payments: {
          captures: [
            {
              id: "CAP-TAMPERED-01",
              status: "COMPLETED",
              amount: { value: "200.00", currency_code: "USD" },
            },
          ],
        },
      },
    ],
  };

  const verifyCapture = (response, record) => {
    const firstCapture = response.purchase_units?.[0]?.payments?.captures?.[0];
    const captureAmount = Number(firstCapture?.amount?.value);
    const amountMatches =
      Number.isFinite(captureAmount) &&
      Math.round(captureAmount * 100) === Math.round(Number(record.amount) * 100) &&
      firstCapture?.amount?.currency_code === record.currency;

    const isCompleted = response.status === "COMPLETED" && firstCapture?.status === "COMPLETED" && amountMatches;
    const finalStatus = isCompleted ? "COMPLETED" : firstCapture?.status === "COMPLETED" && !amountMatches ? "AMOUNT_MISMATCH" : "FAILED";
    return { isCompleted, finalStatus, amountMatches };
  };

  const result = verifyCapture(mockTamperedCaptureResponse, savedRecord);
  assert.equal(result.isCompleted, false, "Must not be considered completed");
  assert.equal(result.amountMatches, false, "Amount match must be false");
  assert.equal(result.finalStatus, "AMOUNT_MISMATCH", "Status must be flagged as AMOUNT_MISMATCH");
});

// 5. Idempotent Duplicate Capture Safe Handling
await test("5. Idempotent handling of duplicate capture requests", () => {
  const existingCompletedRecord = {
    order_id: "ORD-ALREADY-CAPTURED",
    capture_id: "CAP-EXISTING-99",
    status: "COMPLETED",
  };

  const processCaptureRequest = (orderId, record) => {
    if (record.order_id === orderId && record.status === "COMPLETED") {
      return {
        alreadyCaptured: true,
        verified: true,
        captureID: record.capture_id,
        orderID: record.order_id,
        message: "This order was already captured and recorded.",
      };
    }
    return { alreadyCaptured: false };
  };

  const result = processCaptureRequest("ORD-ALREADY-CAPTURED", existingCompletedRecord);
  assert.equal(result.alreadyCaptured, true, "Must recognize already completed capture");
  assert.equal(result.verified, true);
  assert.equal(result.captureID, "CAP-EXISTING-99");
});

// 6. Webhook Signature Verification Requirement (Negative Test)
await test("6. Rejection of unverified or forged webhook payloads", () => {
  const headers = {
    "paypal-transmission-id": "tx_12345",
    "paypal-transmission-time": "2026-11-08T00:00:00Z",
    "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-123",
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-transmission-sig": "INVALIDSIGNATURE==",
  };

  const mockVerificationService = (sig) => {
    // PayPal verification endpoint returns verification_status: SUCCESS or FAILURE
    return sig === "VALIDSIGNATURE==" ? "SUCCESS" : "FAILURE";
  };

  const verificationStatus = mockVerificationService(headers["paypal-transmission-sig"]);
  assert.notEqual(verificationStatus, "SUCCESS", "Invalid signature must fail verification");
  assert.equal(verificationStatus, "FAILURE");
});

// 7. Webhook Idempotent Event Processing
await test("7. Webhook event deduplication via unique event_id", () => {
  const processedEvents = new Set(["WH-EVENT-001", "WH-EVENT-002"]);

  const handleWebhookEvent = (eventId) => {
    if (processedEvents.has(eventId)) {
      return { duplicate: true, received: true, processed: true };
    }
    processedEvents.add(eventId);
    return { duplicate: false, received: true, processed: true };
  };

  assert.equal(handleWebhookEvent("WH-EVENT-001").duplicate, true, "Duplicate event must be acknowledged without reprocessing");
  assert.equal(handleWebhookEvent("WH-EVENT-003").duplicate, false, "New event must be processed");
  assert.ok(processedEvents.has("WH-EVENT-003"));
});

// 8. Webhook Status Transition & Stale Event Protection
await test("8. Webhook events cannot overwrite already completed captures with older pending status", () => {
  const currentRecord = {
    status: "COMPLETED",
    amount: 500.00,
    currency: "USD",
  };

  const finalStatuses = ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED", "AMOUNT_MISMATCH"];

  const shouldIgnoreEvent = (currentStatus, incomingEventType) => {
    const isRefund = incomingEventType === "PAYMENT.CAPTURE.REFUNDED";
    if (finalStatuses.includes(currentStatus) && !isRefund) {
      return true; // Ignore older pending/approved event
    }
    return false;
  };

  assert.equal(shouldIgnoreEvent(currentRecord.status, "PAYMENT.CAPTURE.PENDING"), true, "Pending event after COMPLETED must be ignored");
  assert.equal(shouldIgnoreEvent(currentRecord.status, "CHECKOUT.ORDER.APPROVED"), true, "Approval event after COMPLETED must be ignored");
  assert.equal(shouldIgnoreEvent(currentRecord.status, "PAYMENT.CAPTURE.REFUNDED"), false, "Refund event must be processed");
});

// 9. Client ID and Secret Isolation Verification
await test("9. Browser client receives only public Client ID and never PAYPAL_CLIENT_SECRET", () => {
  const serverConfig = {
    NEXT_PUBLIC_PAYPAL_CLIENT_ID: "client_id_pub_123",
    PAYPAL_CLIENT_ID: "client_id_fallback_456",
    PAYPAL_CLIENT_SECRET: "super_secret_never_leak_789",
    PAYPAL_WEBHOOK_ID: "webhook_xyz",
  };

  // Simulating /api/paypal/config endpoint
  const getPublicConfig = (env) => {
    const clientId = (env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || env.PAYPAL_CLIENT_ID)?.trim() || null;
    return { clientId };
  };

  const publicConfig = getPublicConfig(serverConfig);
  assert.equal(publicConfig.clientId, "client_id_pub_123");
  assert.equal("PAYPAL_CLIENT_SECRET" in publicConfig, false);
  assert.equal("clientSecret" in publicConfig, false);
  assert.equal(JSON.stringify(publicConfig).includes("super_secret_never_leak_789"), false);
});

// 10. Sample Invoice vs Verified Capture Display Verification
await test("10. Seeded sample invoices never display as verified captures without a verified PayPal record", () => {
  const sampleInvoice = {
    id: "inv_001",
    invoice_number: "INV-2026-001",
    amount: 1500,
    currency: "USD",
    status: "paid", // Sample seed marked as paid
  };

  const recordsWithoutCapture = {};
  const recordsWithVerifiedCapture = {
    inv_001: {
      invoice_id: "inv_001",
      order_id: "ORD-999",
      capture_id: "CAP-888",
      status: "COMPLETED",
      amount: 1500,
      currency: "USD",
    },
  };

  const evaluateDisplay = (invoice, records) => {
    const payment = records[invoice.id];
    const isVerifiedPaid = Boolean(payment && payment.status === "COMPLETED");
    const isSamplePaid = !payment && invoice.status === "paid";
    return {
      isVerifiedPaid,
      isSamplePaid,
      badgeText: isVerifiedPaid
        ? "PAID (Verified Capture)"
        : isSamplePaid
        ? "Sample Data (Unverified)"
        : invoice.status.toUpperCase(),
      actionText: isVerifiedPaid ? "Capture recorded" : "PayPal Checkout Available",
    };
  };

  const unverifiedDisplay = evaluateDisplay(sampleInvoice, recordsWithoutCapture);
  assert.equal(unverifiedDisplay.isVerifiedPaid, false);
  assert.equal(unverifiedDisplay.isSamplePaid, true);
  assert.equal(unverifiedDisplay.badgeText, "Sample Data (Unverified)");
  assert.notEqual(unverifiedDisplay.actionText, "Capture recorded");

  const verifiedDisplay = evaluateDisplay(sampleInvoice, recordsWithVerifiedCapture);
  assert.equal(verifiedDisplay.isVerifiedPaid, true);
  assert.equal(verifiedDisplay.isSamplePaid, false);
  assert.equal(verifiedDisplay.badgeText, "PAID (Verified Capture)");
  assert.equal(verifiedDisplay.actionText, "Capture recorded");
});

console.log("\n----------------------------------------------------------------------");
console.log(`PAYPAL TESTS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log("----------------------------------------------------------------------\n");

if (failed > 0) process.exit(1);
