export interface PoolConfig {
  max: number;
  min: number;
  idleTimeoutMs: number;
  connectionTimeoutMs: number;
}

export function getPoolConfig(env: string = process.env.NODE_ENV ?? 'development'): PoolConfig {
  const isProd = env === 'production';
  return {
    max: isProd ? 10 : 5,
    min: isProd ? 2 : 1,
    idleTimeoutMs: isProd ? 30000 : 10000,
    connectionTimeoutMs: 5000,
  };
}

export interface DatabaseModuleOptions {
  url: string;
  entities: string[];   // glob paths: e.g. ['dist/**/*.entity.js']
  synchronize?: boolean; // never true in production
  ssl?: boolean;
}
