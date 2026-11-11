import { NextResponse } from "next/server";
import { getPayPalAccessToken } from "@/lib/paypal/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  resource_type?: string;
  summary?: string;
  resource?: {
    id?: string;
    status?: string;
    amount?: { value?: string; currency_code?: string };
    supplementary_data?: { related_ids?: { order_id?: string; capture_id?: string } };
    payer?: { email_address?: string };
  };
};
type VerificationResponse = { verification_status?: string };

const noStore = { headers: { "Cache-Control": "no-store" } };
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);

export async function POST(request: Request) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  const admin = createSupabaseAdminClient();
  if (!webhookId) return NextResponse.json({ error: "PAYPAL_WEBHOOK_ID is not configured." }, { status: 503, ...noStore });
  if (!admin) return NextResponse.json({ error: "Webhook persistence is not configured. Set SUPABASE_SERVICE_ROLE_KEY." }, { status: 503, ...noStore });

  try {
    const event = (await request.json()) as PayPalWebhookEvent;
    const header = (name: string) => request.headers.get(name);
    const transmissionId = header("paypal-transmission-id");
    const transmissionTime = header("paypal-transmission-time");
    const certUrl = header("paypal-cert-url");
    const authAlgo = header("paypal-auth-algo");
    const transmissionSig = header("paypal-transmission-sig");

    if (!event.id || !event.event_type || !transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
      return NextResponse.json({ error: "Webhook event or PayPal transmission headers are incomplete." }, { status: 400, ...noStore });
    }

    // Never trust a webhook payload until PayPal verifies its signed transmission.
    const accessToken = await getPayPalAccessToken();
    const verificationResponse = await fetch("https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: event,
      }),
      cache: "no-store",
    });
    const verification = (await verificationResponse.json().catch(() => ({}))) as VerificationResponse;
    if (!verificationResponse.ok || verification.verification_status !== "SUCCESS") {
      return NextResponse.json({ error: "PayPal webhook signature verification failed." }, { status: 400, ...noStore });
    }

    // Persist the verified event before applying it. Unique event_id makes retries idempotent.
    const { error: insertError } = await admin.from("paypal_webhook_events").insert({
      event_id: event.id,
      event_type: event.event_type,
      resource_type: event.resource_type ?? "unknown",
      summary: event.summary ?? event.event_type,
      payload: event,
      verified: true,
      processed: false,
    });
    if (insertError) {
      if (insertError.code !== "23505") {
        return NextResponse.json({ error: "The signature was verified, but PayMind could not persist the webhook event." }, { status: 503, ...noStore });
      }
      const { data: previous, error: previousError } = await admin
        .from("paypal_webhook_events")
        .select("processed")
        .eq("event_id", event.id)
        .maybeSingle();
      if (previousError) throw previousError;
      if (previous?.processed) return NextResponse.json({ received: true, verified: true, duplicate: true, processed: true }, noStore);
      // A previously persisted but unprocessed event is resumed below.
    }

    const eventType = event.event_type;
    const resource = event.resource ?? {};
    let orderId = resource.supplementary_data?.related_ids?.order_id
      ?? (eventType.startsWith("CHECKOUT.ORDER.") ? resource.id : undefined);

    if (!orderId && eventType.startsWith("PAYMENT.CAPTURE.")) {
      const relatedCaptureId = resource.supplementary_data?.related_ids?.capture_id ?? resource.id;
      if (relatedCaptureId) {
        const { data: linkedPayment, error: linkedPaymentError } = await admin
          .from("paypal_payment_records")
          .select("order_id")
          .eq("capture_id", relatedCaptureId)
          .maybeSingle();
        if (linkedPaymentError) throw linkedPaymentError;
        orderId = linkedPayment?.order_id;
      }
    }

    if (!orderId) {
      return NextResponse.json({ error: "The verified event has no mapped PayMind order yet; PayPal may retry this delivery." }, { status: 503, ...noStore });
    }

    const { data: payment, error: paymentError } = await admin
      .from("paypal_payment_records")
      .select("id, invoice_id, milestone_id, amount, currency, status, capture_id")
      .eq("order_id", orderId)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) {
      return NextResponse.json({ error: "The verified event has no saved PayMind order mapping. PayPal may retry this delivery." }, { status: 503, ...noStore });
    }

    const statusByEvent: Record<string, string> = {
      "CHECKOUT.ORDER.APPROVED": "APPROVED",
      "PAYMENT.CAPTURE.PENDING": "PENDING",
      "PAYMENT.CAPTURE.DENIED": "DENIED",
      "PAYMENT.CAPTURE.COMPLETED": "COMPLETED",
    };
    let mappedStatus = statusByEvent[eventType];
    const isRefundEvent = eventType === "PAYMENT.CAPTURE.REFUNDED";
    const isCompletedCapture = eventType === "PAYMENT.CAPTURE.COMPLETED";

    if (isRefundEvent) {
      const refundAmount = Number(resource.amount?.value);
      const refundCurrency = resource.amount?.currency_code;
      if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundCurrency !== payment.currency) {
        mappedStatus = "REFUND_AMOUNT_UNKNOWN";
      } else {
        // Only label the invoice fully refunded when this event itself matches the
        // original amount. Partial refunds are recorded without incorrectly changing
        // the invoice to fully refunded.
        mappedStatus = Math.round(refundAmount * 100) === Math.round(Number(payment.amount) * 100)
          ? "REFUNDED"
          : "PARTIALLY_REFUNDED";
      }
    }

    if (!mappedStatus) {
      const { error: ignoredError } = await admin.from("paypal_webhook_events").update({ processed: true }).eq("event_id", event.id);
      if (ignoredError) throw ignoredError;
      return NextResponse.json({ received: true, verified: true, persisted: true, processed: true, ignored: true }, noStore);
    }

    // Older approval/pending/denied events cannot overwrite an already completed payment.
    const finalStatuses = ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED", "AMOUNT_MISMATCH"];
    if (finalStatuses.includes(payment.status) && !isRefundEvent) {
      const { error: staleError } = await admin.from("paypal_webhook_events").update({ processed: true }).eq("event_id", event.id);
      if (staleError) throw staleError;
      return NextResponse.json({ received: true, verified: true, persisted: true, processed: true, ignored: true, reason: "A later payment state is already recorded." }, noStore);
    }

    if (isCompletedCapture) {
      const amount = Number(resource.amount?.value);
      const amountMatches = Number.isFinite(amount)
        && Math.round(amount * 100) === Math.round(Number(payment.amount) * 100)
        && resource.amount?.currency_code === payment.currency;
      if (!amountMatches) {
        const { error: mismatchError } = await admin.from("paypal_payment_records").update({
          status: "AMOUNT_MISMATCH",
          capture_id: resource.id ?? null,
          capture_status: resource.status ?? "UNKNOWN",
          last_event_id: event.id,
          updated_at: new Date().toISOString(),
        }).eq("order_id", orderId);
        if (mismatchError) throw mismatchError;
        const { error: mismatchEventError } = await admin.from("paypal_webhook_events").update({ processed: true }).eq("event_id", event.id);
        if (mismatchEventError) throw mismatchEventError;
        return NextResponse.json({ received: true, verified: true, persisted: true, processed: true, mismatch: true, reason: "Capture amount/currency did not match the saved invoice. Invoice remains unpaid." }, noStore);
      }
    }

    const update: Record<string, unknown> = {
      status: mappedStatus,
      updated_at: new Date().toISOString(),
      last_event_id: event.id,
    };
    if (eventType.startsWith("CHECKOUT.ORDER.")) update.order_status = resource.status ?? mappedStatus;
    if (eventType.startsWith("PAYMENT.CAPTURE.") && !isRefundEvent) {
      update.capture_id = resource.id ?? null;
      update.capture_status = resource.status ?? mappedStatus;
      update.payer_email = resource.payer?.email_address ?? null;
    }
    if (isRefundEvent) update.capture_status = "REFUNDED";

    const { error: paymentUpdateError } = await admin.from("paypal_payment_records").update(update).eq("order_id", orderId);
    if (paymentUpdateError) throw paymentUpdateError;

    if (mappedStatus === "COMPLETED" || mappedStatus === "REFUNDED") {
      if (isUuid(payment.invoice_id)) {
        const invoiceStatus = mappedStatus === "REFUNDED" ? "refunded" : "paid";
        const invoiceUpdate: Record<string, unknown> = {
          status: invoiceStatus,
          paypal_order_id: orderId,
          paypal_capture_id: resource.supplementary_data?.related_ids?.capture_id ?? payment.capture_id ?? (isRefundEvent ? null : resource.id ?? null),
        };
        if (mappedStatus === "COMPLETED") invoiceUpdate.paid_at = new Date().toISOString();
        const { error: invoiceError } = await admin.from("invoices").update(invoiceUpdate).eq("id", payment.invoice_id);
        if (invoiceError) throw invoiceError;
      }
      if (payment.milestone_id && isUuid(payment.milestone_id)) {
        const milestoneUpdate: Record<string, unknown> = {
          paypal_status: mappedStatus,
          paypal_order_id: orderId,
          paypal_capture_id: resource.supplementary_data?.related_ids?.capture_id ?? payment.capture_id ?? (isRefundEvent ? null : resource.id ?? null),
        };
        if (mappedStatus === "COMPLETED") milestoneUpdate.status = "paid";
        const { error: milestoneError } = await admin.from("milestones").update(milestoneUpdate).eq("id", payment.milestone_id);
        if (milestoneError) throw milestoneError;
      }
    }

    const { error: processedError } = await admin.from("paypal_webhook_events").update({ processed: true }).eq("event_id", event.id);
    if (processedError) throw processedError;

    return NextResponse.json({ received: true, verified: true, persisted: true, processed: true, eventId: event.id, eventType, orderId, status: mappedStatus }, noStore);
  } catch (error) {
    // A non-2xx response asks PayPal to retry when persistence/processing failed.
    const message = error instanceof Error ? error.message : "Could not verify or persist this PayPal webhook.";
    return NextResponse.json({ error: message }, { status: 500, ...noStore });
  }
}
