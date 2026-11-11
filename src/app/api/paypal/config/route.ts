import { NextResponse } from "next/server";

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET() {
  const clientId = (process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID)?.trim() || null;
  return NextResponse.json({ clientId }, noStore);
}
