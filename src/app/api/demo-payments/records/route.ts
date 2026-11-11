
import { NextResponse } from "next/server";
import { MOCK_INVOICES } from "@/lib/supabase/mock-data";
import { getDemoPaymentRecords } from "@/lib/demo-payments/store";

export async function GET(request: Request) {
  const demoEnabled =
    process.env.NODE_ENV !== "production" &&
    process.env.PAYMIND_DEMO_MODE === "true";

  if (!demoEnabled) {
    return NextResponse.json(
      { error: "Demo payments are only available in local development." },
      { status: 403 }
    );
  }

  const url = new URL(request.url);

  const requestedIds = (url.searchParams.get("invoiceIds") ?? "")
    .split(",")
    .filter(Boolean)
    .slice(0, 30);

  const mockInvoiceIds = new Set(MOCK_INVOICES.map((invoice) => invoice.id));

  const invoiceIds = requestedIds.filter((id) => mockInvoiceIds.has(id));

  if (!invoiceIds.length) {
    return NextResponse.json(
      { records: [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const records = await getDemoPaymentRecords(invoiceIds);

    return NextResponse.json(
      { records },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Could not load demo payment records." },
      { status: 500 }
    );
  }
}
