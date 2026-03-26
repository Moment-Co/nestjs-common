import { z } from 'zod';

export const commonEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().regex(/^\d+$/).default('3000'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'verbose']).default('info'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
});

export type CommonEnv = z.infer<typeof commonEnvSchema>;
