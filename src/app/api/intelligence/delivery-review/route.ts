import { NextResponse } from "next/server";
import { getIntelligenceAccess } from "@/lib/paymind/intelligence/dev-only";
import { reviewDelivery } from "@/lib/paymind/intelligence/delivery-review";

export const maxDuration = 45;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request) {
  const access = await getIntelligenceAccess();
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status, headers: NO_STORE_HEADERS });
  }

  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > 9 * 1024 * 1024) {
      return NextResponse.json({ error: "The request exceeds the 9 MB upload limit." }, { status: 413, headers: NO_STORE_HEADERS });
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a ZIP or supported text file to review." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const requirementsRaw = String(form.get("requirements") || "[]");
    let requirements: unknown;
    try { requirements = JSON.parse(requirementsRaw); }
    catch { return NextResponse.json({ error: "The delivery requirements are invalid." }, { status: 400, headers: NO_STORE_HEADERS }); }
    if (!Array.isArray(requirements) || requirements.length > 30 || requirements.some((item) => typeof item !== "string" || item.length > 500)) {
      return NextResponse.json({ error: "Provide up to 30 requirements, each no longer than 500 characters." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "The upload exceeds the 8 MB limit." }, { status: 413, headers: NO_STORE_HEADERS });
    }
    const result = await reviewDelivery({
      fileName: file.name,
      fileBytes: Buffer.from(await file.arrayBuffer()),
      requirements: requirements as string[],
      projectName: String(form.get("projectName") || "Project").slice(0, 160),
      milestoneName: String(form.get("milestoneName") || "Milestone").slice(0, 160),
      milestoneDescription: String(form.get("milestoneDescription") || "").slice(0, 1200),
      acceptanceCriteria: String(form.get("acceptanceCriteria") || "").slice(0, 3000),
      contractText: String(form.get("contractText") || "").slice(0, 12_000),
      deliveryNotes: String(form.get("deliveryNotes") || "").slice(0, 2000),
    });
    return NextResponse.json(result, { status: 200, headers: NO_STORE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delivery review failed.";
    return NextResponse.json({ error: message }, { status: 400, headers: NO_STORE_HEADERS });
  }
}
