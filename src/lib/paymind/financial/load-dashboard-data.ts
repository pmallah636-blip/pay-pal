import { MOCK_INVOICES, MOCK_PROJECTS } from "@/lib/supabase/mock-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildFinancialDashboardRows,
  summarizeFinancialRows,
  toAgStudioFinancialData,
  type FinancialDashboardRow,
  type FinancialDataSource,
  type FinancialSummary,
} from "@/lib/paymind/financial/dashboard-data";
import type { AgDataSourcesDefinition } from "ag-studio";

export type IntelligenceDashboardPayload = {
  rows: FinancialDashboardRow[];
  summary: FinancialSummary;
  data: AgDataSourcesDefinition;
  dataSource: FinancialDataSource;
  userScoped: boolean;
  aiConfigured: boolean;
  note: string;
};

export function isAiConfigured() {
  const provider = process.env.PAYMIND_AI_PROVIDER?.toLowerCase();
  const key = provider === "openai" ? process.env.OPENAI_API_KEY : provider === "gemini" ? process.env.GEMINI_API_KEY : undefined;
  return Boolean(provider && key && process.env.PAYMIND_AI_MODEL && ["openai", "gemini"].includes(provider));
}

export async function loadIntelligenceDashboardData(): Promise<IntelligenceDashboardPayload> {
  const demoEnabled = process.env.NODE_ENV !== "production" && process.env.PAYMIND_DEMO_MODE === "true";
  const aiConfigured = isAiConfigured();
  const serverSupabase = await createSupabaseServerClient();
  const { data: { user } } = serverSupabase ? await serverSupabase.auth.getUser() : { data: { user: null } };

  if (serverSupabase && user) {
    const [{ data: invoices, error: invError }, { data: projects, error: projError }] = await Promise.all([
      serverSupabase
        .from("invoices")
        .select("id, project_id, invoice_number, amount, currency, status, due_date, paid_at")
        .order("due_date", { ascending: true }),
      serverSupabase.from("projects").select("id, title, client_name"),
    ]);

    let payments: Array<{ invoice_id: string; order_id?: string | null; capture_id?: string | null; status?: string | null; capture_status?: string | null; amount?: number | string | null; currency?: string | null }> = [];
    const admin = createSupabaseAdminClient();
    const ids = (invError || !invoices ? [] : invoices).map((i) => i.id).filter(Boolean);
    if (admin && ids.length) {
      let q = admin
        .from("paypal_payment_records")
        .select("invoice_id, order_id, capture_id, amount, currency, status, capture_status")
        .in("invoice_id", ids)
        .order("created_at", { ascending: false });
      q = q.eq("owner_id", user.id);
      const { data: paymentRows } = await q;
      const latest = new Map<string, (typeof payments)[number]>();
      for (const row of paymentRows ?? []) if (!latest.has(row.invoice_id)) latest.set(row.invoice_id, row as (typeof payments)[number]);
      payments = [...latest.values()];
    }

    const rows = buildFinancialDashboardRows({
      dataSource: "supabase",
      invoices: invError || !invoices ? [] : invoices.map((r) => ({ ...r, amount: Number(r.amount) })),
      payments,
      projects: projError || !projects ? [] : projects,
    });
    return {
      rows,
      summary: summarizeFinancialRows(rows),
      data: toAgStudioFinancialData(rows),
      dataSource: "supabase",
      userScoped: true,
      aiConfigured,
      note:
        payments.length === 0
          ? "Showing authenticated Supabase invoices. No persisted PayPal payment records were found for these invoices; records are unverified until server-side capture records exist."
          : "Showing authenticated Supabase invoices joined with persisted PayPal payment records. Only rows with is_verified_capture=true represent verified PayPal captures.",
    };
  }

  if (demoEnabled || process.env.NODE_ENV !== "production") {
    const rows = buildFinancialDashboardRows({
      dataSource: "seeded_demo",
      invoices: MOCK_INVOICES,
      projects: MOCK_PROJECTS.map((p) => ({ id: p.id, title: p.title, client_name: p.client_name })),
      payments: [],
    });
    return {
      rows,
      summary: summarizeFinancialRows(rows),
      data: toAgStudioFinancialData(rows),
      dataSource: "seeded_demo",
      userScoped: false,
      aiConfigured,
      note: "Showing seeded demo data (no authenticated Supabase session or demo mode fallback). These records are not verified PayPal captures and must not be treated as completed payments.",
    };
  }

  const rows = buildFinancialDashboardRows({ dataSource: "supabase", invoices: [], payments: [], projects: [] });
  return {
    rows,
    summary: summarizeFinancialRows(rows),
    data: toAgStudioFinancialData(rows),
    dataSource: "supabase",
    userScoped: false,
    aiConfigured,
    note: "Sign in to view account-scoped financial records.",
  };
}
