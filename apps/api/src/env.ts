import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

export const env = {
  // GPT-5.5 — réservé à l'Orchestrator (raisonnement, planification)
  reasoningLlmUrl: required("LLM_URL"),
  reasoningLlmKey: required("LLM_API_KEY"),
  reasoningLlmModel: process.env.LLM_MODEL ?? "gpt-5.5",
  embeddingModel: process.env.EMBEDDING_MODEL ?? "embedder-small-3",
  embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? 512),

  // GPT-4.1 — Extractor, Writer, mise en forme Qualifier/Compliance
  volumeLlmKey: required("AZURE_OPENAI_API_KEY"),
  volumeLlmEndpoint: required("AZURE_OPENAI_ENDPOINT"),
  volumeLlmApiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-12-01-preview",
  volumeLlmDeployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? "gpt-4.1",
  volumeLlmMaxTokens: Number(process.env.AZURE_OPENAI_MAX_TOKENS ?? 16384),

  databaseUrl: process.env.DATABASE_URL ?? "postgresql://tenderpilot:change-me-local@localhost:5432/tenderpilot",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  port: Number(process.env.PORT ?? 3001),
};
