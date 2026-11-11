import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const demoEnabled = process.env.NODE_ENV !== "production" && process.env.PAYMIND_DEMO_MODE === "true";
  const serverSupabase = await createSupabaseServerClient();
  const { data: { user } } = serverSupabase ? await serverSupabase.auth.getUser() : { data: { user: null } };
  if (!user && !demoEnabled) return NextResponse.json({ error: "Sign in to view your payment records." }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Payment persistence is not configured." }, { status: 503 });

  const url = new URL(request.url);
  const invoiceIds = (url.searchParams.get("invoiceIds") ?? "").split(",").filter(Boolean).slice(0, 30);
  if (!invoiceIds.length) return NextResponse.json({ records: [] });

  let query = admin.from("paypal_payment_records")
    .select("invoice_id, order_id, capture_id, amount, currency, status, order_status, capture_status, updated_at")
    .in("invoice_id", invoiceIds)
    .order("created_at", { ascending: false });
  query = user ? query.eq("owner_id", user.id) : query.is("owner_id", null);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Could not load persisted payment records." }, { status: 503 });

  // Keep the newest record for each invoice.
  const latest = new Map<string, (typeof data)[number]>();
  for (const row of data ?? []) if (!latest.has(row.invoice_id)) latest.set(row.invoice_id, row);
  return NextResponse.json({ records: [...latest.values()] }, { headers: { "Cache-Control": "no-store" } });
}
