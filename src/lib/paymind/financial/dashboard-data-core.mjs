/**
 * Pure financial dashboard data transformations (Node-testable, no TS/runtime deps).
 * Keep behavior aligned with dashboard-data.ts types.
 */

function money(value) {
  const n = typeof value === "string" ? Number(value) : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function buildFinancialDashboardRows(input) {
  const paymentsByInvoice = new Map((input.payments ?? []).map((p) => [p.invoice_id, p]));
  const projectsById = new Map((input.projects ?? []).map((p) => [p.id, p]));
  return (input.invoices ?? []).map((inv) => {
    const payment = paymentsByInvoice.get(inv.id);
    const project = inv.project_id ? projectsById.get(inv.project_id) : undefined;
    const paymentStatus = String(payment?.status ?? payment?.capture_status ?? "").toUpperCase();
    const isVerified = paymentStatus === "COMPLETED" && Boolean(payment?.capture_id);
    const verificationState = isVerified
      ? "VERIFIED_CAPTURE"
      : payment
        ? "PAYPAL_RECORDED_UNVERIFIED"
        : input.dataSource === "seeded_demo"
          ? "SEEDED_DEMO"
          : "NO_PAYPAL_RECORD";
    return {
      record_id: inv.id,
      project_name: project?.title ?? "Project",
      client_name: project?.client_name ?? "Client",
      invoice_number: inv.invoice_number,
      currency: String(inv.currency || "USD").toUpperCase(),
      amount: money(inv.amount),
      due_date: inv.due_date,
      paid_at: inv.paid_at ?? null,
      invoice_status: String(inv.status || "unknown"),
      payment_status: paymentStatus || "NONE",
      verification_state: verificationState,
      capture_id: payment?.capture_id ?? null,
      order_id: payment?.order_id ?? null,
      is_verified_capture: isVerified,
      data_source: input.dataSource,
    };
  });
}

export function summarizeFinancialRows(rows) {
  const list = rows ?? [];
  const verified = list.filter((r) => r.is_verified_capture);
  const pending = list.filter((r) => !r.is_verified_capture && !["paid", "cancelled"].includes(r.invoice_status));
  const sumByCurrency = (items) => items.reduce((acc, r) => {
    const c = r.currency || "USD";
    acc[c] = (acc[c] ?? 0) + (Number.isFinite(r.amount) ? r.amount : 0);
    return acc;
  }, {});
  return {
    total_records: list.length,
    verified_capture_count: verified.length,
    pending_count: pending.length,
    total_amount_by_currency: sumByCurrency(list),
    verified_amount_by_currency: sumByCurrency(verified),
    data_sources: Array.from(new Set(list.map((r) => r.data_source))),
  };
}

export function toAgStudioFinancialData(rows) {
  return {
    sources: [
      {
        id: "financial_records",
        name: "Financial Records",
        description:
          "PayMind invoice and PayPal payment records. verification_state and is_verified_capture distinguish seeded/demo or unverified records from server-verified PayPal captures. Never treat a record as completed unless is_verified_capture is true.",
        data: (rows ?? []).map((r) => ({ ...r })),
      },
    ],
  };
}
