import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma CLI(마이그레이션·introspection) 전용 datasource.
// - 런타임 쿼리는 src/lib/prisma.ts 의 PrismaPg 어댑터가 DATABASE_URL 을 직접 사용
// - CLI 는 transaction pooler(6543, pgbouncer) 위에서 DDL 을 못 돌리므로
//   DIRECT_URL(session pooler 5432 또는 직결) 이 있으면 우선 사용
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
});
