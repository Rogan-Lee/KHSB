"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CONSENT_DOC_VERSION, parsePaperConsent, todayConsentDate, type PaperConsentInput } from "@/lib/privacy/consent";
import { requireStaff } from "@/lib/roles";

/** 서면 동의서를 받은 뒤 그 사실을 등록한다. 고치지 않고 새로 쌓는다(철회도 새 행) */
export async function savePaperConsent(input: PaperConsentInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "로그인이 필요합니다" };
  requireStaff(session.user.role);

  const studentId = typeof input?.studentId === "string" ? input.studentId : "";
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, birthDate: true } });
  if (!student) return { ok: false, error: "학생을 찾을 수 없습니다" };

  const parsed = parsePaperConsent(input, { today: todayConsentDate(), birthDate: student.birthDate });
  if (!parsed.ok) return parsed;
  const { kinds, agreedOn, under14, guardianName, guardianCheck } = parsed.value;

  await prisma.consentRecord.createMany({
    data: kinds.map(({ kind, agreed }) => ({
      kind,
      agreed,
      docVersion: CONSENT_DOC_VERSION,
      channel: "PAPER" as const,
      studentId: student.id,
      agreedOn,
      under14,
      guardianName,
      guardianCheck,
      recordedById: session.user.id,
    })),
  });
  revalidatePath(`/students/${student.id}`);
  revalidatePath("/privacy");
  return { ok: true };
}
