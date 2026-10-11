// 모바일 신고·차단 — 세션에서 본인(SafetyActor)을 확정한다. 핵심 로직은 src/lib/safety.ts.

import type { NextRequest } from "next/server";

import { requireMobileAccount } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { isOnlineStaff, isStaff } from "@/lib/roles";
import type { SafetyActor } from "@/lib/safety";

/** 직원 → 학생 → 학부모 순으로 판정 (requireMobileAccount 가 활성 계정만 통과시킨다) */
export async function requireSafetyActor(request: NextRequest): Promise<SafetyActor> {
  const { appUser, authUserId, student } = await requireMobileAccount(request);
  if (appUser && (isStaff(appUser.role) || isOnlineStaff(appUser.role))) {
    return { type: "STAFF", id: appUser.id, name: appUser.name };
  }
  if (student) return { type: "STUDENT", id: student.id, name: student.name };

  const authUser = await prisma.authUser.findUnique({
    where: { id: authUserId },
    select: { name: true },
  });
  return { type: "PARENT", id: authUserId, name: authUser?.name ?? "학부모" };
}
