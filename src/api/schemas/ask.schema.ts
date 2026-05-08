import { z } from 'zod';

export const AskBodySchema = z
  .object({
    question: z
      .string()
      .min(1, 'question is required')
      .max(2000, 'question exceeds 2000 characters'),
  })
  .strict();

export type AskBody = z.infer<typeof AskBodySchema>;

export const AskResponseSchema = z.object({
  answer: z.string(),
  grounded: z.boolean(),
  sources: z.array(
    z.object({
      chunkId: z.string(),
      documentId: z.string(),
      score: z.number(),
      preview: z.string(),
    }),
  ),
});

export type AskResponse = z.infer<typeof AskResponseSchema>;
