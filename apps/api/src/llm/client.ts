import { env } from "../env.js";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * GPT-5.5 — réservé à l'Orchestrator (planification, décisions multi-étapes).
 * Endpoint Numeos compatible OpenAI (/openai/v1/chat/completions).
 */
export async function callReasoningModel(messages: ChatMessage[], opts: { maxTokens?: number; jsonMode?: boolean } = {}) {
  const res = await fetch(`${env.reasoningLlmUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.reasoningLlmKey}`,
    },
    body: JSON.stringify({
      model: env.reasoningLlmModel,
      messages,
      max_tokens: opts.maxTokens ?? 2048,
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Erreur GPT-5.5 (${res.status}) : ${await res.text()}`);
  }
  const data = await res.json();
  return data.choices[0].message.content as string;
}

/**
 * GPT-4.1 — Extractor, Writer, mise en forme des justifications Qualifier/Compliance.
 * Endpoint Azure OpenAI natif (api-version en query, api-key en header).
 */
export async function callVolumeModel(messages: ChatMessage[], opts: { maxTokens?: number; jsonMode?: boolean } = {}) {
  const url =
    `${env.volumeLlmEndpoint.replace(/\/$/, "")}/openai/deployments/${env.volumeLlmDeployment}` +
    `/chat/completions?api-version=${env.volumeLlmApiVersion}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": env.volumeLlmKey,
    },
    body: JSON.stringify({
      messages,
      max_tokens: opts.maxTokens ?? env.volumeLlmMaxTokens,
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Erreur GPT-4.1 (${res.status}) : ${await res.text()}`);
  }
  const data = await res.json();
  return data.choices[0].message.content as string;
}

/**
 * embedder-small-3 — indexation et recherche des références internes (RAG).
 * Calculé une seule fois par référence, jamais recalculé à chaque requête.
 */
export async function embedText(text: string): Promise<number[]> {
  const res = await fetch(`${env.reasoningLlmUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.reasoningLlmKey}`,
    },
    body: JSON.stringify({
      model: env.embeddingModel,
      input: text,
      dimensions: env.embeddingDimensions,
    }),
  });
  if (!res.ok) {
    throw new Error(`Erreur embeddings (${res.status}) : ${await res.text()}`);
  }
  const data = await res.json();
  return data.data[0].embedding as number[];
}
