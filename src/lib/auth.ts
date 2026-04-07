import { auth as clerkAuth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "./prisma";
import type { PlanTier, OrgStatus, Role } from "@/generated/prisma";

export type UserSession = {
  id: string;
  email: string;
  name: string;
  clerkId: string | null;
  role: Role;
  isMentor: boolean;
  // org context (null if no membership yet → triggers onboarding)
  orgId: string | null;
  orgName: string | null;
  orgPlan: PlanTier | null;
  orgStatus: OrgStatus | null;
  trialEndsAt: Date | null;
};

// Clerk 인증 기반으로 Prisma User + Organization 컨텍스트를 반환
// - clerkId로 먼저 조회
// - 없으면 email로 기존 유저 조회 후 clerkId 연결 (기존 계정 마이그레이션)
// - 둘 다 없으면 신규 생성 (기본 role: MENTOR)
// - Membership 기반으로 org 컨텍스트 부여
export async function getUser(): Promise<UserSession | null> {
  const { userId: clerkId } = await clerkAuth();
  if (!clerkId) return null;

  let user = await prisma.user.findUnique({ where: { clerkId } });

  if (!user) {
    const clerkUser = await currentUser();
    if (!clerkUser) return null;

    const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";
    const firstName = clerkUser.firstName ?? "";
    const lastName = clerkUser.lastName ?? "";
    const name = `${lastName}${firstName}`.trim() || email.split("@")[0] || "사용자";

    user = await prisma.user.upsert({
      where: { email },
      update: { clerkId },
      create: { clerkId, email, name, role: "MENTOR" },
    });
  }

  // Membership → Organization 컨텍스트 조회
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    include: { org: true },
    orderBy: { createdAt: "desc" },
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    clerkId: user.clerkId,
    role: membership?.role ?? user.role,
    isMentor: user.isMentor,
    orgId: membership?.orgId ?? null,
    orgName: membership?.org.name ?? null,
    orgPlan: membership?.org.plan ?? null,
    orgStatus: membership?.org.status ?? null,
    trialEndsAt: membership?.org.trialEndsAt ?? null,
  };
}

// 기존 server action들과의 호환성 레이어
export async function auth() {
  const user = await getUser();
  if (!user) return null;
  return { user };
}
