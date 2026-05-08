import type { AppConfig } from '../config/env';
import { UpstreamError } from '../utils/errors';
import { getOpenAIClient } from './openai-client';

export interface CompleteOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}

/**
 * Thin wrapper around the OpenAI chat completions API.
 *
 * Centralizing this in a single service means the model name, temperature
 * defaults, and error mapping live in one place — controllers and the RAG
 * orchestrator never call the SDK directly.
 */
export class LLMService {
  constructor(private readonly config: AppConfig) {}

  async complete({ systemPrompt, userPrompt, temperature = 0.1 }: CompleteOptions): Promise<string> {
    const client = getOpenAIClient(this.config);
    try {
      const response = await client.chat.completions.create({
        model: this.config.OPENAI_CHAT_MODEL,
        temperature,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });
      const answer = response.choices[0]?.message?.content?.trim();
      if (!answer) throw new UpstreamError('OpenAI returned an empty completion');
      return answer;
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      throw new UpstreamError(
        `Chat completion failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
