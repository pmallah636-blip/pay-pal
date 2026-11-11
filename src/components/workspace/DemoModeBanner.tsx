"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import type { DemoWorkspaceView } from "@/lib/workspace/workspace-types";

export function DemoModeBanner({ view }: { view?: DemoWorkspaceView }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <p>
          <strong>Demo workspace data.</strong>{" "}
          {view === "client"
            ? "Client view shows the selected demo client’s shared project records only. It does not provide access to another real account."
            : "Projects, calendar dates, contract checklist items, and payment records shown here are saved in this browser for demo/testing. Manual payment actions are demo records and are never represented as verified PayPal captures."}
        </p>
      </div>
      <Link href="/settings#workspace-view" className="shrink-0 font-semibold text-amber-900 underline decoration-amber-300 underline-offset-2 hover:text-amber-950">
        Switch Client / Merchant view
      </Link>
    </div>
  );
}
