import { z } from 'zod';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number(),
  documents: z.number(),
  chunks: z.number(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
