import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { paypalRequest } from "@/lib/paypal/server";

const RequestSchema = z.object({ orderID: z.string().trim().min(5).max(100).regex(/^[A-Za-z0-9-]+$/) });
type CaptureResponse = {
  id?: string;
  status?: string;
  payer?: { email_address?: string };
  purchase_units?: Array<{ payments?: { captures?: Array<{ id?: string; status?: string; amount?: { value?: string; currency_code?: string } }> } }>;
};
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "A valid PayPal orderID is required." }, { status: 400 });

    const demoEnabled = process.env.NODE_ENV !== "production" && process.env.PAYMIND_DEMO_MODE === "true";
    const serverSupabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = serverSupabase
      ? await serverSupabase.auth.getUser()
      : { data: { user: null }, error: null };
    if (authError) return NextResponse.json({ error: "Your sign-in session could not be verified. Sign in again." }, { status: 401 });
    if (!user && !demoEnabled) return NextResponse.json({ error: "Sign in before capturing this order." }, { status: 401 });

    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Payment persistence is unavailable. Configure the Supabase service-role key." }, { status: 503 });

    const { data: record, error: recordError } = await admin
      .from("paypal_payment_records")
      .select("id, owner_id, invoice_id, milestone_id, invoice_number, order_id, capture_id, amount, currency, status")
      .eq("order_id", parsed.data.orderID)
      .maybeSingle();
    if (recordError) return NextResponse.json({ error: "PayMind could not read the saved order record." }, { status: 503 });
    if (!record) return NextResponse.json({ error: "PayMind could not find the saved order record." }, { status: 404 });
    const isOwner = record.owner_id !== null && user?.id === record.owner_id;
    const isLocalDemoOrder = record.owner_id === null && !user && demoEnabled;
    if (!isOwner && !isLocalDemoOrder) {
      return NextResponse.json({ error: "You are not authorized to capture this order." }, { status: 403 });
    }
    if (record.status === "COMPLETED") {
      if (isUuid(record.invoice_id)) {
        const paidAt = new Date().toISOString();
        const { error: invoiceSyncError } = await admin.from("invoices").update({ status: "paid", paid_at: paidAt, paypal_order_id: record.order_id, paypal_capture_id: record.capture_id }).eq("id", record.invoice_id);
        if (invoiceSyncError) return NextResponse.json({ error: "The completed capture is saved, but the invoice status could not be synchronized. Retry after checking Supabase." }, { status: 503 });
        if (record.milestone_id && isUuid(record.milestone_id)) {
          const { error: milestoneSyncError } = await admin.from("milestones").update({ status: "paid", paypal_status: "COMPLETED", paypal_order_id: record.order_id, paypal_capture_id: record.capture_id }).eq("id", record.milestone_id);
          if (milestoneSyncError) return NextResponse.json({ error: "The completed capture is saved, but the milestone status could not be synchronized." }, { status: 503 });
        }
      }
      return NextResponse.json({ orderID: record.order_id, captureID: record.capture_id, captureStatus: "COMPLETED", verified: true, alreadyCaptured: true, message: "This order was already captured and recorded." }, { headers: { "Cache-Control": "no-store" } });
    }

    const capture = await paypalRequest<CaptureResponse>(`/v2/checkout/orders/${encodeURIComponent(parsed.data.orderID)}/capture`, {
      method: "POST",
      headers: { "PayPal-Request-Id": `paymind-capture-${parsed.data.orderID}` },
      body: JSON.stringify({}),
    });
    const firstCapture = capture.purchase_units?.[0]?.payments?.captures?.[0];
    const captureAmount = Number(firstCapture?.amount?.value);
    const amountMatches = Number.isFinite(captureAmount)
      && Math.round(captureAmount * 100) === Math.round(Number(record.amount) * 100)
      && firstCapture?.amount?.currency_code === record.currency;
    const isCompleted = capture.status === "COMPLETED" && firstCapture?.status === "COMPLETED" && amountMatches;

    const { error: updateError } = await admin.from("paypal_payment_records").update({
      capture_id: firstCapture?.id ?? null,
      status: isCompleted ? "COMPLETED" : firstCapture?.status === "COMPLETED" && !amountMatches ? "AMOUNT_MISMATCH" : firstCapture?.status ?? "UNKNOWN",
      order_status: capture.status ?? null,
      capture_status: firstCapture?.status ?? "UNKNOWN",
      payer_email: capture.payer?.email_address ?? null,
      raw_capture: capture,
      updated_at: new Date().toISOString(),
    }).eq("order_id", parsed.data.orderID);
    if (updateError) {
      return NextResponse.json({ error: "PayPal returned a capture response, but PayMind could not persist it. Check Supabase connectivity before treating the ledger as updated." }, { status: 503 });
    }

    if (isCompleted && isUuid(record.invoice_id)) {
      const paidAt = new Date().toISOString();
      const { error: invoiceUpdateError } = await admin.from("invoices").update({
        status: "paid", paid_at: paidAt, paypal_order_id: parsed.data.orderID, paypal_capture_id: firstCapture?.id ?? null,
      }).eq("id", record.invoice_id);
      if (invoiceUpdateError) {
        return NextResponse.json({ error: "The capture was saved, but the invoice status update failed. Review the PayPal payment record in Supabase." }, { status: 503 });
      }
      if (record.milestone_id && isUuid(record.milestone_id)) {
        const { error: milestoneUpdateError } = await admin.from("milestones").update({ status: "paid", paypal_status: "COMPLETED", paypal_order_id: parsed.data.orderID, paypal_capture_id: firstCapture?.id ?? null }).eq("id", record.milestone_id);
        if (milestoneUpdateError) return NextResponse.json({ error: "The capture is saved, but the milestone status update failed. Retry after checking Supabase." }, { status: 503 });
      }
    }

    return NextResponse.json({
      orderID: capture.id ?? record.order_id,
      orderStatus: capture.status,
      captureID: firstCapture?.id ?? null,
      captureStatus: firstCapture?.status ?? "UNKNOWN",
      amount: firstCapture?.amount ?? null,
      verified: isCompleted,
      message: isCompleted
        ? "PayPal reports COMPLETED and the amount/currency match the saved invoice. PayMind saved the capture record."
        : !amountMatches
          ? "PayPal returned a capture, but its amount or currency does not match the saved invoice. The invoice was not marked paid."
          : "PayPal returned a capture response, but it is not marked COMPLETED.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not capture the PayPal Sandbox order.";
    return NextResponse.json({ error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
