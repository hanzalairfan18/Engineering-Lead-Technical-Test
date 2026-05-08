import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment schema. Validated once at startup so the rest of the app
 * can rely on a fully-typed, fully-defaulted config object.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4.1-mini'),

  CHUNK_SIZE: z.coerce.number().int().positive().default(500),
  CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(100),
  TOP_K: z.coerce.number().int().positive().default(3),
  SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.35),

  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
});

export type AppConfig = z.infer<typeof EnvSchema>;

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (parsed.data.CHUNK_OVERLAP >= parsed.data.CHUNK_SIZE) {
    throw new Error('CHUNK_OVERLAP must be smaller than CHUNK_SIZE');
  }
  cached = parsed.data;
  return cached;
}
