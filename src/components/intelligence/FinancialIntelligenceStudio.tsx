"use client";

import { useMemo } from "react";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import {
  AgStudioAiModule,
  createAiHarness,
  type AgAiHarnessSetup,
  type AgAiPromptStarter,
  type AgStudioMode,
  type AgStudioApi,
} from "ag-studio";
import type { IntelligenceDashboardPayload } from "@/lib/paymind/financial/load-dashboard-data";
import { createServerProxyLlmAdapter } from "@/lib/paymind/financial/studio-adapter";

const PROMPT_STARTERS: AgAiPromptStarter[] = [
  { label: "Payment risk summary", prompt: "Summarize payment and verification risk in financial_records. Only call a record verified when is_verified_capture is true." },
  { label: "Pending invoices", prompt: "Show invoices that are not verified captures and explain which need follow-up." },
  { label: "Amounts by currency", prompt: "Break down total amount and verified-capture amount by currency." },
];

export function FinancialIntelligenceStudio({ payload }: { payload: IntelligenceDashboardPayload }) {
  const adapter = useMemo(() => createServerProxyLlmAdapter(), []);
  const ai = useMemo<AgAiHarnessSetup>(
    () => ({ api }) =>
      createAiHarness(api as unknown as AgStudioApi, {
        adapter,
        promptStarters: PROMPT_STARTERS,
      }),
    [adapter],
  );

  return (
    <AgStudioProvider modules={[AgStudioAiModule]}>
      <div className="h-[72vh] min-h-[560px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <AgStudio
          className="h-full w-full"
          style={{ height: "100%", width: "100%" }}
          data={payload.data}
          mode={"edit" as AgStudioMode}
          ai={ai}
        />
      </div>
      <p className="mt-3 text-xs text-slate-600">
        AG Studio AI uses a server proxy (`/api/intelligence/studio`) so API keys stay server-side. {payload.aiConfigured ? "Server AI configuration detected." : "Server AI is not configured; the dashboard data still loads, but agent responses may be unavailable until PAYMIND_AI_PROVIDER, the matching API key, and PAYMIND_AI_MODEL are set."}
      </p>
    </AgStudioProvider>
  );
}
