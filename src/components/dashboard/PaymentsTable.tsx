"use client";

import { useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ColDef,
  ModuleRegistry,
  AllCommunityModule,
  ICellRendererParams,
} from "ag-grid-community";
import { Milestone } from "@/types/database.types";
import { MOCK_MILESTONES } from "@/lib/supabase/mock-data";
import { formatCurrency } from "@/lib/utils";
import { CheckCircle2, Clock, ShieldCheck, Search } from "lucide-react";

// Register AG Grid modules once
ModuleRegistry.registerModules([AllCommunityModule]);

export function PaymentsTable() {
  const [rowData] = useState<Milestone[]>(MOCK_MILESTONES);
  const [filterText, setFilterText] = useState("");

  const columnDefs = useMemo<ColDef<Milestone>[]>(() => [
    {
      headerName: "Milestone & Stage",
      field: "title",
      flex: 2,
      minWidth: 260,
      cellRenderer: (params: ICellRendererParams<Milestone>) => {
        if (!params.data) return null;
        return (
          <div className="flex flex-col justify-center h-full py-1">
            <span className="font-semibold text-slate-200 text-xs truncate">
              {params.data.title}
            </span>
            <span className="text-[11px] text-slate-400 truncate">
              {params.data.description}
            </span>
          </div>
        );
      },
    },
    {
      headerName: "Amount",
      field: "amount",
      width: 140,
      valueFormatter: (params) => {
        return params.value ? formatCurrency(params.value, params.data?.currency || "USD") : "$0.00";
      },
      cellClass: "font-semibold text-sky-400 flex items-center text-xs",
    },
    {
      headerName: "Status",
      field: "status",
      width: 170,
      cellRenderer: (params: ICellRendererParams<Milestone>) => {
        const status = params.value;
        if (status === "paid") {
          return (
            <div className="flex items-center h-full">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3" /> Sample data · Paid
              </span>
            </div>
          );
        }
        if (status === "under_client_review") {
          return (
            <div className="flex items-center h-full">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30">
                <Clock className="w-3 h-3" /> Client Review
              </span>
            </div>
          );
        }
        return (
          <div className="flex items-center h-full">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
              Pending Next Stage
            </span>
          </div>
        );
      },
    },
    {
      headerName: "PayPal Order ID",
      field: "paypal_order_id",
      width: 200,
      cellRenderer: (params: ICellRendererParams<Milestone>) => {
        if (!params.value) {
          return <span className="text-slate-500 text-xs italic">Not Created</span>;
        }
        return (
          <div className="flex items-center h-full">
            <span className="font-mono text-xs text-sky-300 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/60">
              {params.value}
            </span>
          </div>
        );
      },
    },
    {
      headerName: "Due Date",
      field: "due_date",
      width: 130,
      cellClass: "text-slate-400 text-xs flex items-center",
    },
    {
      headerName: "Verification",
      field: "paypal_status",
      width: 160,
      cellRenderer: (params: ICellRendererParams<Milestone>) => {
        if (params.value === "COMPLETED") {
          return (
            <div className="flex items-center gap-1.5 h-full text-xs text-emerald-400 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Sample data · Completed</span>
            </div>
          );
        }
        if (params.value === "APPROVED") {
          return (
            <div className="flex items-center gap-1.5 h-full text-xs text-amber-300 font-medium">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>Sample data · Approved</span>
            </div>
          );
        }
        return (
          <span className="text-slate-500 text-xs flex items-center h-full">
            Unassigned
          </span>
        );
      },
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
  }), []);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-white tracking-tight">
              Verified Milestone &amp; Payment Ledger
            </h2>
            <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded font-mono">
              AG Grid Community v36
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Demo ledger entries. Actual Sandbox checkouts are available in the invoice section below.
          </p>
        </div>

        {/* Search Input */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter milestones..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors w-48 sm:w-60"
            />
          </div>
        </div>
      </div>

      {/* AG Grid Container */}
      <div
        className="ag-theme-quartz w-full"
        style={{ height: 260, width: "100%" }}
      >
        <AgGridReact
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          quickFilterText={filterText}
          rowHeight={52}
          headerHeight={40}
        />
      </div>
    </div>
  );
}
