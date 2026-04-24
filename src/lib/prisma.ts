import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * Prisma 내장 드라이버 전용 쿼리 파라미터(pgbouncer, connection_limit 등)는
 * node-postgres(pg) 드라이버가 이해하지 못해 서버에 잘못 전달 → 연결 실패.
 * PrismaPg 어댑터를 쓰므로 해당 파라미터는 URL 에서 제거하고 pool 옵션으로 처리.
 */
function sanitizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const drop = ["pgbouncer", "connection_limit", "pool_timeout", "statement_cache_size"];
    for (const k of drop) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return raw;
  }
}

// Supabase Postgres (pooler URL) — @prisma/adapter-pg 사용.
// Vercel serverless: 인스턴스당 Pool max=1 로 제한해 connection 고갈 방지.
function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: sanitizeUrl(process.env.DATABASE_URL!),
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
