import { getUser } from "./auth";
import type { PlanTier, Role } from "@/generated/prisma";

export type OrgContext = {
  orgId: string;
  userId: string;
  role: Role;
  plan: PlanTier;
};

/**
 * 모든 tenant-scoped server action에서 auth() 대신 사용.
 * - 인증 필수
 * - Organization 소속 필수 (없으면 onboarding으로)
 * - 트라이얼 만료 시 쓰기 차단
 */
export async function requireOrg(): Promise<OrgContext> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  if (!user.orgId || !user.orgPlan) throw new Error("NoOrganization");

  if (
    user.orgStatus === "TRIAL" &&
    user.trialEndsAt &&
    user.trialEndsAt < new Date()
  ) {
    throw new Error("TrialExpired");
  }

  return {
    orgId: user.orgId,
    userId: user.id,
    role: user.role,
    plan: user.orgPlan,
  };
}

/**
 * 읽기 전용 org 컨텍스트 (트라이얼 만료 후에도 조회 가능)
 */
export async function requireOrgReadOnly(): Promise<OrgContext> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  if (!user.orgId || !user.orgPlan) throw new Error("NoOrganization");

  return {
    orgId: user.orgId,
    userId: user.id,
    role: user.role,
    plan: user.orgPlan,
  };
}
