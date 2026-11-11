import type { AgAiEvent } from "ag-studio";
import type {
  AgLlmAdapter,
  AgLlmExecuteTurnOptions,
  AgLlmRequest,
  AgLlmResponse,
  AgLlmResponseHandler,
} from "ag-studio";

type CompleteEnvelope = {
  type: "__paymind_complete";
  response: AgLlmResponse;
};

function isEvent(value: unknown): value is AgAiEvent {
  return Boolean(value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string");
}

export function createServerProxyLlmAdapter(endpoint = "/api/intelligence/studio"): AgLlmAdapter {
  return {
    executeTurn(request: AgLlmRequest, options?: AgLlmExecuteTurnOptions): AgLlmResponseHandler {
      let resolveComplete!: (value: AgLlmResponse) => void;
      const complete = new Promise<AgLlmResponse>((resolve) => {
        resolveComplete = resolve;
      });

      async function* stream(): AsyncGenerator<AgAiEvent> {
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
            signal: options?.signal,
            cache: "no-store",
          });

          if (!res.ok || !res.body) {
            let message = `AG Studio AI request failed (${res.status}).`;
            try {
              const data = (await res.json()) as { error?: string };
              if (data?.error) message = data.error;
            } catch {
              // ignore
            }
            resolveComplete({
              id: crypto.randomUUID(),
              createdAt: Date.now(),
              status: "failed",
              output: [],
              error: { code: String(res.status), message },
            });
            return;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let done = false;
          while (!done) {
            const chunk = await reader.read();
            done = chunk.done;
            buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !done });
            let idx = buffer.indexOf("\n");
            while (idx >= 0) {
              const line = buffer.slice(0, idx).trim();
              buffer = buffer.slice(idx + 1);
              idx = buffer.indexOf("\n");
              if (!line) continue;
              let parsed: unknown;
              try {
                parsed = JSON.parse(line);
              } catch {
                continue;
              }
              if (parsed && typeof parsed === "object" && (parsed as { type?: string }).type === "__paymind_complete") {
                resolveComplete((parsed as CompleteEnvelope).response);
                continue;
              }
              if (isEvent(parsed) && (parsed as { type: string }).type !== "__paymind_complete") {
                yield parsed;
              }
            }
          }

          // If stream ended without explicit completion, resolve safely.
          void Promise.race([complete, Promise.resolve()]).then(async () => {
            // no-op
          });
        } catch (err) {
          if ((err as { name?: string })?.name === "AbortError") {
            resolveComplete({ id: crypto.randomUUID(), createdAt: Date.now(), status: "cancelled", output: [] });
            return;
          }
          resolveComplete({
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            status: "failed",
            output: [],
            error: { code: "network_error", message: err instanceof Error ? err.message : "Network error." },
          });
        }
      }

      return { stream: stream(), complete };
    },
  };
}
