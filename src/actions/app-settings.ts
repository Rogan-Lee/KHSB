"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff, requireFullAccess } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import {
  SHARE_WORDING_DEFAULTS,
  type ShareWordingKey,
} from "@/lib/share-wording";

/** 앱 설정 값 조회 (없으면 null). 직원. */
export async function getAppSetting(key: string): Promise<string | null> {
  const session = await auth();
  requireStaff(session?.user?.role);
  const row = await prisma.appSetting.findUnique({ where: { key }, select: { value: true } });
  return row?.value ?? null;
}

/** 앱 설정 값 저장 (원장). */
export async function setAppSetting(key: string, value: string): Promise<{ ok: true }> {
  const session = await auth();
  requireFullAccess(session?.user?.role);
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  revalidatePath("/");
  return { ok: true };
}

/** 공유 워딩 조회 — 저장값 없으면 기본 템플릿. 직원. */
export async function getShareWording(key: ShareWordingKey): Promise<string> {
  const stored = await getAppSetting(key);
  return stored ?? SHARE_WORDING_DEFAULTS[key];
}
