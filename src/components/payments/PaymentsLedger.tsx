"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, CheckCircle2 } from "lucide-react";
import { PayPalCheckoutButton } from "@/components/payments/PayPalCheckoutButton";
import type { Invoice } from "@/types/database.types";
import { formatCurrency } from "@/lib/utils";

type PaymentRecord = {
  invoice_id: string;
  order_id: string;
  capture_id: string | null;
  amount: number;
  currency: string;
  status: string;
  order_status: string | null;
  capture_status: string | null;
  updated_at: string;
};

type PaymentsLedgerProps = {
  invoices: Invoice[];
  clientId?: string;
};

export function PaymentsLedger({ invoices, clientId }: PaymentsLedgerProps) {
  const [records, setRecords] = useState<Record<string, PaymentRecord>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const ids = invoices.map((invoice) => invoice.id).join(",");
      const response = await fetch(`/api/paypal/records?invoiceIds=${encodeURIComponent(ids)}`, { cache: "no-store" });
      const result = (await response.json()) as { records?: PaymentRecord[]; error?: string };
      if (!response.ok) {
        if (response.status === 401) setRecords({});
        else setLoadError(result.error || "Could not load payment records.");
      } else {
        setRecords(Object.fromEntries((result.records ?? []).map((record) => [record.invoice_id, record])));
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not refresh the payment ledger.");
    } finally {
      setLoading(false);
    }
  }, [invoices]);

  useEffect(() => {
    let ignore = false;
    async function fetchInitialRecords() {
      try {
        const ids = invoices.map((invoice) => invoice.id).join(",");
        const response = await fetch(`/api/paypal/records?invoiceIds=${encodeURIComponent(ids)}`, { cache: "no-store" });
        const result = (await response.json()) as { records?: PaymentRecord[]; error?: string };
        if (!ignore) {
          if (!response.ok) {
            if (response.status === 401) setRecords({});
            else setLoadError(result.error || "Could not load payment records.");
          } else {
            setRecords(Object.fromEntries((result.records ?? []).map((record) => [record.invoice_id, record])));
          }
          setLoading(false);
        }
      } catch (error) {
        if (!ignore) {
          setLoadError(error instanceof Error ? error.message : "Could not refresh the payment ledger.");
          setLoading(false);
        }
      }
    }
    void fetchInitialRecords();
    return () => {
      ignore = true;
    };
  }, [invoices]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Project invoices</h2>
          <p className="mt-1 text-xs text-slate-500">Orders, captures and their server-persisted PayPal status.</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh ledger
        </button>
      </div>

      {loadError && (
        <p role="alert" className="mx-5 mt-4 rounded-lg bg-rose-50 p-3 text-xs text-rose-800">
          {loadError}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Invoice</th>
              <th className="px-5 py-3">Amount</th>
              <th className="px-5 py-3">Due date</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">PayPal record</th>
              <th className="px-5 py-3">Sandbox checkout</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.map((invoice) => {
              const payment = records[invoice.id];
              const isVerifiedPaid = Boolean(payment && payment.status === "COMPLETED");
              const isSamplePaid = !payment && invoice.status === "paid";

              return (
                <tr key={invoice.id} className="align-top hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    <span className="font-mono text-xs font-semibold text-sky-800">{invoice.invoice_number}</span>
                  </td>
                  <td className="px-5 py-4 font-semibold text-slate-900">
                    {formatCurrency(invoice.amount, invoice.currency)}
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-600">
                    {new Date(`${invoice.due_date}T00:00:00`).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-4">
                    {isVerifiedPaid ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-800 border border-emerald-200">
                        PAID (Verified Capture)
                      </span>
                    ) : isSamplePaid ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-800 border border-amber-200">
                        Sample Data (Unverified)
                      </span>
                    ) : payment ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-800">
                        {payment.status.replaceAll("_", " ")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700">
                        {invoice.status.toUpperCase()}
                      </span>
                    )}
                  </td>
                  <td className="max-w-[230px] px-5 py-4 text-[11px] text-slate-500">
                    {payment ? (
                      <>
                        <span className="block font-mono text-slate-700">Order: {payment.order_id}</span>
                        <span className="mt-1 block">Capture: {payment.capture_id ?? "Pending"}</span>
                        <span className="mt-1 block">Updated: {new Date(payment.updated_at).toLocaleString()}</span>
                      </>
                    ) : isSamplePaid ? (
                      <span className="italic text-slate-400">Sample record (No PayPal capture)</span>
                    ) : (
                      <span className="italic text-slate-400">No saved PayPal order</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {isVerifiedPaid ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-emerald-800">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        Capture recorded
                      </span>
                    ) : (
                      <PayPalCheckoutButton invoiceId={invoice.id} clientId={clientId} onPaid={refresh} />
                    )}
                  </td>
                </tr>
              );
            })}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">
                  No invoices are linked to this account yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-[11px] leading-5 text-slate-500">
        Demo invoices remain labelled as sample data until verified via PayPal Sandbox capture. A payment is marked paid only after PayPal returns a completed capture with a matching amount and currency, and PayMind saves the server-persisted record.
      </div>
    </section>
  );
}
