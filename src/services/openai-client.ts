import OpenAI from 'openai';
import type { AppConfig } from '../config/env';

/**
 * Constructs the OpenAI SDK client.
 *
 * The client is created once in the composition root (`buildApp`) and
 * passed into the services that need it. No module-level singleton — that
 * pattern hides mutable state, fights testability, and silently ignores
 * subsequent config changes (e.g. key rotation).
 *
 * The timeout caps stuck calls; without it the SDK's 600s default keeps a
 * Fastify handler hostage on a hung request.
 */
export function createOpenAIClient(config: AppConfig): OpenAI {
  return new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    timeout: 30_000,
    maxRetries: 2,
  });
}
