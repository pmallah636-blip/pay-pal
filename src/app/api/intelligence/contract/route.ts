import { NextResponse } from "next/server";
import { ContractRequestSchema } from "@/lib/paymind/intelligence/schemas";
import { analyzeContract } from "@/lib/paymind/intelligence/contract-analysis";
import { getIntelligenceAccess } from "@/lib/paymind/intelligence/dev-only";

export const maxDuration = 45;

export async function POST(request: Request) {
  const access = await getIntelligenceAccess();
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  try {
    const body: unknown = await request.json();
    const parsed = ContractRequestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    const result = await analyzeContract(parsed.data.contractText, parsed.data.projectType);
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Contract analysis failed. Check the server AI configuration and try again." }, { status: 500 });
  }
}
