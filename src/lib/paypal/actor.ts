import { MOCK_INVOICES } from "@/lib/supabase/mock-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PayPalInvoiceRecord = {
  id: string;
  project_id: string;
  milestone_id: string | null;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
};

export type PayPalActor = {
  userId: string | null;
  invoice: PayPalInvoiceRecord;
  demo: boolean;
};

export async function resolvePayPalActor(invoiceId: string): Promise<
  | { ok: true; actor: PayPalActor }
  | { ok: false; status: number; error: string }
> {
  const demoEnabled = process.env.NODE_ENV !== "production" && process.env.PAYMIND_DEMO_MODE === "true";
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) return { ok: false, status: 401, error: "Your sign-in session could not be verified. Sign in again." };
    if (user) {
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .select("id, project_id, milestone_id, invoice_number, amount, currency, status")
        .eq("id", invoiceId)
        .maybeSingle();
      if (invoiceError || !invoice) return { ok: false, status: 404, error: "Invoice not found or you do not have access to it." };
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id, freelancer_id")
        .eq("id", invoice.project_id)
        .maybeSingle();
      if (projectError || !project || project.freelancer_id !== user.id) {
        return { ok: false, status: 403, error: "Only the freelancer who owns this project can create its PayPal order." };
      }
      return {
        ok: true,
        actor: {
          userId: user.id,
          invoice: { ...invoice, amount: Number(invoice.amount), milestone_id: invoice.milestone_id ?? null },
          demo: false,
        },
      };
    }
  }

  if (demoEnabled) {
    const invoice = MOCK_INVOICES.find((item) => item.id === invoiceId);
    if (!invoice) return { ok: false, status: 404, error: "Sample invoice was not found." };
    return {
      ok: true,
      actor: {
        userId: null,
        invoice: {
          id: invoice.id,
          project_id: invoice.project_id,
          milestone_id: invoice.milestone_id ?? null,
          invoice_number: invoice.invoice_number,
          amount: invoice.amount,
          currency: invoice.currency,
          status: invoice.status,
        },
        demo: true,
      },
    };
  }

  return { ok: false, status: 401, error: "Sign in with Supabase to pay an invoice. Local sample checkout can be enabled with PAYMIND_DEMO_MODE=true in development only." };
}
