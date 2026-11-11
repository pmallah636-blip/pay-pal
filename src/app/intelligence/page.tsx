import { Suspense } from "react";
import { loadIntelligenceDashboardData } from "@/lib/paymind/financial/load-dashboard-data";
import { FinancialIntelligenceStudio } from "@/components/intelligence/FinancialIntelligenceStudio";
import { formatCurrency } from "@/lib/utils";

export default function IntelligencePage() {
  return (
    <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading financial intelligence dashboard…</div>}>
      <IntelligenceContent />
    </Suspense>
  );
}

async function IntelligenceContent() {
  const payload = await loadIntelligenceDashboardData();
  const currencies = Object.keys(payload.summary.total_amount_by_currency);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-950">Financial Intelligence</h1>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${payload.dataSource === "seeded_demo" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
              {payload.dataSource === "seeded_demo" ? "Seeded demo data" : "Authenticated records"}
            </span>
            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">AG Studio 3.1.0 (Agent Framework)</span>
          </div>
          <p className="mt-1 max-w-4xl text-sm text-slate-600">
            AG Studio dashboard over PayMind financial records. Records are labeled by verification state; a row is payment-complete only when <span className="font-mono">is_verified_capture=true</span> (server-verified PayPal capture).
          </p>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Records" value={String(payload.summary.total_records)} note={payload.summary.data_sources.join(", ")} />
        <Stat label="Verified captures" value={String(payload.summary.verified_capture_count)} note="Requires COMPLETED capture record" />
        <Stat label="Needs follow-up" value={String(payload.summary.pending_count)} note="Not verified/cancelled" />
        <Stat
          label="Verified amount"
          value={currencies.length ? currencies.map((c) => formatCurrency(payload.summary.verified_amount_by_currency[c] ?? 0, c)).join(" · ") : "—"}
          note="By currency"
        />
      </section>

      <div className={`rounded-xl border p-3 text-xs leading-5 ${payload.dataSource === "seeded_demo" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
        <strong>Data provenance:</strong> {payload.note}
      </div>

      <FinancialIntelligenceStudio payload={payload} />

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Current financial records (source snapshot)</h2>
        <p className="mt-1 text-xs text-slate-500">This table mirrors the same server-assembled data passed to AG Studio.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Client/Project</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Payment</th><th className="px-3 py-2">Verification</th><th className="px-3 py-2">Source</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payload.rows.map((r) => (
                <tr key={r.record_id}>
                  <td className="px-3 py-2 font-mono text-sky-800">{r.invoice_number}</td>
                  <td className="px-3 py-2 text-slate-700">{r.client_name} · {r.project_name}</td>
                  <td className="px-3 py-2 font-semibold text-slate-900">{formatCurrency(r.amount, r.currency)}</td>
                  <td className="px-3 py-2">{r.invoice_status}</td>
                  <td className="px-3 py-2">{r.payment_status}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.is_verified_capture ? "bg-emerald-50 text-emerald-800" : r.data_source === "seeded_demo" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{r.verification_state}</span></td>
                  <td className="px-3 py-2">{r.data_source}</td>
                </tr>
              ))}
              {payload.rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">No financial records available.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{note}</p>
    </div>
  );
}
