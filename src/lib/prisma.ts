import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Supabase Postgres (pooler URL) — @prisma/adapter-pg 사용.
// 이전에는 @prisma/adapter-neon 을 썼으나, Neon 전용 HTTP 프로토콜은
// Supabase 의 pgbouncer pooler 와 호환되지 않아 PrismaPg 로 교체.
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
