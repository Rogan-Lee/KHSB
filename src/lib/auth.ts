import { auth as clerkAuth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "./prisma";

// Clerk 인증 기반으로 Prisma User를 반환
// - clerkId로 먼저 조회
// - 없으면 email로 기존 유저 조회 후 clerkId 연결 (기존 계정 마이그레이션)
// - 둘 다 없으면 신규 생성 (기본 role: MENTOR)
export async function getUser() {
  const { userId: clerkId } = await clerkAuth();
  if (!clerkId) return null;

  let user = await prisma.user.findUnique({ where: { clerkId } });
  if (user) return user;

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";
  const firstName = clerkUser.firstName ?? "";
  const lastName = clerkUser.lastName ?? "";
  const name = `${lastName}${firstName}`.trim() || email.split("@")[0] || "사용자";

  // upsert: 이메일로 기존 계정 연동 or 신규 생성 (race condition 방지)
  user = await prisma.user.upsert({
    where: { email },
    update: { clerkId },
    create: { clerkId, email, name, role: "MENTOR" },
  });
  return user;
}

// 기존 server action들과의 호환성 레이어
// session.user.id / session.user.role / session.user.name 그대로 사용 가능
export async function auth() {
  const user = await getUser();
  if (!user) return null;
  return { user };
}
