import OpenAI from 'openai';
import type { AppConfig } from '../config/env';

let client: OpenAI | undefined;

/**
 * Lazily-initialized, process-wide OpenAI client.
 *
 * The SDK pools HTTP connections, so a single instance avoids per-request
 * TLS handshake costs. The timeout is a hard ceiling — without it the SDK's
 * 600s default keeps a Fastify handler hostage on a stuck request.
 */
export function getOpenAIClient(config: AppConfig): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
      timeout: 30_000,
      maxRetries: 2,
    });
  }
  return client;
}
