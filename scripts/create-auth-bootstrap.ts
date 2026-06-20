import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  throw new Error("사용법: npm run auth:bootstrap -- director@studyroom.kr");
}

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL 또는 DIRECT_URL이 필요합니다");
}

function sanitizeDatabaseUrl(raw: string) {
  const url = new URL(raw);
  for (const key of [
    "pgbouncer",
    "connection_limit",
    "pool_timeout",
    "statement_cache_size",
  ]) {
    url.searchParams.delete(key);
  }
  return url.toString();
}

const adapter = new PrismaPg({
  connectionString: sanitizeDatabaseUrl(databaseUrl),
});
const prisma = new PrismaClient({ adapter });

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000"
  );
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      authIdentity: { select: { id: true } },
      id: true,
      name: true,
      role: true,
      status: true,
    },
  });

  if (!user) throw new Error("해당 이메일의 직원을 찾을 수 없습니다");
  if (!["SUPER_ADMIN", "DIRECTOR"].includes(user.role)) {
    throw new Error("최초 계정은 SUPER_ADMIN 또는 DIRECTOR여야 합니다");
  }
  if (user.status !== "ACTIVE") throw new Error("퇴사 처리된 계정입니다");
  if (user.authIdentity) throw new Error("이미 로그인 계정이 연결되어 있습니다");

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

  await prisma.$transaction([
    prisma.authInvitation.updateMany({
      where: {
        targetUserId: user.id,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    }),
    prisma.authInvitation.create({
      data: {
        type: "STAFF",
        tokenHash,
        targetUserId: user.id,
        invitedById: user.id,
        expiresAt,
      },
    }),
  ]);

  console.log(`최초 관리자: ${user.name} (${user.role})`);
  console.log(`24시간 유효 가입 링크: ${getAppUrl()}/sign-up?token=${token}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
