import { NextResponse } from "next/server";
import { SimulationRequestSchema } from "@/lib/paymind/intelligence/schemas";
import { simulatePayments } from "@/lib/paymind/intelligence/simulator";
import { getIntelligenceAccess } from "@/lib/paymind/intelligence/dev-only";


export async function POST(request: Request) {
  const access = await getIntelligenceAccess();
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  try {
    const body: unknown = await request.json();
    const parsed = SimulationRequestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    return NextResponse.json(simulatePayments(parsed.data), { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not calculate the payment scenarios." }, { status: 500 });
  }
}
