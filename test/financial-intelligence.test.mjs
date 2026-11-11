import assert from "node:assert/strict";
import {
  buildFinancialDashboardRows,
  summarizeFinancialRows,
  toAgStudioFinancialData,
} from "../src/lib/paymind/financial/dashboard-data-core.mjs";

console.log("=== FINANCIAL INTELLIGENCE / AG STUDIO DATA TESTS ===\n");
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log("PASS: " + name);
    passed++;
  } catch (e) {
    console.error("FAIL: " + name);
    console.error(e);
    failed++;
  }
}

await test("buildFinancialDashboardRows marks verified capture only with COMPLETED capture_id", () => {
  const rows = buildFinancialDashboardRows({
    dataSource: "supabase",
    projects: [{ id: "p1", title: "Proj", client_name: "Acme" }],
    invoices: [{ id: "i1", project_id: "p1", invoice_number: "INV-1", amount: 100, currency: "usd", status: "sent", due_date: "2026-01-01" }],
    payments: [{ invoice_id: "i1", capture_id: "CAP1", order_id: "ORD1", status: "COMPLETED" }],
  });
  assert.equal(rows[0].is_verified_capture, true);
  assert.equal(rows[0].verification_state, "VERIFIED_CAPTURE");
  assert.equal(rows[0].currency, "USD");
});

await test("buildFinancialDashboardRows never marks seeded/demo invoice paid without capture", () => {
  const rows = buildFinancialDashboardRows({
    dataSource: "seeded_demo",
    invoices: [{ id: "i2", invoice_number: "INV-2", amount: "50.5", currency: "USD", status: "paid", due_date: "2026-01-02", paid_at: "2026-01-03" }],
  });
  assert.equal(rows[0].is_verified_capture, false);
  assert.equal(rows[0].verification_state, "SEEDED_DEMO");
  assert.equal(rows[0].amount, 50.5);
});

await test("buildFinancialDashboardRows labels recorded-but-unverified PayPal status", () => {
  const rows = buildFinancialDashboardRows({
    dataSource: "supabase",
    invoices: [{ id: "i3", invoice_number: "INV-3", amount: 10, currency: "USD", status: "sent", due_date: "2026-01-02" }],
    payments: [{ invoice_id: "i3", order_id: "ORD3", status: "APPROVED" }],
  });
  assert.equal(rows[0].is_verified_capture, false);
  assert.equal(rows[0].verification_state, "PAYPAL_RECORDED_UNVERIFIED");
});

await test("summarizeFinancialRows separates verified and pending amounts by currency", () => {
  const rows = [
    { record_id: "1", project_name: "P", client_name: "C", invoice_number: "A", currency: "USD", amount: 100, due_date: "", paid_at: null, invoice_status: "sent", payment_status: "COMPLETED", verification_state: "VERIFIED_CAPTURE", capture_id: "c", order_id: "o", is_verified_capture: true, data_source: "supabase" },
    { record_id: "2", project_name: "P", client_name: "C", invoice_number: "B", currency: "USD", amount: 40, due_date: "", paid_at: null, invoice_status: "sent", payment_status: "NONE", verification_state: "NO_PAYPAL_RECORD", capture_id: null, order_id: null, is_verified_capture: false, data_source: "supabase" },
  ];
  const s = summarizeFinancialRows(rows);
  assert.equal(s.verified_capture_count, 1);
  assert.equal(s.pending_count, 1);
  assert.equal(s.verified_amount_by_currency.USD, 100);
  assert.equal(s.total_amount_by_currency.USD, 140);
});

await test("toAgStudioFinancialData produces financial_records source with AG Studio-compatible shape", () => {
  const out = toAgStudioFinancialData([{ record_id: "1", project_name: "P", client_name: "C", invoice_number: "A", currency: "USD", amount: 1, due_date: "", paid_at: null, invoice_status: "draft", payment_status: "NONE", verification_state: "NO_PAYPAL_RECORD", capture_id: null, order_id: null, is_verified_capture: false, data_source: "supabase" }]);
  assert.equal(out.sources.length, 1);
  assert.equal(out.sources[0].id, "financial_records");
  assert.equal(Array.isArray(out.sources[0].data), true);
  assert.equal(out.sources[0].data[0].record_id, "1");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
