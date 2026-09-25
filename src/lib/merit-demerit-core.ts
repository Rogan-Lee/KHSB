// 상벌점 코어 — 웹 서버 액션(src/actions/merit-demerit.ts)과 모바일 API
// (/api/mobile/v1/staff/merits) 가 같은 검증·저장 로직을 쓴다.
// 인증·권한·revalidatePath 는 호출 측 책임.

import { z } from "zod";

import { MeritType } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

export const meritSchema = z.object({
  studentId: z.string(),
  date: z.string(),
  type: z.nativeEnum(MeritType),
  points: z.coerce.number().min(1).max(100),
  reason: z.string().min(1, "사유를 입력하세요"),
  category: z.string().optional(),
});

export const meritUpdateSchema = meritSchema.omit({ studentId: true });

export type MeritInput = z.infer<typeof meritSchema>;
export type MeritUpdateInput = z.infer<typeof meritUpdateSchema>;

/** 상벌점 1건 생성 (date "YYYY-MM-DD" → @db.Date UTC 자정) */
export function createMeritRecord(data: MeritInput, createdById: string) {
  return prisma.meritDemerit.create({
    data: {
      studentId: data.studentId,
      date: new Date(data.date),
      type: data.type,
      points: data.points,
      reason: data.reason,
      category: data.category || null,
      createdById,
    },
  });
}

/** 상벌점 1건 수정. 없으면 null */
export async function updateMeritRecord(id: string, data: MeritUpdateInput) {
  const record = await prisma.meritDemerit.findUnique({ where: { id } });
  if (!record) return null;

  await prisma.meritDemerit.update({
    where: { id },
    data: {
      date: new Date(data.date),
      type: data.type,
      points: data.points,
      reason: data.reason,
      category: data.category || null,
    },
  });
  return record;
}

/** 상벌점 1건 삭제. 없으면 null, 있으면 삭제 전 기록 */
export async function deleteMeritRecord(id: string) {
  const record = await prisma.meritDemerit.findUnique({ where: { id } });
  if (!record) return null;

  await prisma.meritDemerit.delete({ where: { id } });
  return record;
}
