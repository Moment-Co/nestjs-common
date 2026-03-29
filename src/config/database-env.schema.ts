import { z } from 'zod';

export const databaseEnvSchema = z.object({
  DB_HOST: z.string().min(1),
  DB_PORT: z.string().regex(/^\d+$/).default('5432'),
  DB_USERNAME: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),
  DB_SSL: z.enum(['true', 'false']).default('false'),
  DB_POOL_MAX: z.string().regex(/^\d+$/).default('5'),
  DB_POOL_MIN: z.string().regex(/^\d+$/).default('1'),
  DB_POOL_IDLE_TIMEOUT_MS: z.string().regex(/^\d+$/).default('10000'),
  DB_POOL_CONNECTION_TIMEOUT_MS: z.string().regex(/^\d+$/).default('5000'),
  DB_RETRY_ATTEMPTS: z.string().regex(/^\d+$/).default('10'),
  DB_RETRY_DELAY_MS: z.string().regex(/^\d+$/).default('3000'),
});

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
