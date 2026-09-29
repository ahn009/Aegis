import type { AiProvider, ProviderInput, ProviderResponse, ProviderToolCall, ProviderMessage } from "./types";
import { PROMPT_VERSION } from "./prompts";
import { env } from "../env";
import { randomUUID } from "node:crypto";

// ============================================================================
// OpenAI-compatible chat-completions provider. Uses native fetch against
// OPENAI_BASE_URL (works with OpenAI, Azure OpenAI, vLLM, LM Studio, etc.).
// If no API key is configured, the orchestrator falls back to MockProvider
// (safe degradation — never report false success to a caller).
// ============================================================================

export class OpenAIProvider implements AiProvider {
  name = "openai";
  model = env.openaiModel;
  promptVersion = PROMPT_VERSION;

  async complete(input: ProviderInput): Promise<ProviderResponse> {
    if (!env.openaiApiKey) {
      throw new Error("OpenAI provider selected but OPENAI_API_KEY is not set");
    }
    const start = Date.now();
    const tools = input.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        // Emit a JSON schema from the Zod type (best-effort; for production use zod-to-json-schema)
        parameters: zodToJsonSchema(t.args),
      },
    }));

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: input.systemPrompt },
      ...input.messages.map(toOpenAIMessage),
    ];

    const res = await fetch(`${env.openaiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: env.openaiModel,
        messages,
        tools: tools.length ? tools : undefined,
        tool_choice: "auto",
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }
    const json = await res.json();
    const choice = json.choices?.[0]?.message ?? {};
    const text: string | null = choice.content ?? null;
    const toolCalls: ProviderToolCall[] | undefined = (choice.tool_calls ?? []).map((c: any) => ({
      id: c.id ?? randomUUID(),
      name: c.function?.name,
      args: safeParseArgs(c.function?.arguments),
    }));
    const latencyMs = Date.now() - start;

    return {
      text,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      provider: this.name,
      model: this.model,
      promptVersion: this.promptVersion,
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
      latencyMs,
    };
  }
}

function toOpenAIMessage(m: ProviderMessage): Record<string, unknown> {
  if (m.role === "tool") {
    // our internal tool-result messages carry {name, result, ok} as content
    return { role: "tool", tool_call_id: m.toolCallId ?? "", content: m.content };
  }
  if (m.role === "assistant" && m.toolCalls?.length) {
    return {
      role: "assistant",
      content: m.content ?? "",
      tool_calls: m.toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      })),
    };
  }
  return { role: m.role === "caller" ? "user" : m.role, content: m.content };
}

function safeParseArgs(raw: string | undefined): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Minimal Zod → JSON schema. Handles object, string, number, boolean, enum,
// optional, default, array. Sufficient for our tool schemas.
function zodToJsonSchema(z: any): Record<string, unknown> {
  // Zod v4 exposes ._zod.def.shape or .shape
  const shape = z?.shape ?? z?._zod?.def?.shape ?? z?._def?.shape;
  if (shape) {
    const props: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(shape)) {
      props[k] = zodToJsonSchema(v);
      const isOptional = isZodOptional(v as any);
      if (!isOptional) required.push(k);
    }
    return { type: "object", properties: props, required };
  }
  const typeName = z?._zod?.def?.type ?? z?._def?.typeName ?? "";
  if (typeName === "ZodString" || typeName === "string") return { type: "string" };
  if (typeName === "ZodNumber" || typeName === "number") return { type: "number" };
  if (typeName === "ZodBoolean" || typeName === "boolean") return { type: "boolean" };
  if (typeName === "ZodEnum" || typeName === "enum") {
    const vals = z?._zod?.def?.values ?? z?._def?.values ?? [];
    return { type: "string", enum: vals };
  }
  if (typeName === "ZodArray" || typeName === "array") {
    return { type: "array", items: zodToJsonSchema(z?._zod?.def?.element ?? z?._def?.element) };
  }
  // default / optional unwrap
  const inner = z?._zod?.def?.innerType ?? z?._def?.innerType;
  if (inner) return zodToJsonSchema(inner);
  return {};
}

function isZodOptional(v: any): boolean {
  const t = v?._zod?.def?.type ?? v?._def?.typeName ?? "";
  return t === "ZodOptional" || t === "optional" || t === "ZodDefault" || t === "default" || t === "ZodNullable" || t === "nullable";
}

export function createOpenAIProvider(): OpenAIProvider {
  return new OpenAIProvider();
}

export function isProviderConfigured(): boolean {
  return env.aiProvider === "openai" && !!env.openaiApiKey;
}
