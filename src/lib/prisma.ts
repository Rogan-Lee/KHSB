import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Supabase Postgres (pooler URL) — @prisma/adapter-pg 사용.
//
// Vercel serverless 는 각 invocation 이 독립적이므로 내부 pg Pool 을 1개로 제한해
// Supabase session pooler (port 5432, pool_size=15) 의 EMAXCONNSESSION 방지.
// 프로덕션에서는 DATABASE_URL 을 transaction pooler (port 6543) + pgbouncer=true
// 로 설정하면 더 안전함.
function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
