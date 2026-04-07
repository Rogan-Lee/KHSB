"use server";

import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { seedDemoData } from "@/lib/demo-seed";
import { redirect } from "next/navigation";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    + "-" + Date.now().toString(36);
}

export async function createTrialOrganization(formData: FormData) {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const orgName = (formData.get("orgName") as string)?.trim();
  if (!orgName) throw new Error("학원 이름을 입력하세요");

  // 이미 org가 있으면 무시
  if (user.orgId) redirect("/");

  // 1. Organization 생성 (14일 트라이얼, STANDARD 플랜)
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

  const org = await prisma.organization.create({
    data: {
      name: orgName,
      slug: generateSlug(orgName),
      plan: "STANDARD",
      status: "TRIAL",
      trialEndsAt,
      maxStudents: 30,
    },
  });

  // 2. 현재 유저를 DIRECTOR로 Membership 생성
  await prisma.membership.create({
    data: {
      userId: user.id,
      orgId: org.id,
      role: "DIRECTOR",
    },
  });

  // 3. 데모 데이터 시드
  await seedDemoData(org.id, user.id);

  // 4. Lead 자동 생성 (CRM 파이프라인 추적)
  await prisma.lead.create({
    data: {
      name: orgName,
      phone: "-",
      source: "trial-signup",
      orgId: org.id,
    },
  });

  redirect("/");
}
