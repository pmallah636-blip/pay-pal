import { NextResponse } from "next/server";
import { getIntelligenceAccess } from "@/lib/paymind/intelligence/dev-only";

export const maxDuration = 60;

type StudioRequest = {
  input?: unknown[];
  instructions?: string;
  tools?: unknown[];
  toolChoice?: unknown;
  responseFormat?: unknown;
  model?: { id?: string; effort?: string };
};

function envProvider() {
  const provider = process.env.PAYMIND_AI_PROVIDER?.toLowerCase();
  const apiKey =
    provider === "openai"
      ? process.env.OPENAI_API_KEY
      : provider === "gemini"
        ? process.env.GEMINI_API_KEY
        : undefined;
  const model = process.env.PAYMIND_AI_MODEL;
  if (!provider || !apiKey || !model || !["openai", "gemini"].includes(provider)) return null;
  return { provider, apiKey, model } as const;
}

function jsonLine(controller: ReadableStreamDefaultController, value: unknown) {
  controller.enqueue(new TextEncoder().encode(JSON.stringify(value) + "\n"));
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => {
      if (!c || typeof c !== "object") return "";
      const part = c as { type?: string; text?: string };
      return part.type === "text" ? part.text ?? "" : "";
    })
    .join("\n");
}

function toOpenAiMessages(body: StudioRequest) {
  const messages: Array<{ role: string; content?: string; tool_call_id?: string; tool_calls?: unknown[]; name?: string }> = [];
  if (body.instructions) messages.push({ role: "system", content: body.instructions });
  for (const item of body.input ?? []) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const type = String(it.type ?? "");
    const role = String(it.role ?? "");
    if (type === "message" && (role === "user" || role === "system" || role === "developer")) {
      messages.push({ role: role === "developer" ? "system" : role, content: contentToText(it.content) });
    } else if (type === "message" && role === "assistant") {
      messages.push({ role: "assistant", content: contentToText(it.content) });
    } else if (type === "function_call") {
      messages.push({
        role: "assistant",
        content: "",
        tool_calls: [{ id: it.callId ?? it.id, type: "function", function: { name: it.name, arguments: it.arguments ?? "{}" } }],
      });
    } else if (type === "function_call_output") {
      messages.push({ role: "tool", tool_call_id: String(it.callId ?? ""), content: String(it.output ?? "") });
    }
  }
  return messages;
}

function toOpenAiTools(tools: unknown[]) {
  return tools
    .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : null))
    .filter((t): t is Record<string, unknown> => Boolean(t && t.kind !== "provided"))
    .map((t) => ({
      type: "function",
      function: { name: String(t.name ?? ""), description: String(t.description ?? ""), parameters: t.parameters ?? { type: "object", properties: {} } },
    }));
}

function extractGeminiParts(body: StudioRequest) {
  const parts: Array<{ text: string }> = [];
  if (body.instructions) parts.push({ text: `[System]\n${body.instructions}` });
  for (const item of body.input ?? []) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const type = String(it.type ?? "");
    const role = String(it.role ?? "");
    if (type === "message") {
      parts.push({ text: `[${role || "message"}]\n${contentToText(it.content)}` });
    } else if (type === "function_call_output") {
      parts.push({ text: `[tool_result ${String(it.callId ?? "")}]\n${String(it.output ?? "")}` });
    }
  }
  return parts;
}

export async function POST(request: Request) {
  const access = await getIntelligenceAccess();
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } },
    );
  }

  const providerConfig = envProvider();
  if (!providerConfig) {
    return NextResponse.json(
      {
        error:
          "AG Studio AI is not configured. Set PAYMIND_AI_PROVIDER (openai|gemini), the matching API key, and PAYMIND_AI_MODEL on the server.",
        code: "ai_not_configured",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: StudioRequest;
  try {
    body = (await request.json()) as StudioRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const createdAt = Date.now();
      const id = crypto.randomUUID();
      const output: unknown[] = [];
      try {
        if (providerConfig.provider === "openai") {
          const tools = Array.isArray(body.tools) ? toOpenAiTools(body.tools) : [];
          const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${providerConfig.apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: body.model?.id || providerConfig.model,
              messages: toOpenAiMessages(body),
              tools: tools.length ? tools : undefined,
              temperature: 0.2,
              stream: false,
            }),
            signal: AbortSignal.timeout(55_000),
          });
          const data = (await response.json().catch(() => ({}))) as {
            choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
            model?: string;
            error?: { message?: string };
          };
          if (!response.ok) throw new Error(data.error?.message || `OpenAI request failed (${response.status}).`);
          const msg = data.choices?.[0]?.message;
          if (msg?.content) {
            const messageId = crypto.randomUUID();
            jsonLine(controller, { type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
            jsonLine(controller, { type: "TEXT_MESSAGE_CONTENT", messageId, delta: msg.content });
            jsonLine(controller, { type: "TEXT_MESSAGE_END", messageId });
            output.push({ id: messageId, kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: msg.content, annotations: [] }] });
          }
          for (const tc of msg?.tool_calls ?? []) {
            const callId = tc.id || crypto.randomUUID();
            jsonLine(controller, { type: "TOOL_CALL_START", toolCallId: callId, toolCallName: tc.function.name });
            jsonLine(controller, { type: "TOOL_CALL_ARGS", toolCallId: callId, delta: tc.function.arguments || "{}" });
            jsonLine(controller, { type: "TOOL_CALL_END", toolCallId: callId });
            output.push({ id: crypto.randomUUID(), kind: "output", type: "function_call", callId, name: tc.function.name, arguments: tc.function.arguments || "{}", status: "completed" });
          }
          jsonLine(controller, {
            type: "__paymind_complete",
            response: {
              id,
              createdAt,
              status: "completed",
              output,
              model: data.model || body.model?.id || providerConfig.model,
              usage: data.usage
                ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens, totalTokens: data.usage.total_tokens }
                : undefined,
            },
          });
        } else {
          const toolList = Array.isArray(body.tools) ? body.tools.filter((t) => t && typeof t === "object") : [];
          const toolText = toolList.length
            ? `\nAvailable tools (respond with JSON {"tool_calls":[{"id":"...","name":"...","arguments":{...}}]} when you must call tools; otherwise answer normally):\n${JSON.stringify(
                toolList.map((t) => {
                  const tool = t as Record<string, unknown>;
                  return { name: tool.name, description: tool.description, parameters: tool.parameters };
                }),
              )}`
            : "";
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(body.model?.id || providerConfig.model)}:generateContent`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-goog-api-key": providerConfig.apiKey },
              body: JSON.stringify({
                contents: [{ role: "user", parts: extractGeminiParts({ ...body, instructions: (body.instructions || "") + toolText }) }],
                generationConfig: { temperature: 0.2 },
              }),
              signal: AbortSignal.timeout(55_000),
            },
          );
          const data = (await response.json().catch(() => ({}))) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            error?: { message?: string };
            usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
          };
          if (!response.ok) throw new Error(data.error?.message || `Gemini request failed (${response.status}).`);
          const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
          const maybe = safeJsonParse(text) as { tool_calls?: Array<{ id?: string; name?: string; arguments?: unknown }> } | null;
          if (maybe?.tool_calls?.length) {
            for (const tc of maybe.tool_calls) {
              if (!tc?.name) continue;
              const callId = tc.id || crypto.randomUUID();
              const args = typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments ?? {});
              jsonLine(controller, { type: "TOOL_CALL_START", toolCallId: callId, toolCallName: tc.name });
              jsonLine(controller, { type: "TOOL_CALL_ARGS", toolCallId: callId, delta: args });
              jsonLine(controller, { type: "TOOL_CALL_END", toolCallId: callId });
              output.push({ id: crypto.randomUUID(), kind: "output", type: "function_call", callId, name: tc.name, arguments: args, status: "completed" });
            }
          } else if (text) {
            const messageId = crypto.randomUUID();
            jsonLine(controller, { type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
            jsonLine(controller, { type: "TEXT_MESSAGE_CONTENT", messageId, delta: text });
            jsonLine(controller, { type: "TEXT_MESSAGE_END", messageId });
            output.push({ id: messageId, kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text, annotations: [] }] });
          }
          jsonLine(controller, {
            type: "__paymind_complete",
            response: {
              id,
              createdAt,
              status: "completed",
              output,
              model: body.model?.id || providerConfig.model,
              usage: data.usageMetadata
                ? {
                    inputTokens: data.usageMetadata.promptTokenCount,
                    outputTokens: data.usageMetadata.candidatesTokenCount,
                    totalTokens: data.usageMetadata.totalTokenCount,
                  }
                : undefined,
            },
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "AG Studio AI request failed.";
        jsonLine(controller, {
          type: "__paymind_complete",
          response: { id, createdAt, status: "failed", output, error: { code: "provider_error", message } },
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
