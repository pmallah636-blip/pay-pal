import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { resolvePayPalActor } from "@/lib/paypal/actor";
import { paypalRequest } from "@/lib/paypal/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type CreateOrderResponse = { id?: string; status?: string };
const RequestSchema = z.object({ invoiceId: z.string().trim().min(1).max(80) });

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "A valid invoiceId is required." }, { status: 400 });

    const resolved = await resolvePayPalActor(parsed.data.invoiceId);
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    const { actor } = resolved;
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Payment persistence is not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server and apply migration 003 before creating an order." }, { status: 503 });
    }

    if (["paid", "cancelled", "refunded"].includes(actor.invoice.status.toLowerCase())) {
      return NextResponse.json({ error: "This invoice is not available for a new payment." }, { status: 409 });
    }
    if (actor.invoice.currency.toUpperCase() !== "USD") {
      return NextResponse.json({ error: "This PayPal Sandbox checkout currently supports USD invoices only." }, { status: 400 });
    }
    if (!Number.isFinite(actor.invoice.amount) || actor.invoice.amount <= 0) {
      return NextResponse.json({ error: "Invoice amount must be greater than zero." }, { status: 400 });
    }
    let activeOrdersQuery = admin.from("paypal_payment_records")
      .select("order_id, status")
      .eq("invoice_id", actor.invoice.id)
      .order("created_at", { ascending: false })
      .limit(1);
    activeOrdersQuery = actor.userId
      ? activeOrdersQuery.eq("owner_id", actor.userId)
      : activeOrdersQuery.is("owner_id", null);
    const { data: activeOrder, error: activeOrderError } = await activeOrdersQuery.maybeSingle();
    if (activeOrderError) return NextResponse.json({ error: "PayMind could not check for an existing open PayPal order." }, { status: 503 });
    if (activeOrder?.status === "PENDING") {
      return NextResponse.json({ error: "A previous capture is pending with PayPal. Wait for its webhook/ledger update before creating another payment." }, { status: 409 });
    }
    if (activeOrder && ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED", "AMOUNT_MISMATCH"].includes(activeOrder.status)) {
      return NextResponse.json({ error: activeOrder.status === "COMPLETED" ? "This invoice already has a completed PayPal capture." : activeOrder.status === "AMOUNT_MISMATCH" ? "A payment amount mismatch needs manual review before another payment can be attempted." : "This invoice has already been refunded or partially refunded. Review the payment record before attempting another charge." }, { status: 409 });
    }
    if (activeOrder && ["CREATED", "APPROVED"].includes(activeOrder.status)) {
      if (!actor.demo) {
        const { error: linkError } = await admin.from("invoices").update({ paypal_order_id: activeOrder.order_id }).eq("id", actor.invoice.id);
        if (linkError) return NextResponse.json({ error: "The existing PayPal order was found, but PayMind could not link it to the invoice." }, { status: 503 });
      }
      return NextResponse.json({ orderID: activeOrder.order_id, status: activeOrder.status, reused: true }, { headers: { "Cache-Control": "no-store" } });
    }

    const order = await paypalRequest<CreateOrderResponse>("/v2/checkout/orders", {
      method: "POST",
      headers: { "PayPal-Request-Id": `paymind-${randomUUID()}` },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: actor.invoice.id,
          custom_id: actor.invoice.invoice_number,
          description: `PayMind Sandbox payment for ${actor.invoice.invoice_number}`,
          amount: { currency_code: "USD", value: actor.invoice.amount.toFixed(2) },
        }],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: "PayMind Sandbox Demo",
              user_action: "PAY_NOW",
              shipping_preference: "NO_SHIPPING",
            },
          },
        },
      }),
    });

    if (!order.id) return NextResponse.json({ error: "PayPal did not return an order ID." }, { status: 502 });

    const { error: persistError } = await admin.from("paypal_payment_records").insert({
      owner_id: actor.userId,
      invoice_id: actor.invoice.id,
      milestone_id: actor.invoice.milestone_id,
      invoice_number: actor.invoice.invoice_number,
      order_id: order.id,
      amount: actor.invoice.amount,
      currency: actor.invoice.currency.toUpperCase(),
      status: "CREATED",
      order_status: order.status ?? "CREATED",
    });

    if (persistError) {
      return NextResponse.json({ error: "PayPal created the order, but PayMind could not save its payment record. Do not approve this order; check the database migration and try again." }, { status: 503 });
    }

    if (!actor.demo) {
      const { error: invoiceUpdateError } = await admin
        .from("invoices")
        .update({ paypal_order_id: order.id })
        .eq("id", actor.invoice.id);
      if (invoiceUpdateError) {
        return NextResponse.json({ error: "The order was saved, but PayMind could not link it to the invoice. Contact the project owner before approval." }, { status: 503 });
      }
    }

    return NextResponse.json({ orderID: order.id, status: order.status ?? "CREATED", invoiceNumber: actor.invoice.invoice_number }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the PayPal Sandbox order.";
    return NextResponse.json({ error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
